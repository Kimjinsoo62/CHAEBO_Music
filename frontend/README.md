# MelodyScribe Frontend

MelodyScribe(채보하자)의 프론트엔드입니다. **Next.js 16 / React 19 / TypeScript / TailwindCSS 4** 기반이며, 정적 export(`output: 'export'`)로 빌드되어 백엔드(FastAPI)가 직접 서빙합니다.

> 전체 설치·실행·FFmpeg 배치 안내는 [루트 README](../README.md)를 참고하세요.

## 개발 서버

```bash
npm install
npm run dev      # http://localhost:3000
```

개발 모드에서는 백엔드(`http://localhost:8000`)가 함께 떠 있어야 변환이 동작합니다. 백엔드 URL은 `app/page.tsx`에 하드코딩되어 있습니다.

## 명령어

```bash
npm run dev      # 개발 서버 (포트 3000)
npm run build    # 정적 export → out/
npm run lint     # ESLint
```

> `output: 'export'` 설정이라 `next start`(SSR 서버)는 사용하지 않습니다. 프로덕션에서는 `npm run build` 결과물(`out/`)을 백엔드가 정적 파일로 서빙합니다.

## 구조

`app/page.tsx`가 오케스트레이터로 모든 상태(`musicXml`, `midiBase64`, `isProcessing`, `fastMode`)를 보유하고 하위 컴포넌트에 콜백/데이터를 전달합니다.

| 컴포넌트 (`components/`) | 역할 |
|---|---|
| `FileUploader` | 오디오 파일 업로드 → `POST /transcribe` |
| `MicrophoneRecorder` | 마이크 녹음 → `POST /transcribe` |
| `SheetMusic` | `musicXml`을 OSMD(opensheetmusicdisplay)로 악보 렌더링 |
| `MusicPlayer` | `midiBase64`를 `@tonejs/midi`로 파싱, soundfont-player(church_organ)로 재생 |
| `DownloadButtons` | MusicXML·MIDI 내보내기, html2canvas로 악보 PDF 캡처 |

## 주의

- 모든 컴포넌트는 클라이언트 사이드(`"use client"`)입니다.
- `@/*` 경로 별칭은 `frontend/*`를 가리킵니다.
- `soundfont-player`는 타입 정의가 없어 `@ts-ignore`를 사용합니다(`types/soundfont-player.d.ts` 참고).
