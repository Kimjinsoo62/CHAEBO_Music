"use client";

import { useState, useRef } from "react";
import SheetMusic from "../components/SheetMusic";
import FileUploader from "../components/FileUploader";
import MicrophoneRecorder from "../components/MicrophoneRecorder";
import MusicPlayer from "../components/MusicPlayer";
import DownloadButtons from "../components/DownloadButtons";

export default function Home() {
  const [musicXml, setMusicXml] = useState<string>("");
  const [midiBase64, setMidiBase64] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [fastMode, setFastMode] = useState(true);  // 빠른 모드 기본 활성화
  const sheetMusicRef = useRef<HTMLDivElement>(null);

  const handleTranscribe = async (file: File) => {
    setIsProcessing(true);
    setStatusMessage(fastMode
      ? "분석 중입니다... (빠른 모드, 약 5~10초)"
      : "분석 중입니다... (전체 모드: Demucs + 앙상블, 약 30초~1분)"
    );
    setMusicXml("");
    setMidiBase64("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fast_mode", fastMode.toString());

    try {
      // Assuming Backend runs on port 8000
      const response = await fetch("http://localhost:8000/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.musicxml) {
        setMusicXml(data.musicxml);
        setMidiBase64(data.midi_base64 || "");
        const coverageInfo = data.coverage !== undefined
          ? ` (오디오: ${data.audio_duration}초, 채보: ${data.midi_duration}초, 커버리지: ${data.coverage}%)`
          : "";
        setStatusMessage(`완료! ${data.note_count}개의 음표가 감지되었습니다.${coverageInfo}`);
      } else {
        setStatusMessage("악보 데이터를 생성하지 못했습니다.");
      }

    } catch (error) {
      console.error(error);
      setStatusMessage("오류가 발생했습니다. 서버가 켜져 있는지 확인해주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-slate-50">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex mb-8">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          MelodyScribe - Audio to Sheet Music
        </p>
      </div>

      <div className="w-full max-w-4xl flex flex-col gap-8">
        <section className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-center">오디오를 악보로 변환</h2>

          {/* 모드 선택 */}
          <div className="flex items-center justify-center gap-4 mb-4 p-3 bg-gray-100 rounded-lg">
            <span className={`text-sm ${fastMode ? 'text-gray-400' : 'font-bold text-blue-600'}`}>
              전체 모드
            </span>
            <button
              onClick={() => setFastMode(!fastMode)}
              disabled={isProcessing}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                fastMode ? 'bg-green-500' : 'bg-blue-500'
              } ${isProcessing ? 'opacity-50' : ''}`}
            >
              <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                fastMode ? 'left-8' : 'left-1'
              }`} />
            </button>
            <span className={`text-sm ${fastMode ? 'font-bold text-green-600' : 'text-gray-400'}`}>
              빠른 모드
            </span>
          </div>
          <p className="text-xs text-center text-gray-500 mb-4">
            {fastMode
              ? "빠른 모드: 기본 채보 (5~10초)"
              : "전체 모드: Demucs 소스분리 + 앙상블 (30초~1분, 더 정확)"
            }
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <FileUploader onTranscribe={handleTranscribe} isProcessing={isProcessing} />
            <MicrophoneRecorder onTranscribe={handleTranscribe} isProcessing={isProcessing} />
          </div>
          {statusMessage && (
            <p className={`mt-4 text-center font-medium ${isProcessing ? 'text-blue-500 animate-pulse' : 'text-gray-700'}`}>
              {statusMessage}
            </p>
          )}
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-lg min-h-[500px]">
          <div className="flex items-center justify-between mb-4 border-b pb-2">
            <h2 className="text-xl font-bold">악보 미리보기</h2>
            <DownloadButtons musicXml={musicXml} midiBase64={midiBase64} sheetMusicRef={sheetMusicRef} />
          </div>
          <MusicPlayer midiBase64={midiBase64} />
          <div ref={sheetMusicRef} className="w-full h-full mt-4">
            <SheetMusic musicXml={musicXml} />
          </div>
        </section>
      </div>
    </main>
  );
}
