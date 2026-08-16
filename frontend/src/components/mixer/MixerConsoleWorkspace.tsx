import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
    SlidersHorizontal, Play, Pause, SkipBack, RotateCcw,
    ShieldCheck, Undo2, Redo2
} from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';
import { drawWaveformToCanvas } from '../../utils/waveform';
import type { TimelineTrack } from '../../types';

const DB_TICKS = [
    { label: '+3.5', val: 1.5, topPercent: 0 },
    { label: '0.0', val: 1.0, topPercent: 33.33 },
    { label: '-6.0', val: 0.5, topPercent: 66.67 },
    { label: '-12', val: 0.25, topPercent: 83.33 },
    { label: '-24', val: 0.063, topPercent: 95.8 },
    { label: '-inf', val: 0.0, topPercent: 100 },
];

export const MixerConsoleWorkspace: React.FC = () => {
    const {
        project,
        updateTrack,
        toggleTrackMute,
        toggleTrackSolo,
        resetTrackToDefaults,
        resetAllTracksToDefaults,
        setMasterVolume,
        isPlaying,
        togglePlay,
        seek,
        playheadTime,
        vuMeterLevels,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useTimeline();

    const scrubberContainerRef = useRef<HTMLDivElement>(null);
    const scrubberCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    const formatPreciseTimecode = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const hundredths = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
    };

    const formatPan = (pan: number): string => {
        if (Math.abs(pan) < 0.05) return 'C';
        if (pan < 0) return `${Math.round(Math.abs(pan) * 100)}L`;
        return `${Math.round(pan * 100)}R`;
    };

    const formatVolumeDB = (vol: number): string => {
        if (vol <= 0.0001) return '-inf dB';
        const db = 20 * Math.log10(vol);
        return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
    };

    const getTrackStemLabel = (track: TimelineTrack): string => {
        const clip = project.clips.find(c => c.trackId === track.id);
        if (clip && clip.stemName) return clip.stemName;
        if (track.name) return track.name;
        return 'Track';
    };

    const masterVol = project.masterVolume ?? 1.0;
    const totalDuration = Math.max(1, project.duration || 180);

    // Channel ordering with Bass and Vocals interchanged
    const orderedTracks = useMemo(() => {
        const score = (t: TimelineTrack) => {
            const name = (t.name || '').toLowerCase();
            const id = (t.id || '').toLowerCase();
            if (name.includes('bass') || id.includes('bass')) return 0;
            if (name.includes('drum') || id.includes('drum')) return 1;
            if (name.includes('vocal') || id.includes('vocal')) return 2;
            if (name.includes('guitar') || id.includes('guitar')) return 3;
            if (name.includes('piano') || id.includes('piano')) return 4;
            if (name.includes('other') || id.includes('other')) return 5;
            return 6;
        };
        return [...project.tracks].sort((a, b) => score(a) - score(b));
    }, [project.tracks]);

    // Draw consolidated waveform on top scrubber canvas
    useEffect(() => {
        const canvas = scrubberCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * (window.devicePixelRatio || 2);
        canvas.height = rect.height * (window.devicePixelRatio || 2);

        // Find composite peaks from clips
        const availablePeaks = project.clips.find(c => c.peaks && c.peaks.length > 0)?.peaks;
        const peaksToDraw = availablePeaks || Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.15) * 0.4 + 0.3);

        drawWaveformToCanvas(canvas, peaksToDraw, '#facc15', {
            startRatio: 0,
            endRatio: 1,
            gain: 1.1,
            barWidth: 3,
            barGap: 1.5,
        });
    }, [project.clips]);

    // Handle Scrubber Click & Drag
    const handleScrubAtPoint = useCallback((clientX: number) => {
        if (!scrubberContainerRef.current) return;
        const rect = scrubberContainerRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const targetTime = ratio * totalDuration;
        seek(targetTime);
    }, [seek, totalDuration]);

    const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsScrubbing(true);
        handleScrubAtPoint(e.clientX);
    };

    useEffect(() => {
        if (!isScrubbing) return;
        const handleMouseMove = (e: MouseEvent) => {
            handleScrubAtPoint(e.clientX);
        };
        const handleMouseUp = () => {
            setIsScrubbing(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isScrubbing, handleScrubAtPoint]);

    return (
        <div className="w-full h-[calc(100vh-8.5rem)] flex flex-col bg-zinc-950 text-slate-50 overflow-hidden select-none">
            {/* Top Toolbar: Console Header & Transport Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-zinc-950 border-b border-white/10 shrink-0 z-20 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                        <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm sm:text-base font-black text-white tracking-tight">Studio Mixing Console</h2>
                        <p className="text-[11px] text-zinc-400 font-medium">
                            {project.tracks.length} Channels • Real-Time Web Audio Summing & Parametric EQ
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Timecode */}
                    <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-xl font-mono text-xs sm:text-sm font-black text-yellow-400 tabular-nums shadow-inner">
                        {formatPreciseTimecode(playheadTime)}
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

                    <button
                        title="Rewind to Start (0:00)"
                        onClick={() => seek(0)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    >
                        <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                        title="Play / Pause (Spacebar)"
                        onClick={togglePlay}
                        className={`px-4 py-1.5 rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                            isPlaying
                                ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]'
                                : 'bg-white/10 text-white hover:bg-yellow-500 hover:text-black'
                        }`}
                    >
                        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                    </button>

                    <button
                        title="Reset All Channel Faders & EQ to Defaults"
                        onClick={resetAllTracksToDefaults}
                        className="px-3 py-1.5 rounded-xl border border-white/10 hover:border-yellow-500/40 text-zinc-400 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <RotateCcw className="w-3 h-3" />
                        <span className="hidden sm:inline">Reset Mix</span>
                    </button>
                </div>
            </div>

            {/* Full-Width Consolidated Overview Waveform & Timeline Scrubber */}
            <div className="px-4 sm:px-6 py-2 bg-zinc-950/90 border-b border-white/10 shrink-0">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1 px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-yellow-400 font-black text-xs">{formatPreciseTimecode(playheadTime)}</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400 text-xs">{formatPreciseTimecode(totalDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => seek(Math.max(0, playheadTime - 5))}
                            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold transition-all cursor-pointer"
                            title="Rewind 5 seconds"
                        >
                            -5s
                        </button>
                        <button
                            onClick={() => seek(Math.min(totalDuration, playheadTime + 5))}
                            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold transition-all cursor-pointer"
                            title="Forward 5 seconds"
                        >
                            +5s
                        </button>
                    </div>
                </div>

                {/* Scrubber Container */}
                <div
                    ref={scrubberContainerRef}
                    onMouseDown={handleScrubberMouseDown}
                    className="w-full h-11 bg-black/70 border border-white/10 hover:border-yellow-500/40 rounded-2xl relative overflow-hidden cursor-pointer group shadow-inner transition-colors"
                >
                    {/* Background Waveform Canvas */}
                    <canvas ref={scrubberCanvasRef} className="w-full h-full block opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* Timecode markers overlay */}
                    <div className="absolute inset-0 pointer-events-none flex justify-between px-3 items-end pb-0.5 text-[8px] font-mono text-zinc-500">
                        <span>0:00</span>
                        <span>{formatPreciseTimecode(totalDuration * 0.25).slice(0, 5)}</span>
                        <span>{formatPreciseTimecode(totalDuration * 0.5).slice(0, 5)}</span>
                        <span>{formatPreciseTimecode(totalDuration * 0.75).slice(0, 5)}</span>
                        <span>{formatPreciseTimecode(totalDuration).slice(0, 5)}</span>
                    </div>

                    {/* Played Progress Tint (Immediate 60fps tracking without lag) */}
                    <div
                        className="absolute top-0 bottom-0 left-0 bg-yellow-500/15 pointer-events-none"
                        style={{ width: `${Math.min(100, (playheadTime / totalDuration) * 100)}%` }}
                    />

                    {/* Live Sweeping Playhead Needle & Handle (Immediate 60fps tracking without lag) */}
                    <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                            left: `${Math.min(100, (playheadTime / totalDuration) * 100)}%`,
                            willChange: 'left',
                        }}
                    >
                        <div className="absolute -left-[1px] top-0 bottom-0 w-0.5 bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,1)]" />
                        <div className="absolute -top-0.5 -left-1.5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-black shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                    </div>
                </div>
            </div>

            {/* Main Console Body: Left Scrollable Track Strips + Right Pinned Master Bus */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left/Center: Scrollable Track Channel Strips (Compact w-44 size) */}
                <div className="flex-1 overflow-x-auto overflow-y-auto p-3 sm:p-4 flex gap-3 items-stretch custom-scrollbar bg-black/40">
                    {project.tracks.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                            <SlidersHorizontal className="w-12 h-12 stroke-1 mb-2" />
                            <p className="text-sm font-semibold">No Audio Tracks in Project</p>
                            <p className="text-xs text-zinc-600 mt-1">Import stems from the Separate tab or Media Pool to start mixing.</p>
                        </div>
                    ) : (
                        (() => {
                            const hasSolo = project.tracks.some(t => t.isSolo);
                            return orderedTracks.map((track) => {
                                const trackVolDb = formatVolumeDB(track.volume);
                                const stemLabel = getTrackStemLabel(track);
                                const isAudible = isPlaying && (hasSolo ? track.isSolo : !track.isMuted) && track.volume > 0.001;

                                return (
                                    <div
                                        key={track.id}
                                        className="w-44 shrink-0 bg-zinc-950/90 border border-white/10 rounded-2xl p-3 flex flex-col justify-between backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:border-white/20 transition-all"
                                    >
                                        {/* Top Thicker Colored Stem Badge / Header (Center-aligned, No dots) */}
                                        <div
                                            className="w-full px-2 py-1.5 rounded-xl border flex items-center justify-center shadow-sm mb-2 relative group/badge"
                                            style={{
                                                backgroundColor: `${track.color}25`,
                                                borderColor: `${track.color}50`,
                                                color: track.color,
                                            }}
                                        >
                                            <span className="text-xs font-black uppercase tracking-wider text-center text-white truncate px-4">
                                                {stemLabel}
                                            </span>

                                            <button
                                                title="Reset Channel to Defaults (0 dB, Centered, EQ Flat)"
                                                onClick={() => resetTrackToDefaults(track.id)}
                                                className="absolute right-1.5 p-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover/badge:opacity-100 cursor-pointer shrink-0"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                            </button>
                                        </div>

                                        {/* 3-Band Parametric EQ Section */}
                                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 space-y-1.5 mb-2">
                                            <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider block text-center">3-Band EQ</span>

                                            {/* High */}
                                            <div className="space-y-0.5">
                                                <div className="flex items-center justify-between text-[8px]">
                                                    <span className="text-zinc-500 font-bold">High (10k)</span>
                                                    <span className="font-mono text-zinc-300">{track.eqHigh > 0 ? `+${track.eqHigh}` : track.eqHigh} dB</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="-12"
                                                    max="12"
                                                    step="0.5"
                                                    value={track.eqHigh}
                                                    onChange={(e) => updateTrack(track.id, { eqHigh: parseFloat(e.target.value) })}
                                                    onPointerUp={(e) => updateTrack(track.id, { eqHigh: parseFloat(e.currentTarget.value) }, true)}
                                                    className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                                />
                                            </div>

                                            {/* Mid */}
                                            <div className="space-y-0.5">
                                                <div className="flex items-center justify-between text-[8px]">
                                                    <span className="text-zinc-500 font-bold">Mid (1k)</span>
                                                    <span className="font-mono text-zinc-300">{track.eqMid > 0 ? `+${track.eqMid}` : track.eqMid} dB</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="-12"
                                                    max="12"
                                                    step="0.5"
                                                    value={track.eqMid}
                                                    onChange={(e) => updateTrack(track.id, { eqMid: parseFloat(e.target.value) })}
                                                    onPointerUp={(e) => updateTrack(track.id, { eqMid: parseFloat(e.currentTarget.value) }, true)}
                                                    className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                                />
                                            </div>

                                            {/* Low */}
                                            <div className="space-y-0.5">
                                                <div className="flex items-center justify-between text-[8px]">
                                                    <span className="text-zinc-500 font-bold">Low (80)</span>
                                                    <span className="font-mono text-zinc-300">{track.eqLow > 0 ? `+${track.eqLow}` : track.eqLow} dB</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="-12"
                                                    max="12"
                                                    step="0.5"
                                                    value={track.eqLow}
                                                    onChange={(e) => updateTrack(track.id, { eqLow: parseFloat(e.target.value) })}
                                                    onPointerUp={(e) => updateTrack(track.id, { eqLow: parseFloat(e.currentTarget.value) }, true)}
                                                    className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                                />
                                            </div>
                                        </div>

                                        {/* Stereo Pan Control */}
                                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-1.5 mb-2">
                                            <div className="flex items-center justify-between text-[8px] mb-0.5">
                                                <span className="text-zinc-400 font-bold uppercase">Pan</span>
                                                <span className="font-mono font-bold text-yellow-400">{formatPan(track.pan)}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="-1"
                                                max="1"
                                                step="0.05"
                                                value={track.pan}
                                                onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
                                                onPointerUp={(e) => updateTrack(track.id, { pan: parseFloat(e.currentTarget.value) }, true)}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                            />
                                        </div>

                                        {/* Mute & Solo Buttons */}
                                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                                            <button
                                                onClick={() => toggleTrackMute(track.id)}
                                                className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                                    track.isMuted
                                                        ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                                        : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                                                }`}
                                            >
                                                MUTE
                                            </button>

                                            <button
                                                onClick={() => toggleTrackSolo(track.id)}
                                                className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                                    track.isSolo
                                                        ? 'bg-yellow-400 text-black shadow-[0_0_8px_rgba(250,204,21,0.6)]'
                                                        : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                                                }`}
                                            >
                                                SOLO
                                            </button>
                                        </div>

                                        {/* Vertical Volume Fader with Accurately Calibrated dB Ticks */}
                                        <div className="flex items-center justify-center gap-2 py-1 flex-1 min-h-[180px]">
                                            {/* Mathematically Calibrated dB Scale Markings */}
                                            <div className="relative h-40 w-7 text-[8px] font-mono text-zinc-500 select-none shrink-0">
                                                {DB_TICKS.map(t => (
                                                    <div
                                                        key={t.label}
                                                        className="absolute right-0 -translate-y-1/2 flex items-center gap-1"
                                                        style={{ top: `${t.topPercent}%` }}
                                                    >
                                                        <span className={t.val === 1.0 ? 'text-yellow-400 font-bold' : ''}>{t.label}</span>
                                                        <div className={`h-px ${t.val === 1.0 ? 'bg-yellow-400 w-1.5' : 'bg-white/20 w-1'}`} />
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Fader Slider */}
                                            <div className="h-40 w-8 flex items-center justify-center relative shrink-0">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1.5"
                                                    step="0.01"
                                                    value={track.volume}
                                                    onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                                                    onPointerUp={(e) => updateTrack(track.id, { volume: parseFloat(e.currentTarget.value) }, true)}
                                                    className="w-40 h-2 accent-yellow-400 bg-zinc-800 rounded-full -rotate-90 cursor-pointer shadow-inner"
                                                />
                                            </div>

                                            {/* Real-Time Live Level Meter (Animates only when audible) */}
                                            <div className="w-2.5 h-40 bg-zinc-900 rounded-full p-0.5 flex flex-col justify-end overflow-hidden border border-white/10 shadow-inner shrink-0">
                                                <div
                                                    className="w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 rounded-full transition-all duration-75"
                                                    style={{
                                                        height: isAudible
                                                            ? `${Math.min(100, Math.max(4, (track.volume / 1.5) * (vuMeterLevels.peak * 100)))}%`
                                                            : '0%',
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Bottom dB Readout */}
                                        <div className="text-center pt-1.5 border-t border-white/5">
                                            <span className="font-mono text-xs font-bold text-zinc-200">
                                                {trackVolDb}
                                            </span>
                                        </div>
                                    </div>
                                );
                            });
                        })()
                    )}
                </div>

                {/* Right: Pinned Persistent Master Bus Sidebar (Sleek w-44 width matching channel strips) */}
                <div className="w-44 h-full shrink-0 bg-zinc-950 border-l border-white/10 p-3 flex flex-col justify-between shadow-2xl z-20">
                    <div>
                        {/* Master Header: Clean Title MASTER AUDIO */}
                        <div className="w-full px-2 py-1.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-center mb-2 shadow-sm">
                            <span className="text-xs font-black uppercase tracking-wider text-white">MASTER AUDIO</span>
                        </div>

                        {/* Limiter & Protection Badge */}
                        <div className="bg-black/60 border border-white/10 rounded-xl p-1.5 mb-2 text-center shadow-inner">
                            <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-zinc-300">
                                <ShieldCheck className="w-3 h-3 text-green-400" />
                                <span>Limiter</span>
                            </div>
                            <p className="text-[8px] text-green-400 font-mono">-1.0 dBFS</p>
                        </div>
                    </div>

                    {/* Master Vertical Fader & Real-Time Dual Stereo VU Meters */}
                    <div className="flex items-center justify-center gap-2 py-1 flex-1 min-h-[180px]">
                        {/* Mathematically Calibrated dB Markings */}
                        <div className="relative h-40 w-7 text-[8px] font-mono text-zinc-500 select-none shrink-0">
                            {DB_TICKS.map(t => (
                                <div
                                    key={t.label}
                                    className="absolute right-0 -translate-y-1/2 flex items-center gap-1"
                                    style={{ top: `${t.topPercent}%` }}
                                >
                                    <span className={t.val === 1.0 ? 'text-yellow-400 font-bold' : ''}>{t.label}</span>
                                    <div className={`h-px ${t.val === 1.0 ? 'bg-yellow-400 w-1.5' : 'bg-white/20 w-1'}`} />
                                </div>
                            ))}
                        </div>

                        {/* Master Fader Slider */}
                        <div className="h-40 w-8 flex items-center justify-center shrink-0">
                            <input
                                type="range"
                                min="0"
                                max="1.5"
                                step="0.01"
                                value={masterVol}
                                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                                className="w-40 h-2 accent-yellow-400 bg-zinc-800 rounded-full -rotate-90 cursor-pointer shadow-lg"
                            />
                        </div>

                        {/* Dual Stereo Real-Time VU Level Meters */}
                        {(() => {
                            const hasSolo = project.tracks.some(t => t.isSolo);
                            const isMasterAudible = isPlaying && (hasSolo ? project.tracks.some(t => t.isSolo && t.volume > 0.001) : project.tracks.some(t => !t.isMuted && t.volume > 0.001));

                            return (
                                <div className="flex gap-1 items-center shrink-0">
                                    {/* Left Channel */}
                                    <div className="w-2.5 h-40 bg-zinc-900 rounded-full p-0.5 flex flex-col justify-end overflow-hidden border border-white/10 shadow-inner">
                                        <div
                                            className="w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 rounded-full transition-all duration-75 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                                            style={{ height: isMasterAudible ? `${Math.min(100, Math.max(3, vuMeterLevels.left * (masterVol / 1.0) * 100))}%` : '0%' }}
                                        />
                                    </div>

                                    {/* Right Channel */}
                                    <div className="w-2.5 h-40 bg-zinc-900 rounded-full p-0.5 flex flex-col justify-end overflow-hidden border border-white/10 shadow-inner">
                                        <div
                                            className="w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 rounded-full transition-all duration-75 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                                            style={{ height: isMasterAudible ? `${Math.min(100, Math.max(3, vuMeterLevels.right * (masterVol / 1.0) * 100))}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Master Volume dB Value & Minimal Reset Button at the bottom */}
                    <div className="pt-1.5 border-t border-white/10 flex flex-col items-center gap-0.5">
                        <div className="font-mono text-xs font-black text-yellow-400">
                            {formatVolumeDB(masterVol)}
                        </div>
                        <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider block">
                            Peak: {isPlaying ? (vuMeterLevels.peak > 0.001 ? `${(20 * Math.log10(vuMeterLevels.peak * masterVol)).toFixed(1)} dB` : '-inf') : '-inf'}
                        </span>

                        {/* Minimal Reset Button at Bottom with subtle square highlight on hover */}
                        <button
                            title="Reset Master Volume to 0.0 dB"
                            onClick={() => setMasterVolume(1.0)}
                            className="mt-0.5 p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
