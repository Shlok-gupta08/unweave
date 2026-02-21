import React, { useState, useCallback, useRef } from 'react';
import { Play, Pause, Rewind } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import Track from './Track';
import type { Stems } from '../types';

interface MixerProps {
    stems: Stems;
}

const COLORS: Record<string, string> = {
    Vocals: '#ef4444',   // red-500
    Drums: '#f59e0b',    // amber-500
    Bass: '#3b82f6',     // blue-500
    Guitar: '#10b981',   // emerald-500
    Piano: '#8b5cf6',    // py-500
    Other: '#64748b',    // slate-500
};

export const Mixer: React.FC<MixerProps> = ({ stems }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const wavesurfers = useRef<Map<string, WaveSurfer>>(new Map());
    const [loadedCount, setLoadedCount] = useState(0);

    const totalTracks = Object.keys(stems).filter(k => stems[k as keyof Stems]).length;
    const isAllLoaded = loadedCount === totalTracks;

    const handleTrackReady = useCallback((name: string, ws: WaveSurfer) => {
        wavesurfers.current.set(name, ws);
        setLoadedCount(prev => prev + 1);

        // Sync seeking
        ws.on('interaction', () => {
            const currentTime = ws.getCurrentTime();
            wavesurfers.current.forEach((otherWs, key) => {
                if (key !== name) {
                    otherWs.setTime(currentTime);
                }
            });
        });

        // Auto-stop when finished
        ws.on('finish', () => {
            setIsPlaying(false);
            wavesurfers.current.forEach(w => w.stop());
        });
    }, []);

    const [soloTrack, setSoloTrack] = useState<string | null>(null);

    const togglePlayPause = () => {
        if (!isAllLoaded) return;

        if (isPlaying) {
            wavesurfers.current.forEach(ws => ws.pause());
        } else {
            wavesurfers.current.forEach(ws => ws.play());
        }
        setIsPlaying(!isPlaying);
    };

    const stopPlayback = () => {
        if (!isAllLoaded) return;
        wavesurfers.current.forEach(ws => {
            ws.stop();
            ws.setTime(0);
        });
        setIsPlaying(false);
    };

    const toggleSolo = (trackName: string) => {
        setSoloTrack(prev => prev === trackName ? null : trackName);
    };

    return (
        <div className="w-full mx-auto mt-4 flex flex-col gap-8">
            {/* Master Controls */}
            <div className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex items-center gap-5 relative z-10">
                    <button
                        onClick={togglePlayPause}
                        disabled={!isAllLoaded}
                        className={`flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 ${isAllLoaded ? 'bg-yellow-500 hover:bg-yellow-400 hover:scale-105 text-black shadow-[0_0_20px_rgba(250,204,21,0.4)]' : 'bg-white/5 text-zinc-600 cursor-not-allowed border border-white/10'}`}
                    >
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <button
                        onClick={stopPlayback}
                        disabled={!isAllLoaded}
                        className={`p-4 rounded-full transition-all duration-300 ${isAllLoaded ? 'text-zinc-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10' : 'text-zinc-700 cursor-not-allowed'}`}
                    >
                        <Rewind size={24} />
                    </button>
                </div>

                {!isAllLoaded && (
                    <div className="text-sm text-zinc-400 font-medium tracking-wide flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                        <div className="w-4 h-4 rounded-full border-2 border-yellow-500/30 border-t-yellow-500 animate-spin" />
                        Loading audio engine ({loadedCount}/{totalTracks})
                    </div>
                )}
            </div>

            {/* Tracks */}
            <div className="flex flex-col gap-4">
                {Object.entries(stems).map(([name, url]) => {
                    if (!url) return null;
                    const isMutedBySolo = soloTrack !== null && soloTrack !== name;
                    return (
                        <Track
                            key={name}
                            name={name}
                            url={url}
                            color={COLORS[name] || COLORS.Other}
                            onReady={(ws) => handleTrackReady(name, ws)}
                            isMutedBySolo={isMutedBySolo}
                            isSolo={soloTrack === name}
                            onSoloToggle={() => toggleSolo(name)}
                        />
                    );
                })}
            </div>
        </div>
    );
};
