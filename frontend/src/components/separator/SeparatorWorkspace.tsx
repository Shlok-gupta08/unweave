import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    UploadCloud, Layers, Download, Play, Pause,
    CheckCircle2, Disc, Loader2, RotateCcw, Sparkles, AlertCircle, Clock, Zap, Award
} from 'lucide-react';
import JSZip from 'jszip';
import { useSongLibrary } from '../../context/SongLibraryContext';
import { useProcessingMode, type SeparationPasses } from '../../context/ProcessingModeContext';
import { useTimeline } from '../../context/TimelineContext';
import { SongBucketList } from './SongBucketList';
import { getOrComputePeaks, drawWaveformToCanvas } from '../../utils/waveform';
import type { SongItem } from '../../types';

interface SeparatorWorkspaceProps {
    onNavigateToEditor: () => void;
}

const STEM_COLORS: Record<string, string> = {
    Vocals: '#ef4444',
    Drums: '#f59e0b',
    Bass: '#3b82f6',
    Guitar: '#10b981',
    Piano: '#8b5cf6',
    Other: '#64748b',
};

const PASS_OPTIONS: Array<{
    count: SeparationPasses;
    name: 'Good' | 'Better' | 'Best';
    quality: string;
    timing: string;
    badge: string;
}> = [
    {
        count: 2,
        name: 'Good',
        quality: 'Standard studio separation with clean stem isolation and balanced fidelity.',
        timing: 'Standard baseline processing time (Fastest)',
        badge: 'Recommended',
    },
    {
        count: 3,
        name: 'Better',
        quality: 'Enhanced multi-shift averaging, sharper frequency definition, and reduced vocal bleed.',
        timing: '~50% more processing time than Good',
        badge: 'High Detail',
    },
    {
        count: 4,
        name: 'Best',
        quality: 'Maximum deep-learning shift averaging with pristine vocal clarity and zero phase artifacts.',
        timing: '~100% more processing time than Good (2x duration)',
        badge: 'Studio Master',
    },
];

