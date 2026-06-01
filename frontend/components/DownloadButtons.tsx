"use client";

import React, { RefObject, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface DownloadButtonsProps {
    musicXml: string;
    midiBase64: string;
    sheetMusicRef: RefObject<HTMLDivElement | null>;
}

const DownloadButtons: React.FC<DownloadButtonsProps> = ({ musicXml, midiBase64, sheetMusicRef }) => {
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const downloadMusicXml = () => {
        const blob = new Blob([musicXml], { type: 'application/vnd.recordare.musicxml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'score.musicxml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadMidi = () => {
        const binaryString = atob(midiBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'score.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadPdf = async () => {
        if (!sheetMusicRef.current) return;

        // Find the actual OSMD container inside
        const osmdContainer = sheetMusicRef.current.querySelector('#osmd-container') as HTMLElement;
        const targetElement = osmdContainer || sheetMusicRef.current;

        setIsGeneratingPdf(true);
        try {
            const canvas = await html2canvas(targetElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                removeContainer: true,
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            // A4 size in mm
            const pdfWidth = 210;
            const pdfHeight = 297;

            // Calculate scaling to fit width
            const ratio = pdfWidth / (imgWidth / 2);
            const scaledHeight = (imgHeight / 2) * ratio;

            const pdf = new jsPDF({
                orientation: scaledHeight > pdfHeight ? 'portrait' : 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            // If content is taller than one page, we need multiple pages
            let yPosition = 10;
            const pageHeight = pdfHeight - 20; // margins
            const contentHeight = scaledHeight;

            if (contentHeight <= pageHeight) {
                pdf.addImage(imgData, 'PNG', 10, yPosition, pdfWidth - 20, scaledHeight);
            } else {
                // Multi-page PDF
                const pageCount = Math.ceil(contentHeight / pageHeight);
                for (let i = 0; i < pageCount; i++) {
                    if (i > 0) pdf.addPage();
                    const sourceY = (i * pageHeight / ratio) * 2;
                    const sourceHeight = Math.min((pageHeight / ratio) * 2, imgHeight - sourceY);

                    // Create a temporary canvas for this section
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = imgWidth;
                    tempCanvas.height = sourceHeight;
                    const ctx = tempCanvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceHeight, 0, 0, imgWidth, sourceHeight);
                        const sectionData = tempCanvas.toDataURL('image/png');
                        pdf.addImage(sectionData, 'PNG', 10, 10, pdfWidth - 20, (sourceHeight / 2) * ratio);
                    }
                }
            }

            pdf.save('score.pdf');
        } catch (error) {
            console.error('PDF 생성 오류:', error);
            alert('PDF 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    if (!musicXml && !midiBase64) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {musicXml && (
                <>
                    <button
                        onClick={downloadPdf}
                        disabled={isGeneratingPdf}
                        className={`px-3 py-1.5 text-white rounded-lg font-medium transition-all hover:shadow-md flex items-center gap-1.5 text-sm
                            ${isGeneratingPdf ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        {isGeneratingPdf ? '생성중...' : 'PDF'}
                    </button>
                    <button
                        onClick={downloadMusicXml}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-all hover:shadow-md flex items-center gap-1.5 text-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        MusicXML
                    </button>
                </>
            )}
            {midiBase64 && (
                <button
                    onClick={downloadMidi}
                    className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all hover:shadow-md flex items-center gap-1.5 text-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    MIDI
                </button>
            )}
        </div>
    );
};

export default DownloadButtons;
