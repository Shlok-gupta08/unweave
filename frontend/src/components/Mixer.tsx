import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, History, FolderDown, Plus, X, Volume2, Undo2, Redo2 } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import JSZip from 'jszip';
import Track from './Track';
import { MergeDialog } from './MergeDialog';
import { mergeStemsToBuffer, audioBufferToMP3Blob } from '../utils/audioUtils';
import type { Stems } from '../types';

interface MixerProps {
    stems: Stems;
    onAddStem?: (name: string, url: string, blob?: Blob) => void;
    onRemoveStem?: (name: string) => void;
}

const COLORS: Record<string, string> = {
    Vocals: '#ef4444',
    Drums: '#f59e0b',
    Bass: '#3b82f6',
    Guitar: '#10b981',
    Piano: '#8b5cf6',
    Other: '#64748b',
};

const MARKER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

type Marker = {
    id: string;
    label: string;
    time: number;
    color: string;
};

type MixerState = {
    mutedTracks: string[];
    markers: Marker[];
};

// Drift correction: how often to check alignment (ms)
const SYNC_INTERVAL_MS = 200;
// Maximum allowed drift before correcting (seconds)
const DRIFT_THRESHOLD = 0.05;

export const Mixer: React.FC<MixerProps> = ({ stems, onAddStem, onRemoveStem }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const wavesurfers = useRef<Map<string, WaveSurfer>>(new Map());
    const readySet = useRef<Set<string>>(new Set());
    const [loadedCount, setLoadedCount] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [duration, setDuration] = useState(0);

    // Ref to track the sync interval for drift correction
    const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Ref to track playing state in callbacks without stale closures
    const isPlayingRef = useRef(false);

    const trackNames = Object.keys(stems).filter(k => stems[k as keyof Stems]);
    const totalTracks = trackNames.length;
    const isAllLoaded = loadedCount >= totalTracks && totalTracks > 0;

    // Merge Feature State
    const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
    const [isMerging, setIsMerging] = useState(false);

    // Undo / Redo History State
    const [history, setHistory] = useState<MixerState[]>([{ mutedTracks: [], markers: [] }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const currentState = history[historyIndex] || { mutedTracks: [], markers: [] };
    const [markerWarning, setMarkerWarning] = useState(false);

    const pushState = useCallback((newStatePart: Partial<MixerState>) => {
        setHistory(prev => {
            const current = prev[historyIndex];
            const nextState = { ...current, ...newStatePart };
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(nextState);
            return newHistory;
        });
        setHistoryIndex(prev => prev + 1);
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        setHistoryIndex(prev => Math.max(0, prev - 1));
    }, []);

    const handleRedo = useCallback(() => {
        setHistoryIndex(prev => Math.min(history.length - 1, prev + 1));
    }, [history.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    // ──────────────────────────────────────────────
    // Drift correction: periodically re-align tracks while playing
    // ──────────────────────────────────────────────
    const startSyncInterval = useCallback(() => {
        // Clear any existing interval first
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
        }

        syncIntervalRef.current = setInterval(() => {
            if (!isPlayingRef.current) return;

            const allWs = Array.from(wavesurfers.current.values());
            if (allWs.length < 2) return;

            // Use the first track as the master clock
            const master = allWs[0];
            if (!master.isPlaying()) return;

            const masterTime = master.getCurrentTime();

            for (let i = 1; i < allWs.length; i++) {
                const ws = allWs[i];
                const drift = Math.abs(ws.getCurrentTime() - masterTime);
                if (drift > DRIFT_THRESHOLD) {
                    ws.setTime(masterTime);
                }
            }
        }, SYNC_INTERVAL_MS);
    }, []);

    const stopSyncInterval = useCallback(() => {
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }
    }, []);

    // Clean up interval on unmount
    useEffect(() => {
        return () => stopSyncInterval();
    }, [stopSyncInterval]);

    // ──────────────────────────────────────────────
    // Track ready handler
    // ──────────────────────────────────────────────
    const handleTrackReady = useCallback((name: string, ws: WaveSurfer) => {
        wavesurfers.current.set(name, ws);
        if (!readySet.current.has(name)) {
            readySet.current.add(name);
            setLoadedCount(readySet.current.size);
            if (readySet.current.size === 1) {
                setDuration(ws.getDuration());
            }
        }

        // Coordinated finish: when a track finishes, wait a tick then check if ALL are done
        ws.on('finish', () => {
            setTimeout(() => {
                let allFinished = true;
                wavesurfers.current.forEach(w => {
                    if (w.isPlaying()) allFinished = false;
                });
                if (allFinished) {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    stopSyncInterval();
                }
            }, 50);
        });
    }, [stopSyncInterval]);

    // ──────────────────────────────────────────────
    // Core play / pause / stop — all tracks move together
    // ──────────────────────────────────────────────
    const togglePlayAll = useCallback((forcePlay?: boolean) => {
        if (!isAllLoaded) return;

        if (isPlaying && !forcePlay) {
            // ─── PAUSE ALL ───
            wavesurfers.current.forEach(ws => ws.pause());
            isPlayingRef.current = false;
            setIsPlaying(false);
            stopSyncInterval();
        } else {
            // ─── PLAY ALL with alignment ───
            // 1. Pause everything first to get a consistent baseline
            wavesurfers.current.forEach(ws => {
                if (ws.isPlaying()) ws.pause();
            });

            // 2. Read the baseline time from the first track
            let baseline = 0;
            const firstWs = wavesurfers.current.get(trackNames[0]);
            if (firstWs) baseline = firstWs.getCurrentTime();

            // 3. Align every track to the baseline
            wavesurfers.current.forEach(ws => {
                if (Math.abs(ws.getCurrentTime() - baseline) > 0.01) {
                    ws.setTime(baseline);
                }
            });

            // 4. Play all tracks together (mute states are preserved)
            wavesurfers.current.forEach(ws => ws.play());

            isPlayingRef.current = true;
            setIsPlaying(true);
            startSyncInterval();
        }
    }, [isAllLoaded, isPlaying, trackNames, startSyncInterval, stopSyncInterval]);

    const stopAll = useCallback(() => {
        if (!isAllLoaded) return;
        wavesurfers.current.forEach(ws => {
            ws.pause();
            ws.setTime(0);
        });
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopSyncInterval();
    }, [isAllLoaded, stopSyncInterval]);

    // ──────────────────────────────────────────────
    // Seek handler — called by Track when user clicks waveform
    // WaveSurfer already seeked the source track internally, so we only align the OTHER tracks.
    // ──────────────────────────────────────────────
    const handleSeek = useCallback((sourceName: string, time: number) => {
        const wasPlaying = isPlayingRef.current;

        // 1. Pause everything to avoid drift while seeking
        wavesurfers.current.forEach(ws => {
            if (ws.isPlaying()) ws.pause();
        });

        // 2. Set OTHER tracks to the same time (source was already seeked by WaveSurfer)
        wavesurfers.current.forEach((ws, key) => {
            if (key !== sourceName) {
                ws.setTime(time);
            }
        });

        // 3. Resume playback if was playing
        if (wasPlaying) {
            wavesurfers.current.forEach(ws => ws.play());
        }
    }, []);

    // ──────────────────────────────────────────────
    // Solo play: mute all OTHER tracks, then play all in sync.
    // If already playing this track solo, pause everything.
    // ──────────────────────────────────────────────
    const handleSoloPlay = useCallback((soloTrackName: string) => {
        if (!isAllLoaded) return;

        // If currently playing and this track is already the only unmuted one, pause all
        const isAlreadySoloed = isPlaying &&
            currentState.mutedTracks.length === trackNames.length - 1 &&
            !currentState.mutedTracks.includes(soloTrackName);

        if (isPlaying && isAlreadySoloed) {
            // Pause all
            wavesurfers.current.forEach(ws => ws.pause());
            isPlayingRef.current = false;
            setIsPlaying(false);
            stopSyncInterval();
            return;
        }

        // Mute every track except the solo one
        const newMuted = trackNames.filter(n => n !== soloTrackName);
        pushState({ mutedTracks: newMuted });

        // Set volumes immediately (don't wait for React re-render)
        wavesurfers.current.forEach((ws, key) => {
            ws.setVolume(key === soloTrackName ? 1 : 0.000001);
        });

        // If not already playing, start synced playback
        if (!isPlaying) {
            // Pause everything first to get a consistent baseline
            wavesurfers.current.forEach(ws => {
                if (ws.isPlaying()) ws.pause();
            });

            // Read baseline from first track
            let baseline = 0;
            const firstWs = wavesurfers.current.get(trackNames[0]);
            if (firstWs) baseline = firstWs.getCurrentTime();

            // Align all
            wavesurfers.current.forEach(ws => {
                if (Math.abs(ws.getCurrentTime() - baseline) > 0.01) {
                    ws.setTime(baseline);
                }
            });

            // Play all
            wavesurfers.current.forEach(ws => ws.play());

            isPlayingRef.current = true;
            setIsPlaying(true);
            startSyncInterval();
        }
    }, [isAllLoaded, isPlaying, trackNames, currentState.mutedTracks, pushState, startSyncInterval, stopSyncInterval]);

    // ──────────────────────────────────────────────
    // Muting / Soloing — re-sync on unmute
    // ──────────────────────────────────────────────
    const toggleMute = useCallback((trackName: string) => {
        const nextMuted = new Set(currentState.mutedTracks);
        const wasUnmuting = nextMuted.has(trackName);
        if (wasUnmuting) {
            nextMuted.delete(trackName);
        } else {
            nextMuted.add(trackName);
        }
        pushState({ mutedTracks: Array.from(nextMuted) });

        // If we just unmuted a track and playback is active, re-sync it
        if (wasUnmuting && isPlayingRef.current) {
            const masterWs = wavesurfers.current.get(trackNames[0]);
            const targetWs = wavesurfers.current.get(trackName);
            if (masterWs && targetWs) {
                const masterTime = masterWs.getCurrentTime();
                targetWs.setTime(masterTime);
            }
        }
    }, [currentState.mutedTracks, pushState, trackNames]);

    const unmuteAll = useCallback(() => {
        pushState({ mutedTracks: [] });

        // Re-sync all tracks when unmuting all
        if (isPlayingRef.current) {
            const masterWs = wavesurfers.current.get(trackNames[0]);
            if (masterWs) {
                const masterTime = masterWs.getCurrentTime();
                wavesurfers.current.forEach((ws, key) => {
                    if (key !== trackNames[0] && Math.abs(ws.getCurrentTime() - masterTime) > 0.01) {
                        ws.setTime(masterTime);
                    }
                });
            }
        }
    }, [pushState, trackNames]);

    // Markers
    const addMarker = () => {
        if (currentState.markers.length >= 3) {
            setMarkerWarning(true);
            setTimeout(() => setMarkerWarning(false), 3000);
            return;
        }
        const ws = wavesurfers.current.get(trackNames[0]);
        const time = ws ? ws.getCurrentTime() : 0;

        const newMarkers = [...currentState.markers, {
            id: `marker-${Date.now()}`,
            label: `Marker ${currentState.markers.length + 1}`,
            time,
            color: MARKER_COLORS[currentState.markers.length]
        }];
        pushState({ markers: newMarkers });
    };

    const removeMarker = (indexToRemove: number) => {
        const filtered = currentState.markers.filter((_, i) => i !== indexToRemove);
        const renamed = filtered.map((m, i) => ({
            ...m,
            label: `Marker ${i + 1}`,
            color: MARKER_COLORS[i]
        }));
        pushState({ markers: renamed });
    };

    const jumpToMarker = (time: number) => {
        const wasPlaying = isPlayingRef.current;

        // Pause all first
        wavesurfers.current.forEach(ws => {
            if (ws.isPlaying()) ws.pause();
        });

        // Set all to the marker time
        wavesurfers.current.forEach(ws => ws.setTime(time));

        // Resume if was playing
        if (wasPlaying) {
            wavesurfers.current.forEach(ws => ws.play());
        }
    };

    const handleDownloadAll = useCallback(async () => {
        setIsDownloading(true);
        try {
            const zip = new JSZip();
            const folder = zip.folder('Unweave_Stems');
            if (!folder) throw new Error('Failed to create zip folder');

            const downloads = trackNames.map(async (name) => {
                const url = stems[name as keyof Stems];
                if (!url) return;
                const res = await fetch(url);
                const blob = await res.blob();
                folder.file(`${name}.mp3`, blob);
            });

            await Promise.all(downloads);
            const content = await zip.generateAsync({ type: 'blob' });

            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: 'Unweave_Stems.zip',
                        types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(content);
                    await writable.close();
                } catch (err: any) {
                    if (err.name !== 'AbortError') triggerDownload(content);
                }
            } else {
                triggerDownload(content);
            }
        } catch (err) {
            console.error('Download all failed:', err);
        } finally {
            setIsDownloading(false);
        }
    }, [stems, trackNames]);

    const handleMergeLayers = async (selectedLayers: string[]) => {
        setIsMerging(true);
        try {
            const urls = selectedLayers.map(layer => stems[layer as keyof Stems]).filter(Boolean) as string[];
            if (urls.length === 0) throw new Error("No valid tracks selected");

            const mixedBuffer = await mergeStemsToBuffer(urls);
            const mp3Blob = audioBufferToMP3Blob(mixedBuffer);
            const blobUrl = URL.createObjectURL(mp3Blob);

            const existingMergedCount = trackNames.filter(n => n.startsWith('Merged')).length;
            const newName = `Merged ${existingMergedCount + 1} (${selectedLayers.join(', ')})`;

            if (onAddStem) {
                onAddStem(newName, blobUrl);
            }
        } catch (err) {
            console.error('Merge failed:', err);
            alert("Failed to merge layers. See console for details.");
        } finally {
            setIsMerging(false);
            setIsMergeDialogOpen(false);
        }
    };

    return (
        <div className="w-full mx-auto mt-4 flex flex-col gap-6">
            {/* Master Controls & Markers Navbar */}
            <div className="flex flex-col gap-4 p-4 sm:p-5 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10 w-full">
                    {/* Universal Controls (Squarish, Equal Size) */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => togglePlayAll()}
                            disabled={!isAllLoaded}
                            className={`flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl transition-all duration-300 ${isAllLoaded
                                ? 'bg-yellow-500 hover:bg-yellow-400 hover:scale-105 text-black shadow-[0_0_20px_rgba(250,204,21,0.4)]'
                                : 'bg-white/5 text-zinc-600 cursor-not-allowed border border-white/10'
                                }`}
                            title="Play/Pause Universal Pointer"
                        >
                            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <button
                            onClick={stopAll}
                            disabled={!isAllLoaded}
                            className={`flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl transition-all duration-300 ${isAllLoaded
                                ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-300'
                                : 'bg-white/5 text-zinc-700 cursor-not-allowed border border-white/5'
                                }`}
                            title="Reset Position"
                        >
                            <History size={20} />
                        </button>
                        <button
                            onClick={unmuteAll}
                            disabled={!isAllLoaded}
                            className={`flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl transition-all duration-300 ${isAllLoaded
                                ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-300'
                                : 'bg-white/5 text-zinc-700 cursor-not-allowed border border-white/5'
                                }`}
                            title="Unmute All Layers"
                        >
                            <Volume2 size={20} />
                        </button>

                        {isAllLoaded && (
                            <div className="ml-2 flex items-center gap-2 border-l border-white/10 pl-5">
                                <button
                                    onClick={handleUndo}
                                    disabled={historyIndex === 0}
                                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${historyIndex > 0
                                        ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-300'
                                        : 'bg-transparent text-zinc-700 cursor-not-allowed border border-white/5'
                                        }`}
                                    title="Undo (Ctrl+Z)"
                                >
                                    <Undo2 size={18} />
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${historyIndex < history.length - 1
                                        ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-300'
                                        : 'bg-transparent text-zinc-700 cursor-not-allowed border border-white/5'
                                        }`}
                                    title="Redo (Ctrl+Y)"
                                >
                                    <Redo2 size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4 relative z-10 w-full sm:w-auto">
                        {/* Markers Subnavbar */}
                        {isAllLoaded && (
                            <div className="flex flex-wrap items-center justify-center gap-2 bg-black/20 p-2 rounded-2xl border border-white/5">
                                {currentState.markers.map((m, idx) => (
                                    <button key={m.id} onClick={() => jumpToMarker(m.time)}
                                        className="relative group px-2 py-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all hover:scale-105"
                                        style={{ backgroundColor: `${m.color}15`, color: m.color, border: `1px solid ${m.color}40` }}
                                        title={`Jump to ${m.label}`}>
                                        <span className="whitespace-nowrap">{m.label}</span>
                                        <div onClick={(e) => { e.stopPropagation(); removeMarker(idx); }}
                                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                                            title="Remove Marker">
                                            <X size={12} strokeWidth={3} />
                                        </div>
                                    </button>
                                ))}
                                {currentState.markers.length < 3 && (
                                    <button onClick={addMarker}
                                        className={`w-9 h-9 border-2 border-dashed border-white/30 rounded-xl flex items-center justify-center text-white/50 hover:bg-white/10 hover:border-white/50 hover:text-white transition-all ${currentState.markers.length > 0 ? 'ml-1' : ''}`}
                                        title="Add Marker (saves current time)">
                                        <Plus size={18} strokeWidth={2.5} />
                                    </button>
                                )}
                                {markerWarning && (
                                    <span className="text-red-400 text-xs font-semibold ml-1 animate-in fade-in slide-in-from-left-2 whitespace-nowrap">Max 3 markers</span>
                                )}
                            </div>
                        )}

                        {/* Download all */}
                        {isAllLoaded && (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <div className="hidden sm:block h-10 w-px bg-white/10 mr-1" />
                                <button
                                    onClick={() => setIsMergeDialogOpen(true)}
                                    className="flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 h-12 sm:h-14 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 hover:border-yellow-500/50 text-yellow-500 text-sm font-semibold transition-all duration-300 backdrop-blur-md"
                                    title="Export combined layers as MP3"
                                >
                                    Merge to MP3
                                </button>
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={isDownloading}
                                    className="flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-3 h-12 sm:h-14 rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 text-zinc-300 text-sm font-semibold transition-all duration-300 backdrop-blur-md"
                                    title="Download all stems as ZIP"
                                >
                                    {isDownloading
                                        ? <><div className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" /> Zipping...</>
                                        : <><FolderDown size={18} /> Save All</>
                                    }
                                </button>
                            </div>
                        )}
                        {!isAllLoaded && (
                            <div className="text-sm text-zinc-400 font-medium flex items-center gap-3 bg-black/40 px-4 py-3 h-14 rounded-xl border border-white/5">
                                <div className="w-4 h-4 rounded-full border-2 border-yellow-500/30 border-t-yellow-500 animate-spin" />
                                Loading engine ({loadedCount}/{totalTracks})
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tracks Container */}
            <div className="flex flex-col gap-3 relative">
                {/* Visual Markers Line Above Tracks Overlay */}
                {isAllLoaded && duration > 0 && currentState.markers.length > 0 && (
                    <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none z-20 flex flex-col">
                        <div className="relative flex items-center gap-2 sm:gap-4 px-3 sm:px-4 h-full">
                            <div className="w-20 sm:w-28 shrink-0" /> {/* Spacer for track label width */}
                            <div className="flex-1 relative min-w-0 h-full">
                                {currentState.markers.map(m => {
                                    const pct = Math.max(0, Math.min(100, (m.time / duration) * 100));
                                    return (
                                        <div key={m.id}
                                            style={{ left: `${pct}%`, borderColor: `${m.color}80` }}
                                            className="absolute top-0 bottom-0 border-l-2 border-dashed flex flex-col items-center"
                                        >
                                            {/* Tiny pointer triangle at the top */}
                                            <div
                                                className="w-3 h-3 -ml-[7px] rotate-45 border-t-2 border-l-2 mt-1 rounded-sm shadow-sm"
                                                style={{ borderColor: m.color, backgroundColor: `${m.color}40`, backdropFilter: 'blur(4px)' }}
                                                title={m.label}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {trackNames.map((name) => {
                    const url = stems[name as keyof Stems];
                    if (!url) return null;
                    return (
                        <Track
                            key={name}
                            name={name}
                            url={url}
                            color={COLORS[name] || COLORS.Other}
                            onReady={handleTrackReady}
                            isMuted={currentState.mutedTracks.includes(name)}
                            isGlobalPlaying={isPlaying}
                            onMuteToggle={() => toggleMute(name)}
                            onSeek={handleSeek}
                            onSoloPlay={handleSoloPlay}
                            onRemove={name.startsWith('Merged') ? () => onRemoveStem?.(name) : undefined}
                        />
                    );
                })}
            </div>

            {/* Merge Dialog */}
            {isMergeDialogOpen && (
                <MergeDialog
                    availableTracks={trackNames}
                    onClose={() => setIsMergeDialogOpen(false)}
                    onMerge={handleMergeLayers}
                    isMerging={isMerging}
                />
            )}
        </div>
    );
};

// Helper to trigger browser download
function triggerDownload(blob: Blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Unweave_Stems.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
