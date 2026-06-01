"use client";

import React, { useState } from 'react';

interface FileUploaderProps {
    onTranscribe: (file: File) => Promise<void>;
    isProcessing: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onTranscribe, isProcessing }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = () => {
        if (selectedFile) {
            onTranscribe(selectedFile);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 transition-colors">
            <h3 className="text-lg font-semibold text-gray-700">오디오 파일 업로드</h3>
            <p className="text-sm text-gray-500">MP3, WAV 파일을 선택하세요</p>

            <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-violet-50 file:text-violet-700
          hover:file:bg-violet-100"
            />

            <button
                onClick={handleSubmit}
                disabled={!selectedFile || isProcessing}
                className={`px-6 py-2 rounded-full font-bold text-white transition-all
            ${!selectedFile || isProcessing
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:shadow-lg scale-105 active:scale-95'
                    }`}
            >
                {isProcessing ? '변환 중...' : '악보로 변환하기'}
            </button>
        </div>
    );
};

export default FileUploader;
