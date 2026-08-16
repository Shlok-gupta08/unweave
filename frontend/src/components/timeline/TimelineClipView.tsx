import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Scissors, Copy, Trash2, Volume2 } from 'lucide-react';
import { drawWaveformToCanvas, getOrComputePeaks } from '../../utils/waveform';
import { useTimeline } from '../../context/TimelineContext';
import type { TimelineClip } from '../../types';

interface TimelineClipViewProps {
    clip: TimelineClip;
    zoom: number;
    isSelected: boolean;
    onSelect: (isMulti?: boolean) => void;
}

export const TimelineClipView: React.FC<TimelineClipViewProps> = ({
    clip,
    zoom,
    isSelected,
    onSelect,
}) => {
    const { moveClip, trimClip, splitClipAtPlayhead, duplicateClip, removeClip, setClipGain, project } = useTimeline();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [isHovered, setIsHovered] = useState(false);
    const [showGainSlider, setShowGainSlider] = useState(false);
    const [computedPeaks, setComputedPeaks] = useState<number[] | null>(clip.peaks && clip.peaks.length > 0 ? clip.peaks : null);

    // Interaction drag states
    const isDraggingBody = useRef(false);
    const isTrimmingLeft = useRef(false);
    const isTrimmingRight = useRef(false);
    const dragStartX = useRef(0);
    const initialStartTime = useRef(0);
    const initialOffset = useRef(0);
    const initialDuration = useRef(0);

    const clipLeft = clip.startTime * zoom;
    const clipWidth = Math.max(20, clip.duration * zoom);

    // Fallback compute peaks if missing
    useEffect(() => {
        if (clip.peaks && clip.peaks.length > 0) {
            setComputedPeaks(clip.peaks);
            return;
        }

        let isMounted = true;
        getOrComputePeaks(clip.audioUrl).then((peaks) => {
            if (isMounted && peaks && peaks.length > 0) {
                setComputedPeaks(peaks);
            }
        }).catch((err) => {
            console.warn('[TimelineClipView] Dynamic peaks computation fallback warning:', err);
        });

        return () => {
            isMounted = false;
        };
    }, [clip.peaks, clip.audioUrl]);

    // Render Canvas Waveform
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const startRatio = clip.originalDuration > 0 ? clip.offset / clip.originalDuration : 0;
        const endRatio = clip.originalDuration > 0 ? (clip.offset + clip.duration) / clip.originalDuration : 1;

        // Ensure canvas pixel dimensions match rendered layout
        canvas.width = Math.max(20, Math.floor(clipWidth));
        canvas.height = 48;

        const activePeaks = computedPeaks || clip.peaks;
        if (activePeaks && activePeaks.length > 0) {
            drawWaveformToCanvas(canvas, activePeaks, clip.color, {
                startRatio,
                endRatio,
                gain: clip.gain,
                barWidth: 2,
                barGap: 1,
            });
        }
    }, [computedPeaks, clip.peaks, clip.color, clip.offset, clip.duration, clip.originalDuration, clip.gain, clipWidth]);

    const snapTime = useCallback((time: number): number => {
        if (!project.isSnappingEnabled) return time;
        const interval = project.snapInterval || 0.5;
        return Math.round(time / interval) * interval;
    }, [project.isSnappingEnabled, project.snapInterval]);

    // Handle Clip Body Move
    const handleBodyPointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.trim-handle, .clip-action')) return;
        e.stopPropagation();
        const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
        onSelect(isMulti);

        isDraggingBody.current = true;
        dragStartX.current = e.clientX;
        initialStartTime.current = clip.startTime;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleBodyPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingBody.current) return;
        const deltaX = e.clientX - dragStartX.current;
        const deltaTime = deltaX / zoom;
        const rawNewStart = initialStartTime.current + deltaTime;
        const newStart = Math.max(0, snapTime(rawNewStart));
        moveClip(clip.id, newStart);
    };

    const handleBodyPointerUp = (e: React.PointerEvent) => {
        if (isDraggingBody.current) {
            isDraggingBody.current = false;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // Ignore
            }
        }
    };

    // Handle Left Trim
    const handleLeftTrimDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        isTrimmingLeft.current = true;
        dragStartX.current = e.clientX;
        initialStartTime.current = clip.startTime;
        initialOffset.current = clip.offset;
        initialDuration.current = clip.duration;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleLeftTrimMove = (e: React.PointerEvent) => {
        if (!isTrimmingLeft.current) return;
        const deltaX = e.clientX - dragStartX.current;
        const deltaTime = deltaX / zoom;

        const maxLeftDelta = initialDuration.current - 0.2;
        const clampedDelta = Math.min(maxLeftDelta, Math.max(-initialOffset.current, deltaTime));

        const newStartTime = Math.max(0, initialStartTime.current + clampedDelta);
        const newOffset = Math.max(0, initialOffset.current + clampedDelta);
        const newDuration = Math.max(0.2, initialDuration.current - clampedDelta);

        trimClip(clip.id, newOffset, newDuration, newStartTime);
    };

    const handleLeftTrimUp = (e: React.PointerEvent) => {
        if (isTrimmingLeft.current) {
            isTrimmingLeft.current = false;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // Ignore
            }
        }
    };

    // Handle Right Trim
    const handleRightTrimDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        isTrimmingRight.current = true;
        dragStartX.current = e.clientX;
        initialDuration.current = clip.duration;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleRightTrimMove = (e: React.PointerEvent) => {
        if (!isTrimmingRight.current) return;
        const deltaX = e.clientX - dragStartX.current;
        const deltaTime = deltaX / zoom;

        const maxAvailableDuration = clip.originalDuration - clip.offset;
        const newDuration = Math.max(0.2, Math.min(maxAvailableDuration, initialDuration.current + deltaTime));

        trimClip(clip.id, clip.offset, newDuration);
    };

    const handleRightTrimUp = (e: React.PointerEvent) => {
        if (isTrimmingRight.current) {
            isTrimmingRight.current = false;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // Ignore
            }
        }
    };

    return (
        <div
            onPointerDown={handleBodyPointerDown}
            onPointerMove={handleBodyPointerMove}
            onPointerUp={handleBodyPointerUp}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setShowGainSlider(false); }}
            className={`absolute top-1 bottom-1 rounded-xl border select-none transition-shadow duration-150 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing group ${
                isSelected
                    ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)] z-20'
                    : 'border-white/10 hover:border-white/30 z-10'
            }`}
            style={{
                left: `${clipLeft}px`,
                width: `${clipWidth}px`,
                backgroundColor: `${clip.color}15`,
            }}
        >
            {/* Top Badge & Action Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 bg-black/40 border-b border-white/5 text-[10px] pointer-events-auto relative">
                <div className="sticky left-1 inline-flex items-center gap-1.5 min-w-0 bg-zinc-900/90 border border-white/10 px-1.5 py-0.5 rounded-md backdrop-blur-md shadow-md z-10">
                    <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: clip.color }}
                    />
                    <span className="font-bold text-white truncate max-w-[140px] tracking-tight">{clip.stemName}</span>
                    <span className="text-zinc-400 text-[9px]">({clip.duration.toFixed(1)}s)</span>
                </div>

                {/* Quick Action Buttons on Hover or Selection */}
                {(isHovered || isSelected) && (
                    <div className="flex items-center gap-1 clip-action">
                        {/* Gain Popover */}
                        <div className="relative">
                            <button
                                title={`Clip Gain: ${(clip.gain * 100).toFixed(0)}%`}
                                onClick={(e) => { e.stopPropagation(); setShowGainSlider(prev => !prev); }}
                                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Volume2 className="w-3 h-3" />
                            </button>

                            {showGainSlider && (
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute bottom-full right-0 mb-1 p-2 bg-zinc-900 border border-white/15 rounded-xl shadow-2xl z-50 flex flex-col items-center gap-1 w-28"
                                >
                                    <span className="text-[10px] font-bold text-zinc-300">
                                        Gain: {(clip.gain * 100).toFixed(0)}%
                                    </span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.05"
                                        value={clip.gain}
                                        onChange={(e) => setClipGain(clip.id, parseFloat(e.target.value))}
                                        className="w-full h-1 accent-yellow-400 bg-white/10 rounded"
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            title="Split Clip at Playhead (Cmd+B)"
                            onClick={(e) => { e.stopPropagation(); splitClipAtPlayhead(clip.id); }}
                            className="p-1 rounded text-zinc-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                        >
                            <Scissors className="w-3 h-3" />
                        </button>

                        <button
                            title="Duplicate Clip"
                            onClick={(e) => { e.stopPropagation(); duplicateClip(clip.id); }}
                            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <Copy className="w-3 h-3" />
                        </button>

                        <button
                            title="Delete Clip (Backspace)"
                            onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}
                            className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>

            {/* Waveform Canvas */}
            <div className="flex-1 flex items-center justify-center px-1 overflow-hidden pointer-events-none">
                <canvas ref={canvasRef} className="w-full h-12 block" />
            </div>

            {/* Left Trim Handle */}
            <div
                onPointerDown={handleLeftTrimDown}
                onPointerMove={handleLeftTrimMove}
                onPointerUp={handleLeftTrimUp}
                className="trim-handle absolute left-0 top-0 bottom-0 w-2.5 bg-white/0 hover:bg-yellow-400/40 cursor-ew-resize transition-colors flex items-center justify-center group-hover:bg-white/10"
            >
                <div className="w-0.5 h-4 bg-zinc-400 rounded-full" />
            </div>

            {/* Right Trim Handle */}
            <div
                onPointerDown={handleRightTrimDown}
                onPointerMove={handleRightTrimMove}
                onPointerUp={handleRightTrimUp}
                className="trim-handle absolute right-0 top-0 bottom-0 w-2.5 bg-white/0 hover:bg-yellow-400/40 cursor-ew-resize transition-colors flex items-center justify-center group-hover:bg-white/10"
            >
                <div className="w-0.5 h-4 bg-zinc-400 rounded-full" />
            </div>
        </div>
    );
};
