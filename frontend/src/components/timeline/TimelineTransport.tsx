import React from 'react';
import {
    Play, Pause, SkipBack, Repeat, Scissors, Plus,
    Magnet, ZoomIn, ZoomOut, Undo2, Redo2, SlidersHorizontal, Combine
} from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';

interface TimelineTransportProps {
    onOpenMergeModal?: () => void;
}

export const TimelineTransport: React.FC<TimelineTransportProps> = ({ onOpenMergeModal }) => {
    const {
        isPlaying,
        playheadTime,
        project,
        selectedTrackIds,
        selectedClipIds,
        togglePlay,
        seek,
        toggleLoop,
        toggleSnapping,
        setSnapInterval,
        setZoom,
        addTrack,
        splitClipAtPlayhead,
        mergeSelectedTracks,
        undo,
        redo,
        canUndo,
        canRedo,
        setMasterVolume,
    } = useTimeline();

    const tracksFromSelectedClips = project.clips.filter(c => selectedClipIds.includes(c.id)).map(c => c.trackId);
    const activeSelectedTrackCount = Array.from(new Set([...selectedTrackIds, ...tracksFromSelectedClips])).length;

    const formatPreciseTimecode = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const hundredths = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full bg-zinc-950/95 border-b border-white/10 px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none backdrop-blur-xl">
            {/* Left Section: Timecode Display + Undo/Redo + Split + Merge Layers + Add Track */}
            <div className="flex items-center gap-2 sm:gap-2.5">
                {/* Timecode Display */}
                <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-xl shadow-inner flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">TC</span>
                    <span className="font-mono text-sm sm:text-base font-black text-yellow-400 tabular-nums">
                        {formatPreciseTimecode(playheadTime)}
                    </span>
                </div>

                {/* Undo / Redo */}
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
                    <button
                        title="Undo (Ctrl+Z / Cmd+Z)"
                        onClick={undo}
                        disabled={!canUndo}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        title="Redo (Ctrl+Y / Cmd+Shift+Z)"
                        onClick={redo}
                        disabled={!canRedo}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Split Clip Tool */}
                <button
                    title="Split Clip at Playhead (Cmd+B)"
                    onClick={() => splitClipAtPlayhead()}
                    className="p-1.5 rounded-xl border border-white/10 hover:bg-white/10 hover:text-yellow-400 text-zinc-400 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                >
                    <Scissors className="w-4 h-4" />
                    <span className="hidden md:inline">Split</span>
                </button>

                {/* Merge Layers Button (Directly next to Split) */}
                {activeSelectedTrackCount >= 2 ? (
                    <button
                        title={`Merge ${activeSelectedTrackCount} Selected Layers (Cmd+M)`}
                        onClick={() => mergeSelectedTracks()}
                        className="px-2.5 py-1.5 rounded-xl border border-yellow-400 bg-yellow-500/25 hover:bg-yellow-500/35 text-yellow-300 transition-all text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(250,204,21,0.3)] animate-pulse"
                    >
                        <Combine className="w-3.5 h-3.5 text-yellow-400" />
                        <span>Merge {activeSelectedTrackCount} Selected (Cmd+M)</span>
                    </button>
                ) : (
                    onOpenMergeModal && (
                        <button
                            title="Merge Tracks (Select 2+ layers to quick-merge with Cmd+M)"
                            onClick={onOpenMergeModal}
                            disabled={project.tracks.length < 2}
                            className="px-2.5 py-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 hover:text-yellow-200 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(250,204,21,0.15)]"
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Merge Layers</span>
                        </button>
                    )
                )}

                {/* Add Audio Track Button */}
                <button
                    title="Add Audio Track"
                    onClick={() => addTrack()}
                    className="px-2 py-1.5 rounded-xl border border-white/10 hover:border-yellow-500/40 hover:bg-white/10 text-zinc-300 hover:text-yellow-400 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Track</span>
                </button>
            </div>

            {/* Center Section: Primary Transport Controls ONLY (SkipBack, Play/Pause, Loop) */}
            <div className="flex items-center gap-2 sm:gap-3">
                <button
                    title="Rewind to Start (0:00)"
                    onClick={() => seek(0)}
                    className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                >
                    <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                <button
                    title="Play / Pause (Spacebar)"
                    onClick={togglePlay}
                    className={`p-3 sm:p-3.5 rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center cursor-pointer ${
                        isPlaying
                            ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(250,204,21,0.5)]'
                            : 'bg-white/10 text-white hover:bg-yellow-500 hover:text-black hover:shadow-[0_0_15px_rgba(250,204,21,0.3)]'
                    }`}
                >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
                </button>

                <button
                    title="Toggle Loop"
                    onClick={toggleLoop}
                    className={`p-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
                        project.isLooping
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                            : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                >
                    <Repeat className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
            </div>

            {/* Right Section: Snapping + Zoom + Master Volume */}
            <div className="flex items-center gap-3">
                {/* Snapping Controls */}
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-0.5">
                    <button
                        title="Magnetic Grid Snapping"
                        onClick={toggleSnapping}
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            project.isSnappingEnabled
                                ? 'bg-yellow-400 text-black shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Magnet className="w-3.5 h-3.5" />
                    </button>

                    {project.isSnappingEnabled && (
                        <select
                            value={project.snapInterval}
                            onChange={(e) => setSnapInterval(parseFloat(e.target.value))}
                            className="bg-transparent text-zinc-300 text-[10px] font-bold px-1 outline-none cursor-pointer"
                        >
                            <option value="0.1" className="bg-zinc-900">0.1s</option>
                            <option value="0.5" className="bg-zinc-900">0.5s</option>
                            <option value="1.0" className="bg-zinc-900">1.0s</option>
                            <option value="5.0" className="bg-zinc-900">5.0s</option>
                        </select>
                    )}
                </div>

                {/* Horizontal Timeline Zoom */}
                <div className="hidden sm:flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
                    <button
                        title="Zoom Out"
                        onClick={() => setZoom(prev => prev * 0.8)}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                        type="range"
                        min="15"
                        max="200"
                        value={project.zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-16 h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                    />
                    <button
                        title="Zoom In"
                        onClick={() => setZoom(prev => prev * 1.25)}
                        className="text-zinc-400 hover:text-white"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Master Volume Slider (Clean, No Extra Meter Lines) */}
                <div className="flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5 shadow-inner">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">VOL</span>
                    <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={project.masterVolume ?? 1.0}
                        onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                        className="w-16 sm:w-20 h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                        title={`Master Volume: ${Math.round((project.masterVolume ?? 1.0) * 100)}%`}
                    />
                </div>
            </div>
        </div>
    );
};
