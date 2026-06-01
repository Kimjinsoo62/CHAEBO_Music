# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MelodyScribe (채보하자) is an audio-to-sheet-music transcription application. Users upload audio files or record via microphone, and the app converts them to rendered sheet music with playback and export functionality. The UI is in Korean.

## Architecture

**Frontend** (`frontend/`): Next.js 16 with React 19, TypeScript, TailwindCSS 4
- Uses `output: 'export'` (static export to `frontend/out/`) — no SSR
- `@/*` path alias maps to `frontend/*`
- All components are client-side (`"use client"`)
- `soundfont-player` has no TypeScript types (uses `@ts-ignore`)

**Backend** (`backend/`): FastAPI (Python 3.11) with `venv/`
- Single endpoint: `POST /transcribe` — accepts audio file + `fast_mode` boolean
- In production, serves the built frontend from `frontend/out/` via static file mounting and catch-all route
- `audio_processor.py` contains the full transcription pipeline (~690 lines)

**FFmpeg** (`ffmpeg/`): Bundled FFmpeg binaries for audio format conversion. Path set explicitly in `audio_processor.py` (not via system PATH).

### Data Flow
1. Frontend uploads audio to `POST /transcribe` with `fast_mode` form field
2. Backend converts to WAV if needed (pydub + FFmpeg)
3. **Fast mode**: Preprocess → Basic Pitch (single run) → onset filter → post-process
4. **Full mode**: Demucs source separation → preprocess → Basic Pitch ensemble (3 configs with voting) → onset filter → post-process
5. Converts to MusicXML (via Music21) + base64 MIDI
6. Frontend renders sheet music (OSMD) and enables playback (soundfont-player with church_organ)

### Audio Processing Pipeline (`audio_processor.py`)
The pipeline has distinct stages, each logged with Korean `[태그]` prefixes:
- **Source separation**: Demucs `htdemucs` model (GPU if available) — removes drums/bass, keeps vocals+other
- **Preprocessing**: High-pass filter (60Hz) → noise reduction (noisereduce) → normalization
- **Transcription**: Basic Pitch ML model. Ensemble mode runs 3 configs (sensitive/balanced/conservative) and keeps notes with ≥2 votes
- **Onset filtering**: Librosa onset detection removes notes without clear attacks (harmonics/sustain artifacts)
- **Post-processing**: Remove short notes → merge adjacent same-pitch notes → remove duplicates → quantize to 16th-note grid at 120 BPM

### Frontend Component Relationships
Components live in `frontend/components/` (not `app/components/`). `app/page.tsx` is the orchestrator — holds all state (`musicXml`, `midiBase64`, `isProcessing`, `fastMode`) and passes callbacks/data down:
- `FileUploader` / `MicrophoneRecorder` → call `handleTranscribe(file)` → `POST /transcribe`
- `SheetMusic` ← receives `musicXml` string, renders via OSMD
- `MusicPlayer` ← receives `midiBase64`, parses with `@tonejs/midi`, plays via `soundfont-player`
- `DownloadButtons` ← receives both + `sheetMusicRef` for PDF capture via `html2canvas`

## Development Commands

### Quick Start (Windows)
```bash
install.bat    # Create venv (Python 3.11), pip install, npm install
start.bat      # Kill port 8000, activate venv, launch run_app.py (backend + Chrome app mode)
```

### Frontend
```bash
cd frontend
npm run dev          # Dev server at localhost:3000
npm run build        # Static export to out/
npm run lint         # ESLint
```

### Backend
```bash
cd backend
py -3.11 -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python main.py       # Server at localhost:8000
```

### Full Stack Dev
Run both servers: frontend `npm run dev` (port 3000) + backend `python main.py` (port 8000). Frontend hardcodes backend URL as `http://localhost:8000` (see `app/page.tsx`).

### Production Run
`run_app.py` is the production entry point (invoked by `start.bat`): starts uvicorn in a daemon thread on `127.0.0.1:8000`, then launches Chrome in `--app` mode (falls back to default browser). The backend serves the pre-built `frontend/out/`, so run `npm run build` first. Note: `npm run start` (`next start`) is unavailable — `output: 'export'` produces a static bundle, not a Next server.

## Important Constraints

- **Python 3.11 required** — basic-pitch dependencies incompatible with 3.14
- **FFmpeg path**: Hardcoded in `audio_processor.py` lines 17-19 pointing to `../ffmpeg/bin/`. Batch files also prepend it to PATH.
- **TensorFlow warnings**: `start.bat` sets `TF_CPP_MIN_LOG_LEVEL=3` and `TF_ENABLE_ONEDNN_OPTS=0`
- **Demucs model**: Lazy-loaded and cached globally (`_demucs_model`). First full-mode transcription triggers download/load
- **No tests**: No test suite exists. Two sample audio files at the repo root (`단선율.mp3` = monophonic, `복음.mp3`) are the de facto manual-test inputs for exercising the transcription pipeline
- **Static export**: `next.config.ts` uses `output: 'export'` — no API routes or SSR features available in frontend
