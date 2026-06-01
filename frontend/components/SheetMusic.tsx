"use client";

import React, { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

interface SheetMusicProps {
  musicXml: string;
}

const SheetMusic: React.FC<SheetMusicProps> = ({ musicXml }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (!musicXml || !containerRef.current) return;

    const renderSheet = async () => {
      // Clear previous
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      // Initialize OSMD
      const osmd = new OpenSheetMusicDisplay(containerRef.current!, {
        autoResize: true,
        backend: 'svg',
        drawingParameters: 'compacttight', // Compact look
      });
      osmdRef.current = osmd;

      try {
        await osmd.load(musicXml);
        osmd.render();
        setIsRendered(true);
      } catch (e) {
        console.error("OSMD Render error:", e);
      }
    };

    renderSheet();

    // Cleanup
    return () => {
      // osmd cleanup if needed
    };
  }, [musicXml]);

  return (
    <div className="w-full h-full min-h-[400px] bg-white p-4 rounded-lg shadow-inner overflow-auto">
      <div id="osmd-container" ref={containerRef} className="w-full" />
      {!isRendered && musicXml && <p className="text-gray-500 text-center">Rendering...</p>}
      {!musicXml && <p className="text-gray-400 text-center mt-10">악보 데이터가 없습니다.</p>}
    </div>
  );
};

export default SheetMusic;
