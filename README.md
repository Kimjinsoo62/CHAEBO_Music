# MelodyScribe (채보하자)

오디오를 악보로 변환해 주는 데스크톱 웹 애플리케이션입니다. 오디오 파일을 업로드하거나 마이크로 녹음하면, 음원을 분석해 악보로 렌더링하고 재생·내보내기까지 지원합니다.

- **Backend**: FastAPI (Python 3.11) — Basic Pitch + Demucs 기반 전사 파이프라인
- **Frontend**: Next.js 16 / React 19 (정적 export), OSMD 악보 렌더링 + soundfont 재생
- **오디오 변환**: 번들 FFmpeg 사용

---

## ⚠️ FFmpeg 배치 (필수)

용량 문제로 FFmpeg 바이너리는 저장소에 포함되어 있지 **않습니다**. 클론 후 직접 배치해야 합니다.

1. [FFmpeg 공식 빌드](https://www.gyan.dev/ffmpeg/builds/) 등에서 Windows용 빌드를 내려받습니다.
2. 압축을 풀어 `ffmpeg.exe`, `ffprobe.exe`를 아래 경로에 둡니다.

```
CHAEBO_Music/
├── backend/
├── frontend/
└── ffmpeg/
    └── bin/
        ├── ffmpeg.exe      ← 여기에 배치
        └── ffprobe.exe     ← 여기에 배치
```

> 경로는 `backend/audio_processor.py`에서 `../ffmpeg/bin/`으로 하드코딩되어 있습니다. `start.bat`·`install.bat`도 이 경로를 PATH에 추가합니다. 폴더 구조를 그대로 맞춰 주세요.

---

## 설치

### 사전 요구사항
- **Python 3.11** (필수 — basic-pitch 의존성이 3.14와 호환되지 않습니다)
- **Node.js** (Next.js 빌드용)
- 위의 **FFmpeg 배치** 완료

### 빠른 설치 (Windows)

```bat
install.bat
```

`install.bat`이 수행하는 작업:
1. `backend/`에 Python 3.11 가상환경(`venv`) 생성
2. `pip install -r backend/requirements.txt`
3. `frontend/`에서 `npm install`

> 최초 풀(full) 모드 변환 시 Demucs 모델(`htdemucs`)이 자동으로 다운로드됩니다.

### 수동 설치

```bat
REM 백엔드
cd backend
py -3.11 -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

REM 프론트엔드
cd ..\frontend
npm install
```

---

## 실행

### 프로덕션 실행 (Windows)

```bat
start.bat
```

- 포트 8000을 정리하고, FFmpeg를 PATH에 추가한 뒤 `backend/run_app.py`를 실행합니다.
- `run_app.py`가 uvicorn 서버(`127.0.0.1:8000`)를 띄우고 Chrome을 `--app` 모드로 엽니다.
- **빌드된 프론트엔드(`frontend/out/`)를 백엔드가 직접 서빙**하므로, 먼저 프론트엔드를 빌드해야 합니다.

```bat
cd frontend
npm run build
```

### 개발 모드

프론트엔드와 백엔드를 각각 실행합니다.

```bat
REM 백엔드 (포트 8000)
cd backend
.\venv\Scripts\activate
python main.py

REM 프론트엔드 개발 서버 (포트 3000)
cd frontend
npm run dev
```

> 프론트엔드는 백엔드 URL을 `http://localhost:8000`으로 하드코딩하고 있습니다(`frontend/app/page.tsx`).

---

## 동작 방식

1. 프론트엔드가 오디오를 `POST /transcribe`로 전송 (`fast_mode` 플래그 포함)
2. 백엔드가 필요 시 WAV로 변환 (pydub + FFmpeg)
3. **빠른 모드**: 전처리 → Basic Pitch 단일 실행 → onset 필터 → 후처리
4. **풀 모드**: Demucs 음원 분리 → 전처리 → Basic Pitch 앙상블(3개 설정 투표) → onset 필터 → 후처리
5. MusicXML(Music21) + base64 MIDI로 변환
6. 프론트엔드가 악보 렌더링(OSMD) 및 재생(soundfont-player, church_organ)
