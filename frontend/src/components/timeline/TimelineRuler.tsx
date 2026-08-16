import React, { useRef } from 'react';
import { useTimeline } from '../../context/TimelineContext';

interface TimelineRulerProps {
    width: number;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ width }) => {
    const { project, playheadTime, seek, selectClip } = useTimeline();
    const rulerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    const zoom = project.zoom; // pixels per second
    const totalSeconds = project.duration;

    // Determine ruler step interval based on zoom factor
    let majorInterval = 10; // seconds
    let minorInterval = 1;

    if (zoom >= 150) {
        majorInterval = 1;
        minorInterval = 0.2;
    } else if (zoom >= 80) {
        majorInterval = 2;
        minorInterval = 0.5;
    } else if (zoom >= 40) {
        majorInterval = 5;
        minorInterval = 1;
    } else if (zoom >= 20) {
        majorInterval = 10;
        minorInterval = 2;
    } else {
        majorInterval = 30;
        minorInterval = 5;
    }

    const formatTimecode = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!rulerRef.current) return;
        selectClip(null);
        isDraggingRef.current = true;
        rulerRef.current.setPointerCapture(e.pointerId);

        const rect = rulerRef.current.getBoundingClientRect();
        // Accurate calculation considering scroll position
        const clickX = (e.clientX - rect.left);
        const time = Math.max(0, clickX / zoom);
        seek(time);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current || !rulerRef.current) return;
        const rect = rulerRef.current.getBoundingClientRect();
        const clickX = (e.clientX - rect.left);
        const time = Math.max(0, clickX / zoom);
        seek(time);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDraggingRef.current && rulerRef.current) {
            isDraggingRef.current = false;
            try {
                rulerRef.current.releasePointerCapture(e.pointerId);
            } catch {
                // Ignore
            }
        }
    };

    const rulerWidth = Math.max(width, totalSeconds * zoom);

    // Generate tick marks
    const ticks = [];
    const totalTicks = Math.ceil(totalSeconds / minorInterval);

    for (let i = 0; i <= totalTicks; i++) {
        const time = i * minorInterval;
        const x = time * zoom;
        const isMajor = Math.abs(time % majorInterval) < 0.001;

        ticks.push(
            <div
                key={i}
                className="absolute top-0 flex flex-col justify-end pointer-events-none select-none"
                style={{ left: `${x}px` }}
            >
                {isMajor && (
                    <span className="text-[9px] font-mono text-zinc-400 font-bold mb-1 -translate-x-1/2">
                        {formatTimecode(time)}
                    </span>
                )}
                <div
                    className={`w-px ${
                        isMajor ? 'h-3 bg-zinc-400' : 'h-1.5 bg-zinc-700'
                    }`}
                />
            </div>
        );
    }

    const playheadX = playheadTime * zoom;

    return (
        <div
            ref={rulerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative h-8 bg-zinc-950 border-b border-white/10 cursor-pointer select-none overflow-visible"
            style={{ width: `${rulerWidth}px` }}
        >
            {/* Background Grid Ticks */}
            {ticks}

            {/* Loop Region In/Out Overlay */}
            {project.isLooping && project.loopStart !== null && project.loopEnd !== null && (
                <div
                    className="absolute top-0 bottom-0 bg-yellow-400/15 border-l-2 border-r-2 border-yellow-400 pointer-events-none"
                    style={{
                        left: `${project.loopStart * zoom}px`,
                        width: `${(project.loopEnd - project.loopStart) * zoom}px`,
                    }}
                />
            )}

            {/* Playhead Needle Head */}
            <div
                className="absolute top-0 z-30 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-transform duration-75 ease-out"
                style={{ left: `${playheadX}px` }}
            >
                <div className="w-3.5 h-3.5 bg-yellow-400 rotate-45 -translate-y-2 rounded-sm shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
            </div>
        </div>
    );
};
