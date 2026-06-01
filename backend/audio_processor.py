import os
import io
import base64
import librosa
import numpy as np
import pretty_midi
import music21
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH
from pydub import AudioSegment
import noisereduce as nr
from scipy.signal import butter, filtfilt
import torch
import soundfile as sf

# Set FFmpeg path for pydub
FFMPEG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ffmpeg", "bin"))
AudioSegment.converter = os.path.join(FFMPEG_PATH, "ffmpeg.exe")
AudioSegment.ffprobe = os.path.join(FFMPEG_PATH, "ffprobe.exe")

# Demucs model cache
_demucs_model = None


def get_demucs_model():
    """Load Demucs model (cached for reuse)."""
    global _demucs_model
    if _demucs_model is None:
        print("[Demucs] 모델 로딩 중... (최초 1회)")
        from demucs.pretrained import get_model
        from demucs.apply import BagOfModels
        _demucs_model = get_model('htdemucs')
        _demucs_model.eval()
        if torch.cuda.is_available():
            _demucs_model.cuda()
            print("[Demucs] GPU 사용")
        else:
            print("[Demucs] CPU 사용")
    return _demucs_model


def separate_sources(audio: np.ndarray, sr: int) -> dict:
    """
    Separate audio into stems using Demucs.
    Returns dict with keys: 'drums', 'bass', 'vocals', 'other'
    """
    from demucs.apply import apply_model

    model = get_demucs_model()

    # Demucs expects stereo at 44100Hz
    # Resample if needed
    if sr != 44100:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=44100)

    # Convert mono to stereo
    if audio.ndim == 1:
        audio = np.stack([audio, audio])

    # Convert to torch tensor: (batch, channels, samples)
    audio_tensor = torch.tensor(audio, dtype=torch.float32).unsqueeze(0)

    if torch.cuda.is_available():
        audio_tensor = audio_tensor.cuda()

    # Apply model
    with torch.no_grad():
        sources = apply_model(model, audio_tensor, split=True, overlap=0.25, progress=False)

    # sources shape: (batch, num_sources, channels, samples)
    sources = sources.squeeze(0).cpu().numpy()

    # Get source names from model
    source_names = model.sources  # ['drums', 'bass', 'other', 'vocals']

    # Convert back to mono and resample to original sr
    result = {}
    for i, name in enumerate(source_names):
        stem = sources[i].mean(axis=0)  # stereo to mono
        if sr != 44100:
            stem = librosa.resample(stem, orig_sr=44100, target_sr=sr)
        result[name] = stem

    return result


def separate_melody(audio: np.ndarray, sr: int) -> np.ndarray:
    """
    Extract melody components from audio by combining vocals + other stems.
    This removes drums and bass for cleaner melody transcription.
    """
    print("[소스분리] Demucs로 음원 분리 중...")
    stems = separate_sources(audio, sr)

    # Combine vocals + other + bass for polyphony (exclude drums only)
    melody = stems['vocals'] + stems['other'] + stems['bass']

    print(f"[소스분리] 완료 - drums 제거, vocals/other/bass 결합")

    return librosa.util.normalize(melody)


def highpass_filter(audio: np.ndarray, sr: int, cutoff: int = 80) -> np.ndarray:
    """Apply high-pass filter to remove low frequency noise (hum, rumble)."""
    nyquist = sr / 2
    normalized_cutoff = cutoff / nyquist
    b, a = butter(4, normalized_cutoff, btype='high')
    return filtfilt(b, a, audio)


def reduce_noise(audio: np.ndarray, sr: int, strength: float = 0.5) -> np.ndarray:
    """Apply noise reduction using noisereduce library."""
    # Use stationary noise reduction - good for consistent background noise
    reduced = nr.reduce_noise(
        y=audio,
        sr=sr,
        stationary=True,
        prop_decrease=strength,  # How much to reduce noise (0.0-1.0)
        n_fft=2048,
        hop_length=512,
    )
    return reduced


