"use client";

import React, { useState, useRef } from 'react';

interface MicrophoneRecorderProps {
    onTranscribe: (file: File) => Promise<void>;
    isProcessing: boolean;
}

const MicrophoneRecorder: React.FC<MicrophoneRecorderProps> = ({ onTranscribe, isProcessing }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const startRecording = async () => {
        try {
            // 음악 녹음에 최적화된 오디오 설정
            // echoCancellation, noiseSuppression, autoGainControl은 음성 통화용이므로 비활성화
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: 48000 },           // 높은 샘플레이트
                    channelCount: { ideal: 1 },             // 모노
                    echoCancellation: { ideal: false },     // 에코 캔슬 OFF (음악 왜곡 방지)
                    noiseSuppression: { ideal: false },     // 노이즈 억제 OFF (음악 왜곡 방지)
                    autoGainControl: { ideal: false },      // 자동 게인 OFF (다이나믹 유지)
                }
            });

            // 가능한 최고 품질의 코덱 선택
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 128000  // 128kbps
            });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setAudioBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            // 1초마다 데이터 수집 (timeslice 설정)
            mediaRecorder.start(1000);
            setIsRecording(true);
            setAudioBlob(null);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('마이크 접근 오류:', err);
            alert('마이크 접근 권한이 필요합니다.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const handleTranscribe = () => {
        if (audioBlob) {
            const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
            onTranscribe(file);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-400 transition-colors">
            <h3 className="text-lg font-semibold text-gray-700">마이크로 녹음하기</h3>
            <p className="text-sm text-gray-500">마이크를 통해 음악을 녹음하세요</p>

            {isRecording && (
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                    <span className="text-red-500 font-mono text-lg">{formatTime(recordingTime)}</span>
                </div>
            )}

            <div className="flex gap-3">
                {!isRecording ? (
                    <button
                        onClick={startRecording}
                        disabled={isProcessing}
                        className={`px-6 py-2 rounded-full font-bold text-white transition-all
                            ${isProcessing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-red-500 to-pink-600 hover:shadow-lg hover:scale-105 active:scale-95'
                            }`}
                    >
                        녹음 시작
                    </button>
                ) : (
                    <button
                        onClick={stopRecording}
                        className="px-6 py-2 rounded-full font-bold text-white bg-gray-600 hover:bg-gray-700 transition-all hover:shadow-lg"
                    >
                        녹음 중지
                    </button>
                )}
            </div>

            {audioBlob && !isRecording && (
                <div className="flex flex-col items-center gap-3 mt-2">
                    <audio controls src={URL.createObjectURL(audioBlob)} className="w-full max-w-xs" />
                    <button
                        onClick={handleTranscribe}
                        disabled={isProcessing}
                        className={`px-6 py-2 rounded-full font-bold text-white transition-all
                            ${isProcessing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:shadow-lg hover:scale-105 active:scale-95'
                            }`}
                    >
                        {isProcessing ? '변환 중...' : '악보로 변환하기'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default MicrophoneRecorder;
