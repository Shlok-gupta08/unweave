import React, { useState, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, Download, FolderDown } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import JSZip from 'jszip';
import Track from './Track';
import type { Stems } from '../types';

interface MixerProps {
    stems: Stems;
}

const COLORS: Record<string, string> = {
    Vocals: '#ef4444',
    Drums: '#f59e0b',
    Bass: '#3b82f6',
    Guitar: '#10b981',
    Piano: '#8b5cf6',
    Other: '#64748b',
};

export const Mixer: React.FC<MixerProps> = ({ stems }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const wavesurfers = useRef<Map<string, WaveSurfer>>(new Map());
    const readySet = useRef<Set<string>>(new Set());
    const [loadedCount, setLoadedCount] = useState(0);
    const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set());
    const [isDownloading, setIsDownloading] = useState(false);

    const lastPlayMode = useRef<'all' | 'individual' | null>(null);

    const trackNames = Object.keys(stems).filter(k => stems[k as keyof Stems]);
    const totalTracks = trackNames.length;
    const isAllLoaded = loadedCount >= totalTracks && totalTracks > 0;

    const handleTrackReady = useCallback((name: string, ws: WaveSurfer) => {
        wavesurfers.current.set(name, ws);
        if (!readySet.current.has(name)) {
            readySet.current.add(name);
            setLoadedCount(readySet.current.size);
        }

        ws.on('finish', () => {
            let allFinished = true;
            wavesurfers.current.forEach(w => {
                if (w.isPlaying()) allFinished = false;
            });
            if (allFinished) setIsPlaying(false);
        });
    }, []);

    // Synced seeking: when user clicks on one track's waveform, sync all others
    const handleSeek = useCallback((sourceName: string, time: number) => {
        wavesurfers.current.forEach((ws, key) => {
            if (key !== sourceName) {
                ws.setTime(time);
            }
        });
    }, []);

    const handleIndividualPlay = useCallback((trackName: string) => {
        lastPlayMode.current = 'individual';
        wavesurfers.current.forEach((ws, key) => {
            if (key !== trackName && ws.isPlaying()) {
                ws.pause();
            }
        });
        setIsPlaying(false);
    }, []);

    const togglePlayAll = useCallback(() => {
        if (!isAllLoaded) return;

        if (isPlaying) {
            wavesurfers.current.forEach(ws => ws.pause());
            setIsPlaying(false);
        } else {
            // If coming from individual mode, reset all to start
            if (lastPlayMode.current === 'individual') {
                wavesurfers.current.forEach(ws => {
                    ws.stop();
                    ws.setTime(0);
                });
            }
            lastPlayMode.current = 'all';
            wavesurfers.current.forEach(ws => ws.play());
            setIsPlaying(true);
        }
    }, [isAllLoaded, isPlaying]);

    const stopAll = useCallback(() => {
        if (!isAllLoaded) return;
        wavesurfers.current.forEach(ws => {
            ws.stop();
            ws.setTime(0);
        });
        setIsPlaying(false);
        lastPlayMode.current = null;
    }, [isAllLoaded]);

    const toggleMute = useCallback((trackName: string) => {
        setMutedTracks(prev => {
            const next = new Set(prev);
            if (next.has(trackName)) next.delete(trackName);
            else next.add(trackName);
            return next;
        });
    }, []);

    // Download all stems as a zip with save-as dialog
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

            // Use showSaveFilePicker for native save-as dialog if available
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: 'Unweave_Stems.zip',
                        types: [{
                            description: 'ZIP Archive',
                            accept: { 'application/zip': ['.zip'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(content);
                    await writable.close();
                } catch (err: any) {
                    // User cancelled the dialog — fall back to auto-download
                    if (err.name !== 'AbortError') {
                        triggerDownload(content);
                    }
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

    return (
        <div className="w-full mx-auto mt-4 flex flex-col gap-6">
            {/* Master Controls */}
            <div className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex items-center gap-4 relative z-10">
                    <button
                        onClick={togglePlayAll}
                        disabled={!isAllLoaded}
                        className={`flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${isAllLoaded
                                ? 'bg-yellow-500 hover:bg-yellow-400 hover:scale-105 text-black shadow-[0_0_20px_rgba(250,204,21,0.4)]'
                                : 'bg-white/5 text-zinc-600 cursor-not-allowed border border-white/10'
                            }`}
                    >
                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button
                        onClick={stopAll}
                        disabled={!isAllLoaded}
                        className={`p-3 rounded-full transition-all duration-300 ${isAllLoaded
                                ? 'text-zinc-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10'
                                : 'text-zinc-700 cursor-not-allowed'
                            }`}
                        title="Reset to start"
                    >
                        <RotateCcw size={20} />
                    </button>
                    {isAllLoaded && (
                        <span className="text-xs text-zinc-500 font-medium ml-1">
                            {isPlaying ? 'Playing all' : 'Play all tracks'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    {/* Download all */}
                    {isAllLoaded && (
                        <button
                            onClick={handleDownloadAll}
                            disabled={isDownloading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 text-zinc-300 text-sm font-semibold transition-all duration-300 backdrop-blur-md"
                            title="Download all stems as ZIP"
                        >
                            {isDownloading
                                ? <><div className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" /> Zipping...</>
                                : <><FolderDown size={16} /> Save All</>
                            }
                        </button>
                    )}

                    {!isAllLoaded && (
                        <div className="text-sm text-zinc-400 font-medium tracking-wide flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                            <div className="w-4 h-4 rounded-full border-2 border-yellow-500/30 border-t-yellow-500 animate-spin" />
                            Loading audio engine ({loadedCount}/{totalTracks})
                        </div>
                    )}
                </div>
            </div>

            {/* Tracks */}
            <div className="flex flex-col gap-3">
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
                            isMuted={mutedTracks.has(name)}
                            onMuteToggle={() => toggleMute(name)}
                            onIndividualPlay={handleIndividualPlay}
                            onSeek={handleSeek}
                        />
                    );
                })}
            </div>
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