export const SeparatorWorkspace: React.FC<SeparatorWorkspaceProps> = ({ onNavigateToEditor }) => {
    const {
        activeSong,
        selectSong,
        addSongs,
        reprocessSong,
        cancelProcessing,
    } = useSongLibrary();

    const { separationPasses, setSeparationPasses } = useProcessingMode();
    const { loadSongStemsToTimeline, addClip, addTrack, project } = useTimeline();

    // Audio Preview State
    const [playingStem, setPlayingStem] = useState<string | null>(null);
    const [previewProgress, setPreviewProgress] = useState(0); // 0 to 1
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const previewRafRef = useRef<number | null>(null);

    // Precomputed peaks cache per stem URL
    const [stemPeaks, setStemPeaks] = useState<Record<string, number[]>>({});

    // State
    const [isZipping, setIsZipping] = useState(false);
    const [isImportingTimeline, setIsImportingTimeline] = useState(false);
    const [importingSingleStem, setImportingSingleStem] = useState<string | null>(null);

    // Precompute peaks for visible stems of active song
    useEffect(() => {
        if (!activeSong?.stems) return;

        const loadPeaks = async () => {
            const entries = Object.entries(activeSong.stems || {});
            const peaksMap: Record<string, number[]> = {};

            for (const [stemName, url] of entries) {
                if (!url) continue;
                try {
                    const p = await getOrComputePeaks(url);
                    peaksMap[stemName] = p;
                } catch {
                    // Ignore
                }
            }
            setStemPeaks(peaksMap);
        };

        loadPeaks();
    }, [activeSong?.id, activeSong?.stems]);

    // Track preview playback progress
    useEffect(() => {
        const tick = () => {
            if (audioPreviewRef.current && !audioPreviewRef.current.paused) {
                const cur = audioPreviewRef.current.currentTime;
                const dur = audioPreviewRef.current.duration || 1;
                setPreviewProgress(cur / dur);
                previewRafRef.current = requestAnimationFrame(tick);
            }
        };

        if (playingStem) {
            previewRafRef.current = requestAnimationFrame(tick);
        } else {
            if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
        }

        return () => {
            if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
        };
    }, [playingStem]);

    // Stop preview on unmount
    useEffect(() => {
        return () => {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
                audioPreviewRef.current = null;
            }
        };
    }, []);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        await addSongs(acceptedFiles);
    }, [addSongs]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/mpeg': ['.mp3', '.mpeg', '.mpg', '.mpga', '.mpega'],
            'audio/wav': ['.wav'],
            'audio/flac': ['.flac'],
        },
        multiple: true,
    });

    const handleSeparateActiveSong = () => {
        if (!activeSong) return;
        reprocessSong(activeSong.id, undefined, separationPasses);
    };

    const handleStemPreview = (stemName: string, url?: string) => {
        if (!url) return;

        if (playingStem === stemName && audioPreviewRef.current) {
            if (!audioPreviewRef.current.paused) {
                audioPreviewRef.current.pause();
                setPlayingStem(null);
            } else {
                audioPreviewRef.current.play().catch(console.error);
                setPlayingStem(stemName);
            }
            return;
        }

        if (audioPreviewRef.current) {
            audioPreviewRef.current.pause();
        }

        const audio = new Audio(url);
        audio.onended = () => {
            setPlayingStem(null);
            setPreviewProgress(0);
        };
        audio.play().catch(console.error);
        audioPreviewRef.current = audio;
        setPlayingStem(stemName);
    };

    const handleCardWaveformSeek = (e: React.MouseEvent<HTMLDivElement>, stemName: string, url?: string) => {
        if (!url) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (playingStem !== stemName || !audioPreviewRef.current) {
            handleStemPreview(stemName, url);
            setTimeout(() => {
                if (audioPreviewRef.current) {
                    const dur = audioPreviewRef.current.duration || 60;
                    audioPreviewRef.current.currentTime = clickRatio * dur;
                    setPreviewProgress(clickRatio);
                }
            }, 100);
        } else {
            const dur = audioPreviewRef.current.duration || 60;
            audioPreviewRef.current.currentTime = clickRatio * dur;
            setPreviewProgress(clickRatio);
        }
    };

    const handleAddSingleStemToTimeline = async (stemName: string, url?: string) => {
        if (!url || !activeSong || importingSingleStem) return;
        setImportingSingleStem(stemName);

        try {
            let targetTrack = project.tracks.find(t => t.name.toLowerCase().includes(stemName.toLowerCase()));
            if (!targetTrack) {
                const trackId = addTrack(`${activeSong.name} - ${stemName}`, STEM_COLORS[stemName] || '#64748b');
                targetTrack = { id: trackId } as (typeof project.tracks)[0];
            }

            await addClip({
                trackId: targetTrack.id,
                stemName,
                songId: activeSong.id,
                songTitle: activeSong.name,
                audioUrl: url,
                startTime: 0,
                offset: 0,
                duration: 0,
                originalDuration: 0,
                gain: 1.0,
                color: STEM_COLORS[stemName] || '#64748b',
            });

            onNavigateToEditor();
        } finally {
            setImportingSingleStem(null);
        }
    };

    const handleOpenAllInTimeline = async (song: SongItem) => {
        if (isImportingTimeline) return;
        setIsImportingTimeline(true);
        try {
            await loadSongStemsToTimeline(song);
            onNavigateToEditor();
        } finally {
            setIsImportingTimeline(false);
        }
    };

    const handleDownloadStem = async (stemName: string, url?: string) => {
        if (!url || !activeSong) return;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${activeSong.name}_${stemName}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('Failed to download stem', err);
        }
    };

    const handleDownloadAllStemsZip = async (song: SongItem) => {
        if (!song.stems) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            const entries = Object.entries(song.stems).filter(([, url]) => !!url);

            for (const [name, url] of entries) {
                if (!url) continue;
                const resp = await fetch(url);
                const blob = await resp.blob();
                zip.file(`${song.name}_${name}.mp3`, blob);
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = `${song.name}_stems.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('Failed to download zip', err);
        } finally {
            setIsZipping(false);
        }
    };

    const currentPassConfig = PASS_OPTIONS.find(p => p.count === separationPasses) || PASS_OPTIONS[0];

    return (
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-8 animate-in fade-in duration-500">

            {/* Top Batch Dropzone Banner */}
            <div
                {...getRootProps()}
                className={`w-full p-6 sm:p-10 border-2 border-dashed rounded-3xl sm:rounded-[2.5rem] backdrop-blur-2xl transition-all duration-300 cursor-pointer text-center relative overflow-hidden group ${
                    isDragActive
                        ? 'border-yellow-400 bg-yellow-500/10 scale-[0.99] shadow-[0_0_30px_rgba(250,204,21,0.25)]'
                        : 'border-white/10 bg-white/[0.02] hover:border-yellow-500/30 hover:bg-white/[0.04]'
                }`}
            >
                <input {...getInputProps()} />
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 relative z-10">
                    <div className={`p-4 rounded-2xl transition-all duration-300 ${
                        isDragActive ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'bg-white/5 border border-white/10 text-yellow-400 group-hover:scale-105'
                    }`}>
                        <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>

                    <div>
                        <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight">
                            {isDragActive ? 'Drop audio files to add to bucket' : 'Drop audio files here or click to browse'}
                        </h3>
                        <p className="text-xs sm:text-sm text-zinc-400 mt-1 font-medium">
                            Supports multi-file batch upload (MP3, WAV, FLAC) • High-fidelity local & cloud AI stem separation
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Grid: Left Song Bucket Drawer + Right Stem Viewer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Song Bucket Sidebar */}
                <div className="lg:col-span-4 w-full">
                    <SongBucketList
                        onSelectSong={(id) => selectSong(id)}
                        onOpenInTimeline={onNavigateToEditor}
                    />
                </div>

                {/* Right: Active Song Details & Stems Inspector */}
                <div className="lg:col-span-8 w-full">
                    {!activeSong ? (
                        <div className="flex flex-col items-center justify-center p-12 sm:p-20 bg-zinc-950/40 border border-white/5 rounded-3xl text-center backdrop-blur-xl">
                            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 text-zinc-600 mb-4">
                                <Disc className="w-12 h-12 stroke-1" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-300">No Song Selected</h3>
                            <p className="text-sm text-zinc-500 max-w-sm mt-1">
                                Drop audio files above or pick a song from the bucket on the left to isolate and view its stems.
                            </p>
                        </div>
                    ) : activeSong.status === 'processing' || activeSong.status === 'uploading' ? (
                        /* Processing View */
                        <div className="flex flex-col items-center justify-center p-8 sm:p-16 bg-zinc-950/80 border border-yellow-500/20 rounded-3xl backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                            <div className="absolute inset-0 bg-yellow-500/5 blur-3xl pointer-events-none" />

                            <div className="relative mb-6">
                                <svg className="w-36 h-36 sm:w-40 sm:h-40 -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                                    <circle
                                        cx="50" cy="50" r="42" fill="none"
                                        stroke="url(#sepProgressGradient)"
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 42}`}
                                        strokeDashoffset={`${2 * Math.PI * 42 * (1 - activeSong.progress / 100)}`}
                                        className="transition-all duration-500 ease-out"
                                    />
                                    <defs>
                                        <linearGradient id="sepProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#facc15" />
                                            <stop offset="100%" stopColor="#eab308" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                                    <span className="text-3xl sm:text-4xl font-black text-white tabular-nums tracking-tight">
                                        {activeSong.progress}%
                                    </span>
                                    <span className="mt-1 px-2.5 py-0.5 rounded-md bg-yellow-400/10 border border-yellow-400/20 text-[10px] sm:text-[11px] font-black text-yellow-400 tracking-wide uppercase">
                                        {currentPassConfig.name} Quality
                                    </span>
                                </div>
                            </div>

                            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2 text-center">
                                {activeSong.statusMessage || 'Separating Stems...'}
                            </h3>
                            <p className="text-xs sm:text-sm text-zinc-400 font-medium mb-6 truncate max-w-md">
                                {activeSong.name}
                            </p>

                            <button
                                onClick={() => cancelProcessing(activeSong.id)}
                                className="px-6 py-2.5 rounded-full border border-red-500/40 text-red-400 hover:bg-red-500/10 active:scale-95 text-xs font-bold transition-all cursor-pointer"
                            >
                                Cancel Separation
                            </button>
                        </div>
                    ) : activeSong.status === 'complete' && activeSong.stems ? (
                        /* Complete View - 6 Stem Cards + Master Actions */
                        <div className="space-y-6">
                            {/* Song Header Toolbar */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 bg-zinc-950/80 border border-white/10 rounded-3xl backdrop-blur-xl">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                                        <h3 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                                            {activeSong.name}
                                        </h3>
                                    </div>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Isolated in {activeSong.processingTime ?? '—'}s • {Object.keys(activeSong.stems).length} stems extracted
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                                    {/* Re-separate Button in Right Box */}
                                    <button
                                        onClick={handleSeparateActiveSong}
                                        title={`Re-separate this song (${currentPassConfig.name} Quality)`}
                                        className="px-3.5 py-2.5 rounded-xl border border-white/10 hover:border-yellow-500/40 hover:bg-white/5 active:scale-95 text-xs font-bold text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 text-yellow-400" />
                                        <span>Re-separate</span>
                                    </button>

                                    <button
                                        onClick={() => handleDownloadAllStemsZip(activeSong)}
                                        disabled={isZipping}
                                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 active:scale-95 text-xs font-semibold text-zinc-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>{isZipping ? 'Zipping...' : 'Download (ZIP)'}</span>
                                    </button>

                                    <button
                                        onClick={() => handleOpenAllInTimeline(activeSong)}
                                        disabled={isImportingTimeline}
                                        className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 text-xs sm:text-sm font-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.3)] hover:shadow-[0_0_30px_rgba(250,204,21,0.5)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                                    >
                                        {isImportingTimeline ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Importing Stems...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Layers className="w-4 h-4" />
                                                <span>Open in Timeline</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Stems Cards Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.entries(activeSong.stems).map(([stemName, url]) => {
                                    const color = STEM_COLORS[stemName] || '#10b981';
                                    const isPreviewing = playingStem === stemName;
                                    const peaks = stemPeaks[stemName];
                                    const isAddingThisStem = importingSingleStem === stemName;

                                    return (
                                        <div
                                            key={stemName}
                                            className="group relative p-4 rounded-2xl sm:rounded-3xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl hover:border-white/20 transition-all duration-300 shadow-xl overflow-hidden flex flex-col justify-between min-h-[140px]"
                                        >
                                            {/* Colored Top Accent Bar */}
                                            <div
                                                className="absolute top-0 left-0 right-0 h-1.5"
                                                style={{ backgroundColor: color }}
                                            />

                                            {/* Faded Background Canvas Waveform with Click-to-Seek */}
                                            <div
                                                onClick={(e) => handleCardWaveformSeek(e, stemName, url)}
                                                className="absolute inset-0 opacity-25 group-hover:opacity-40 transition-opacity cursor-pointer flex items-center justify-center overflow-hidden"
                                            >
                                                <CanvasWaveformPreview
                                                    peaks={peaks}
                                                    color={color}
                                                />

                                                {/* Animated Playhead Progress Sweep */}
                                                {isPreviewing && (
                                                    <div
                                                        className="absolute top-0 bottom-0 left-0 bg-white/10 pointer-events-none transition-all duration-75"
                                                        style={{ width: `${previewProgress * 100}%` }}
                                                    >
                                                        <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Top: Stem Name & Badge */}
                                            <div className="flex items-center justify-between mb-2 relative z-10">
                                                <div className="flex items-center gap-2.5">
                                                    <span
                                                        className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]"
                                                        style={{ backgroundColor: color, color }}
                                                    />
                                                    <h4 className="text-base font-black text-white tracking-tight">
                                                        {stemName}
                                                    </h4>
                                                </div>

                                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-white/5 border border-white/10 text-zinc-400 uppercase tracking-wider">
                                                    {stemName.startsWith('Merged') ? 'Merged Layer' : 'Isolated Stem'}
                                                </span>
                                            </div>

                                            {/* Card Bottom: Actions */}
                                            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5 relative z-10">
                                                <button
                                                    onClick={() => handleStemPreview(stemName, url)}
                                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                                                        isPreviewing
                                                            ? 'bg-yellow-400 text-black shadow-[0_0_10px_rgba(250,204,21,0.4)]'
                                                            : 'bg-white/10 text-white hover:bg-white/20'
                                                    }`}
                                                >
                                                    {isPreviewing ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                                                    <span>{isPreviewing ? 'Pause' : 'Preview'}</span>
                                                </button>

                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        title="Download Stem MP3"
                                                        onClick={() => handleDownloadStem(stemName, url)}
                                                        className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>

                                                    <button
                                                        title="Add to Timeline Track"
                                                        onClick={() => handleAddSingleStemToTimeline(stemName, url)}
                                                        disabled={isAddingThisStem}
                                                        className="px-3 py-1.5 rounded-xl bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-black text-xs font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                                                    >
                                                        {isAddingThisStem ? (
                                                            <>
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                <span>Adding...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Layers className="w-3 h-3" />
                                                                <span>+ Timeline</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Initial / Queued / Error / Idle Setup & Separate View */
                        <div className="p-6 sm:p-10 bg-zinc-950/80 border border-white/10 rounded-3xl backdrop-blur-2xl shadow-2xl flex flex-col items-center text-center space-y-6">
                            <div className={`p-4 rounded-3xl border ${
                                activeSong.status === 'error'
                                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                    : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                            }`}>
                                {activeSong.status === 'error' ? (
                                    <AlertCircle className="w-10 h-10" />
                                ) : (
                                    <Disc className="w-10 h-10 stroke-1" />
                                )}
                            </div>

                            <div>
                                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                    {activeSong.name}
                                </h3>
                                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                                    {activeSong.status === 'error'
                                        ? (activeSong.errorMessage || 'Separation failed. You can retry with a different pass count below.')
                                        : 'Ready to separate into 6 isolated layers (Vocals, Drums, Bass, Guitar, Piano, Other)'}
                                </p>
                            </div>

                            {/* Demucs Quality Selector: Good | Better | Best */}
                            <div className="w-full max-w-lg bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-left space-y-3.5 shadow-inner">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Award className="w-4 h-4 text-yellow-400" />
                                        <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
                                            Separation Quality
                                        </span>
                                    </div>
                                    <span className="text-[11px] font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-0.5 rounded-full">
                                        {currentPassConfig.name} Quality
                                    </span>
                                </div>

                                {/* 3-Way Good / Better / Best Segmented Selector */}
                                <div className="grid grid-cols-3 gap-2 bg-black/60 p-1.5 rounded-xl border border-white/10">
                                    {PASS_OPTIONS.map((opt) => {
                                        const isSelected = separationPasses === opt.count;
                                        return (
                                            <button
                                                key={opt.count}
                                                type="button"
                                                onClick={() => setSeparationPasses(opt.count)}
                                                className={`py-2 px-2 rounded-lg text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                                                    isSelected
                                                        ? 'bg-yellow-500 text-black shadow-md font-black'
                                                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <span className="text-xs font-black tracking-tight">{opt.name}</span>
                                                <span className={`text-[10px] font-medium ${isSelected ? 'text-black/80' : 'text-zinc-500'}`}>
                                                    {opt.badge}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Detailed Audio Quality & Timing Description */}
                                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
                                    <div className="flex items-start gap-2">
                                        <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-zinc-300">Audio Quality: </span>
                                            <span className="text-zinc-400">{currentPassConfig.quality}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-zinc-300">Processing Time: </span>
                                            <span className="text-zinc-400">{currentPassConfig.timing}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Main Separate Action Button */}
                            <button
                                onClick={handleSeparateActiveSong}
                                className="px-10 py-3.5 rounded-2xl bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 text-sm sm:text-base font-black transition-all shadow-[0_0_30px_rgba(250,204,21,0.4)] hover:shadow-[0_0_40px_rgba(250,204,21,0.6)] flex items-center gap-2.5 cursor-pointer"
                            >
                                <Sparkles className="w-5 h-5 fill-current" />
                                <span>
                                    {activeSong.status === 'error'
                                        ? 'Retry Separation'
                                        : `Separate Stems (${currentPassConfig.name} Quality)`}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper component to render canvas waveform inside stem card background
const CanvasWaveformPreview: React.FC<{ peaks?: number[]; color: string }> = ({ peaks, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = 400;
        canvas.height = 100;

        if (peaks && peaks.length > 0) {
            drawWaveformToCanvas(canvas, peaks, color, {
                startRatio: 0,
                endRatio: 1,
                gain: 1.0,
                barWidth: 3,
                barGap: 2,
            });
        }
    }, [peaks, color]);

    return <canvas ref={canvasRef} className="w-full h-full block object-cover" />;
};
