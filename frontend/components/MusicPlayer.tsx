"use client";

import React, { useState, useRef, useEffect } from 'react';
// @ts-ignore
import Soundfont from 'soundfont-player';

interface MusicPlayerProps {
    midiBase64: string;
}

interface NoteEvent {
    time: number;
    midi: number;
    duration: number;
    velocity: number;
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({ midiBase64 }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoadingInstrument, setIsLoadingInstrument] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const instrumentRef = useRef<any>(null);
    const notesRef = useRef<NoteEvent[]>([]);
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const activeNodesRef = useRef<any[]>([]);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!midiBase64) {
            setIsLoaded(false);
            return;
        }

        const loadMidi = async () => {
            try {
                const { Midi } = await import('@tonejs/midi');

                const binaryString = atob(midiBase64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const midi = new Midi(bytes.buffer);

                const allNotes: NoteEvent[] = [];
                midi.tracks.forEach((track) => {
                    track.notes.forEach((note) => {
                        allNotes.push({
                            time: note.time,
                            midi: note.midi,
                            duration: note.duration,
                            velocity: note.velocity,
                        });
                    });
                });

                allNotes.sort((a, b) => a.time - b.time);
                notesRef.current = allNotes;

                // duration 유효성 검사
                const midiDuration = midi.duration;
                if (isFinite(midiDuration) && midiDuration > 0) {
                    setDuration(midiDuration);
                    setIsLoaded(true);
                    console.log(`Loaded ${allNotes.length} notes, duration: ${midiDuration}s`);
                } else if (allNotes.length > 0) {
                    // MIDI duration이 유효하지 않으면 노트 기반으로 계산
                    const lastNote = allNotes[allNotes.length - 1];
                    const calculatedDuration = lastNote.time + lastNote.duration;
                    setDuration(calculatedDuration);
                    setIsLoaded(true);
                    console.log(`Loaded ${allNotes.length} notes, calculated duration: ${calculatedDuration}s`);
                } else {
                    console.warn('MIDI에 재생할 노트가 없습니다.');
                    setIsLoaded(false);
                }
            } catch (error) {
                console.error('MIDI 로드 오류:', error);
                setIsLoaded(false);
            }
        };

        loadMidi();

        return () => {
            stopPlayback();
        };
    }, [midiBase64]);

    const stopPlayback = () => {
        timeoutsRef.current.forEach(t => clearTimeout(t));
        timeoutsRef.current = [];

        activeNodesRef.current.forEach(node => {
            try { node.stop(); } catch (e) {}
        });
        activeNodesRef.current = [];

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        setCurrentTime(0);
        setIsPlaying(false);
        pausedTimeRef.current = 0;
    };

    const handlePlay = async () => {
        if (!isLoaded) return;

        if (isPlaying) {
            stopPlayback();
            return;
        }

        // Create AudioContext on user gesture
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext();
        }

        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        // Load instrument if not loaded
        if (!instrumentRef.current) {
            setIsLoadingInstrument(true);
            try {
                instrumentRef.current = await Soundfont.instrument(
                    audioContextRef.current,
                    'church_organ',
                    { gain: 3 }
                );
            } catch (error) {
                console.error('악기 로드 오류:', error);
                setIsLoadingInstrument(false);
                return;
            }
            setIsLoadingInstrument(false);
        }

        console.log('AudioContext state:', audioContextRef.current.state);

        const startOffset = pausedTimeRef.current;
        startTimeRef.current = Date.now() - (startOffset * 1000);

        const notes = notesRef.current;
        const instrument = instrumentRef.current;

        console.log(`Playing ${notes.length} notes`);

        notes.forEach((noteEvent) => {
            const noteTime = noteEvent.time - startOffset;
            if (noteTime >= 0) {
                const timeout = setTimeout(() => {
                    if (instrument && audioContextRef.current) {
                        const node = instrument.play(
                            noteEvent.midi.toString(),
                            audioContextRef.current.currentTime,
                            {
                                duration: noteEvent.duration,
                                gain: noteEvent.velocity * 2,
                            }
                        );
                        if (node) activeNodesRef.current.push(node);
                    }
                }, noteTime * 1000);
                timeoutsRef.current.push(timeout);
            }
        });

        const endTimeout = setTimeout(() => {
            stopPlayback();
        }, (duration - startOffset) * 1000 + 1000);
        timeoutsRef.current.push(endTimeout);

        intervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            setCurrentTime(Math.min(elapsed, duration));
        }, 100);

        setIsPlaying(true);
    };

    const formatTime = (seconds: number) => {
        // 유효하지 않은 값 처리
        if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) {
            return '0:00';
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    if (!midiBase64) {
        return null;
    }

    return (
        <div className="flex flex-col items-center gap-3 p-4 bg-gray-100 rounded-xl">
            <div className="flex items-center gap-4">
                <button
                    onClick={handlePlay}
                    disabled={!isLoaded || isLoadingInstrument}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold transition-all
                        ${!isLoaded || isLoadingInstrument
                            ? 'bg-gray-400 cursor-not-allowed'
                            : isPlaying
                                ? 'bg-yellow-500 hover:bg-yellow-600'
                                : 'bg-green-500 hover:bg-green-600'
                        }`}
                >
                    {isLoadingInstrument ? '...' : isPlaying ? '❚❚' : '▶'}
                </button>
                <button
                    onClick={stopPlayback}
                    disabled={!isLoaded}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold transition-all
                        ${!isLoaded
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-red-500 hover:bg-red-600'
                        }`}
                >
                    ■
                </button>
                <span className="text-sm font-mono text-gray-600 min-w-[80px]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>
            </div>
            <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-500 transition-all duration-100"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                />
            </div>
            {isLoadingInstrument && (
                <p className="text-sm text-blue-500">피아노 로딩 중...</p>
            )}
        </div>
    );
};

export default MusicPlayer;