def preprocess_audio(audio: np.ndarray, sr: int, light_mode: bool = False) -> np.ndarray:
    """
    Complete audio preprocessing pipeline:
    1. High-pass filter (remove low frequency noise)
    2. Noise reduction (optional in light mode)
    3. Normalization

    Args:
        light_mode: If True, skip aggressive processing to preserve signal
    """
    print("[전처리] 하이패스 필터 적용 중...")
    audio = highpass_filter(audio, sr, cutoff=25)  # 25Hz (피아노 최저음 A0=27.5Hz 보존)

    if not light_mode:
        print("[전처리] 노이즈 제거 중...")
        audio = reduce_noise(audio, sr, strength=0.15)  # 화음 내성부 보존을 위해 약하게
    else:
        print("[전처리] 노이즈 제거 건너뜀 (라이트 모드)")

    print("[전처리] 정규화 중...")
    audio = librosa.util.normalize(audio)

    return audio

def convert_to_wav(file_path: str) -> str:
    """Convert audio file to WAV format if needed."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.webm', '.ogg', '.m4a', '.aac', '.flac']:
        wav_path = file_path.rsplit('.', 1)[0] + '.wav'
        audio = AudioSegment.from_file(file_path)
        audio.export(wav_path, format='wav')
        return wav_path
    return file_path


# ============== Onset-based Filtering ==============

def detect_onsets(audio: np.ndarray, sr: int) -> np.ndarray:
    """Detect onset times in audio using librosa."""
    # onset_detect returns frame indices, convert to times
    onset_frames = librosa.onset.onset_detect(
        y=audio,
        sr=sr,
        units='frames',
        hop_length=512,
        backtrack=True,
        pre_max=2,
        post_max=2,
        pre_avg=2,
        post_avg=4,
        delta=0.02,  # 화음 onset 감지를 위해 더 민감하게
        wait=4
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
    return onset_times


def filter_by_onset(audio: np.ndarray, sr: int, midi_data: pretty_midi.PrettyMIDI,
                    tolerance: float = 0.18) -> pretty_midi.PrettyMIDI:
    """
    Filter MIDI notes to keep only those with clear onsets in the audio.
    This removes harmonics, sustain artifacts, and false positives.

    Args:
        audio: Audio signal
        sr: Sample rate
        midi_data: MIDI data to filter
        tolerance: Time tolerance for matching onset to note (seconds)
    """
    print("[onset 필터] 어택 감지 중...")
    onset_times = detect_onsets(audio, sr)
    print(f"[onset 필터] {len(onset_times)}개의 어택 감지됨")

    original_count = sum(len(inst.notes) for inst in midi_data.instruments)

    for instrument in midi_data.instruments:
        filtered_notes = []
        for note in instrument.notes:
            # Check if there's an onset near this note's start time
            has_onset = any(
                abs(onset_time - note.start) <= tolerance
                for onset_time in onset_times
            )
            if has_onset:
                filtered_notes.append(note)

        instrument.notes = filtered_notes

    final_count = sum(len(inst.notes) for inst in midi_data.instruments)
    removed = original_count - final_count
    print(f"[onset 필터] {original_count}개 → {final_count}개 (배음/잔향 {removed}개 제거)")

    return midi_data


def remove_trailing_notes(midi_data: pretty_midi.PrettyMIDI, audio_duration: float,
                          margin: float = 0.15) -> pretty_midi.PrettyMIDI:
    """
    Remove notes that start near the end of the audio (likely artifacts).
    """
    cutoff_time = audio_duration - margin

    for instrument in midi_data.instruments:
        instrument.notes = [
            note for note in instrument.notes
            if note.start < cutoff_time
        ]

    return midi_data


# ============== Post-processing: Quantization ==============

def snap_to_grid(time: float, grid_size: float) -> float:
    """Snap a time value to the nearest grid point."""
    return round(time / grid_size) * grid_size


def get_grid_size(tempo: float = 120, subdivision: int = 16) -> float:
    """
    Calculate grid size in seconds based on tempo and subdivision.
    subdivision: 4 = quarter notes, 8 = eighth notes, 16 = sixteenth notes
    """
    beat_duration = 60.0 / tempo  # Duration of one beat in seconds
    return beat_duration / (subdivision / 4)


def quantize_note_times(midi_data: pretty_midi.PrettyMIDI, tempo: float = 120, subdivision: int = 16) -> pretty_midi.PrettyMIDI:
    """
    Quantize note start times and durations to a musical grid.
    """
    grid_size = get_grid_size(tempo, subdivision)
    min_duration = grid_size  # Minimum note duration is one grid unit

    for instrument in midi_data.instruments:
        for note in instrument.notes:
            # Snap start time to grid
            note.start = snap_to_grid(note.start, grid_size)
            # Snap end time to grid
            note.end = snap_to_grid(note.end, grid_size)
            # Ensure minimum duration
            if note.end - note.start < min_duration:
                note.end = note.start + min_duration

    return midi_data


def remove_short_notes(midi_data: pretty_midi.PrettyMIDI, min_duration: float = 0.05) -> pretty_midi.PrettyMIDI:
    """
    Remove notes that are too short (likely noise artifacts).
    min_duration: minimum note duration in seconds
    """
    for instrument in midi_data.instruments:
        instrument.notes = [
            note for note in instrument.notes
            if (note.end - note.start) >= min_duration
        ]

    return midi_data


def merge_close_notes(midi_data: pretty_midi.PrettyMIDI, time_threshold: float = 0.05) -> pretty_midi.PrettyMIDI:
    """
    Merge notes of the same pitch that are very close together.
    This handles cases where one note is incorrectly split into multiple notes.
    time_threshold: maximum gap between notes to merge (in seconds)
    """
    for instrument in midi_data.instruments:
        if not instrument.notes:
            continue

        # Sort notes by pitch, then by start time
        instrument.notes.sort(key=lambda n: (n.pitch, n.start))

        merged_notes = []
        i = 0

        while i < len(instrument.notes):
            current_note = instrument.notes[i]
            # Look for consecutive notes with same pitch
            while (i + 1 < len(instrument.notes) and
                   instrument.notes[i + 1].pitch == current_note.pitch and
                   instrument.notes[i + 1].start - current_note.end <= time_threshold):
                # Merge: extend current note to include next note
                next_note = instrument.notes[i + 1]
                current_note.end = next_note.end
                # Keep higher velocity
                current_note.velocity = max(current_note.velocity, next_note.velocity)
                i += 1

            merged_notes.append(current_note)
            i += 1

        instrument.notes = merged_notes
        # Re-sort by start time for proper playback
        instrument.notes.sort(key=lambda n: n.start)

    return midi_data


def remove_duplicate_notes(midi_data: pretty_midi.PrettyMIDI) -> pretty_midi.PrettyMIDI:
    """
    Remove duplicate notes (same pitch and nearly same start time).
    """
    for instrument in midi_data.instruments:
        if not instrument.notes:
            continue

        unique_notes = {}

        for note in instrument.notes:
            # Create a key based on pitch and quantized start time
            key = (note.pitch, round(note.start, 2))
            if key not in unique_notes or note.velocity > unique_notes[key].velocity:
                unique_notes[key] = note

        instrument.notes = list(unique_notes.values())

    return midi_data


def postprocess_midi(midi_data: pretty_midi.PrettyMIDI, tempo: float = 120) -> pretty_midi.PrettyMIDI:
    """
    Complete MIDI post-processing pipeline:
    1. Remove very short notes (noise)
    2. Merge close notes of same pitch
    3. Quantize to musical grid
    4. Remove duplicates (퀀타이즈 후 새 중복 제거, 높은 velocity 보존)
    """
    original_count = sum(len(inst.notes) for inst in midi_data.instruments)

    print("[후처리] 짧은 음표 제거 중...")
    midi_data = remove_short_notes(midi_data, min_duration=0.05)

    print("[후처리] 인접 음표 병합 중...")
    midi_data = merge_close_notes(midi_data, time_threshold=0.05)

    print("[후처리] 퀀타이제이션 적용 중 (16분음표 그리드)...")
    midi_data = quantize_note_times(midi_data, tempo=tempo, subdivision=16)

    print("[후처리] 중복 음표 제거 중...")
    midi_data = remove_duplicate_notes(midi_data)

    final_count = sum(len(inst.notes) for inst in midi_data.instruments)
    print(f"[후처리] 완료 - {original_count}개 → {final_count}개 음표 ({original_count - final_count}개 정리)")

    return midi_data


# ============== Multi-Model Ensemble ==============

# Ensemble configurations: (name, onset_threshold, frame_threshold, min_note_length)
ENSEMBLE_CONFIGS = [
    ("극민감", 0.2, 0.12, 50.0),   # Very sensitive: 화음 내 조용한 음 감지
    ("민감", 0.3, 0.18, 50.0),     # Sensitive: catches more notes
    ("균형", 0.4, 0.25, 58.0),     # Balanced: default settings
]


def run_single_transcription(audio_path: str, config: tuple) -> list:
    """
    Run Basic Pitch with a specific configuration.
    Returns list of (pitch, start_time, end_time, velocity) tuples.
    """
    name, onset_thresh, frame_thresh, min_note_len = config

    _, midi_data, _ = predict(
        audio_path,
        ICASSP_2022_MODEL_PATH,
        onset_threshold=onset_thresh,
        frame_threshold=frame_thresh,
        minimum_note_length=min_note_len,
        minimum_frequency=None,
        maximum_frequency=None
    )

    notes = []
    for instrument in midi_data.instruments:
        for note in instrument.notes:
            notes.append({
                'pitch': note.pitch,
                'start': round(note.start, 3),
                'end': round(note.end, 3),
                'velocity': note.velocity
            })

    return notes


def notes_match(note1: dict, note2: dict, time_tolerance: float = 0.1, pitch_tolerance: int = 0) -> bool:
    """Check if two notes are essentially the same."""
    pitch_match = abs(note1['pitch'] - note2['pitch']) <= pitch_tolerance
    start_match = abs(note1['start'] - note2['start']) <= time_tolerance
    return pitch_match and start_match


def ensemble_transcribe(audio_path: str, min_votes: int = 2) -> pretty_midi.PrettyMIDI:
    """
    Run multiple transcription configurations and combine results using voting.
    Notes that appear in at least min_votes configurations are kept.
    """
    print(f"[앙상블] {len(ENSEMBLE_CONFIGS)}개 설정으로 채보 중...")

    all_results = []
    for config in ENSEMBLE_CONFIGS:
        name = config[0]
        print(f"  - [{name}] 임계값: onset={config[1]}, frame={config[2]}")
        notes = run_single_transcription(audio_path, config)
        all_results.append(notes)
        print(f"    → {len(notes)}개 음표 감지")

    # Voting: count how many times each note appears across configurations
    print(f"[앙상블] 투표 집계 중 (최소 {min_votes}표 필요)...")

    # Use first result as reference and count votes
    voted_notes = []

    # Combine all notes from all results
    all_notes = []
    for result_idx, notes in enumerate(all_results):
        for note in notes:
            note['votes'] = 1
            note['source'] = result_idx
            all_notes.append(note)

    # Sort by start time and pitch for efficient matching
    all_notes.sort(key=lambda n: (n['start'], n['pitch']))

    # Group similar notes and count votes
    final_notes = []
    used = set()

    for i, note in enumerate(all_notes):
        if i in used:
            continue

        # Find all matching notes
        matching_indices = [i]
        combined_velocity = note['velocity']
        sources = {note['source']}

        for j in range(i + 1, len(all_notes)):
            if j in used:
                continue
            other = all_notes[j]

            # If too far in time, stop searching
            if other['start'] - note['start'] > 0.15:
                break

            if notes_match(note, other) and other['source'] not in sources:
                matching_indices.append(j)
                combined_velocity = max(combined_velocity, other['velocity'])
                sources.add(other['source'])

        vote_count = len(sources)

        # 2표 이상: 무조건 통과, 1표: velocity >= 80인 고신뢰 음표만 통과
        if vote_count >= min_votes or (vote_count == 1 and combined_velocity >= 80):
            # Calculate average timing from matching notes
            avg_start = np.mean([all_notes[idx]['start'] for idx in matching_indices])
            avg_end = np.mean([all_notes[idx]['end'] for idx in matching_indices])

            final_notes.append({
                'pitch': note['pitch'],
                'start': avg_start,
                'end': avg_end,
                'velocity': combined_velocity,
                'votes': vote_count
            })

            for idx in matching_indices:
                used.add(idx)

    # Create PrettyMIDI object
    midi_data = pretty_midi.PrettyMIDI()
    instrument = pretty_midi.Instrument(program=19)  # Church Organ (딜레이 긴 악기)

    for note_data in final_notes:
        note = pretty_midi.Note(
            velocity=note_data['velocity'],
            pitch=note_data['pitch'],
            start=note_data['start'],
            end=note_data['end']
        )
        instrument.notes.append(note)

    # Sort notes by start time
    instrument.notes.sort(key=lambda n: n.start)
    midi_data.instruments.append(instrument)

    total_from_configs = sum(len(r) for r in all_results)
    print(f"[앙상블] 완료 - 총 {total_from_configs}개 후보 → {len(final_notes)}개 확정 (합의율: {len(final_notes)*100/max(total_from_configs/len(ENSEMBLE_CONFIGS),1):.1f}%)")

    return midi_data

def process_audio(file_path: str, fast_mode: bool = False):
    """
    Processes audio to support 'Universal Instruments' and up to 6-note polyphony.
    Returns MusicXML for rendering.

    Args:
        file_path: Path to audio file
        fast_mode: If True, skip Demucs and ensemble for faster processing
    """
    import traceback

    print(f"\n{'='*50}")
    print(f"[시작] 오디오 처리: {os.path.basename(file_path)}")
    print(f"[모드] {'빠른 모드' if fast_mode else '전체 모드 (Demucs + 앙상블)'}")
    print(f"{'='*50}\n")

    try:
        # 0. Convert to WAV if needed (for webm, ogg, etc.)
        original_path = file_path
        file_path = convert_to_wav(file_path)
        converted = (file_path != original_path)
        print(f"[변환] WAV 변환: {'완료' if converted else '불필요'}")

        # 1. Load audio
        y, sr = librosa.load(file_path, sr=22050, mono=True)

        # Calculate audio duration and level
        audio_duration = len(y) / sr
        rms = np.sqrt(np.mean(y**2))
        max_amp = np.max(np.abs(y))
        print(f"[로드] 오디오 길이: {audio_duration:.2f}초")
        print(f"[로드] 오디오 레벨: RMS={rms:.4f}, Max={max_amp:.4f}")

        if audio_duration < 1.0:
            print("[경고] 오디오가 너무 짧습니다 (1초 미만)")

        if max_amp < 0.01:
            print("[경고] 오디오 레벨이 너무 낮습니다! 마이크 볼륨을 확인하세요.")

        # 2. Source separation (skip in fast mode)
        if fast_mode or audio_duration < 3.0:
            print("[소스분리] 건너뜀 (빠른 모드 또는 짧은 오디오)")
            y_melody = y
        else:
            try:
                y_melody = separate_melody(y, sr)
            except Exception as e:
                print(f"[소스분리] 실패, 원본 사용: {e}")
                traceback.print_exc()
                y_melody = y

        # 3. Apply preprocessing pipeline (highpass + noise reduction + normalize)
        # 빠른 모드에서는 라이트 전처리 (노이즈 제거 건너뜀)
        y_clean = preprocess_audio(y_melody, sr, light_mode=fast_mode)

        # 전처리 후 레벨 확인
        rms_after = np.sqrt(np.mean(y_clean**2))
        max_after = np.max(np.abs(y_clean))
        print(f"[전처리 후] 오디오 레벨: RMS={rms_after:.4f}, Max={max_after:.4f}")

        cleaned_path = file_path.replace(".", "_clean.")
        sf.write(cleaned_path, y_clean, sr)

        # 4. Transcription - onset 기반 감지 (배음/잔향 제거)
        if fast_mode:
            print("[채보] 단일 모드 (onset 기반)...")
            _, midi_data, _ = predict(
                cleaned_path,
                ICASSP_2022_MODEL_PATH,
                onset_threshold=0.25,  # 화음 감지를 위해 낮춤
                frame_threshold=0.15,  # 조용한 내성부 음표 감지
                minimum_note_length=50.0,  # 짧은 음표도 감지
                minimum_frequency=None,
                maximum_frequency=None
            )
        else:
            # Full mode: ensemble
            midi_data = ensemble_transcribe(cleaned_path, min_votes=2)

        # 5. Onset 기반 필터링 - 명확한 어택이 없는 음표 제거
        midi_data = filter_by_onset(y_clean, sr, midi_data)

        # 6. Post-processing (quantization, merge, cleanup) - 먼저 실행
        midi_data = postprocess_midi(midi_data, tempo=120)

        # 7. 끝부분 가짜 음표 제거 (마지막 0.5초) - 퀀타이제이션 후 실행
        print(f"[끝부분 제거] 오디오 길이: {audio_duration:.2f}초, 컷오프: {audio_duration - 0.5:.2f}초")
        before_count = sum(len(inst.notes) for inst in midi_data.instruments)
        midi_data = remove_trailing_notes(midi_data, audio_duration, margin=0.5)
        after_count = sum(len(inst.notes) for inst in midi_data.instruments)
        print(f"[끝부분 제거] {before_count}개 → {after_count}개 ({before_count - after_count}개 제거)")

    except Exception as e:
        print(f"\n[오류] 처리 중 에러 발생: {e}")
        traceback.print_exc()
        raise

    # 6. Convert to MusicXML via Music21
    # Save temporary MIDI file for music21 to read
    temp_midi_path = file_path + ".mid"
    midi_data.write(temp_midi_path)

    try:
        # Load MIDI into Music21
        score = music21.converter.parse(temp_midi_path)

        # Add tempo if not present
        if not score.flat.getElementsByClass('MetronomeMark'):
            tempo = music21.tempo.MetronomeMark(number=120)
            score.insert(0, tempo)

        # Write to MusicXML
        temp_xml_path = file_path + ".musicxml"
        score.write('musicxml', fp=temp_xml_path)

        with open(temp_xml_path, 'r', encoding='utf-8') as f:
            musicxml_content = f.read()

        # Cleanup
        if os.path.exists(temp_xml_path):
            os.remove(temp_xml_path)

    except Exception as e:
        import traceback
        print(f"MusicXML conversion error: {e}")
        traceback.print_exc()
        musicxml_content = ""
    
    # Also keep MIDI in case needed
    midi_buffer = io.BytesIO()
    midi_data.write(midi_buffer)
    midi_buffer.seek(0)
    midi_base64 = base64.b64encode(midi_buffer.read()).decode('ascii')
    
    # Cleanup temp files
    if os.path.exists(cleaned_path):
        os.remove(cleaned_path)
    if os.path.exists(temp_midi_path):
        os.remove(temp_midi_path)
    if converted and os.path.exists(file_path):
        os.remove(file_path)

    # Calculate MIDI duration (last note end time)
    midi_duration = 0
    if midi_data.instruments:
        for instrument in midi_data.instruments:
            for note in instrument.notes:
                note_end = note.start + note.duration
                if note_end > midi_duration:
                    midi_duration = note_end

    # Verification info
    note_count = len(midi_data.instruments[0].notes) if midi_data.instruments else 0
    print(f"[검증] 오디오 길이: {audio_duration:.2f}초")
    print(f"[검증] MIDI 길이: {midi_duration:.2f}초")
    print(f"[검증] 음표 개수: {note_count}")
    print(f"[검증] 커버리지: {(midi_duration / audio_duration * 100):.1f}%")

    return {
        "status": "success",
        "musicxml": musicxml_content,
        "midi_base64": midi_base64,
        "note_count": note_count,
        "audio_duration": round(audio_duration, 2),
        "midi_duration": round(midi_duration, 2),
        "coverage": round(midi_duration / audio_duration * 100, 1) if audio_duration > 0 else 0
    }
