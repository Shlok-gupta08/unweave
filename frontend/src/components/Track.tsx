import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Volume2, VolumeX, Loader2, Download, Play, Pause } from 'lucide-react';

interface TrackProps {
    name: string;
    url: string;
    onReady: (name: string, wavesurfer: WaveSurfer) => void;
    color: string;
    isMuted: boolean;
    onMuteToggle: () => void;
    onIndividualPlay: (name: string) => void;
    onSeek: (name: string, time: number) => void;
}

const Track: React.FC<TrackProps> = ({
    name, url, onReady, color,
    isMuted, onMuteToggle,
    onIndividualPlay, onSeek,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const [volume, setVolume] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isPlayingAlone, setIsPlayingAlone] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: `${color}50`,
            progressColor: color,
            cursorColor: '#facc15',
            cursorWidth: 3,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 56,
            normalize: true,
            url: url,
            backend: 'WebAudio',
        });

        wavesurfer.on('ready', () => {
            setLoading(false);
            onReady(name, wavesurfer);
        });

        wavesurfer.on('play', () => setIsPlayingAlone(true));
        wavesurfer.on('pause', () => setIsPlayingAlone(false));
        wavesurfer.on('finish', () => setIsPlayingAlone(false));

        // Sync seeking — when user clicks on the waveform, notify parent
        wavesurfer.on('interaction', () => {
            const currentTime = wavesurfer.getCurrentTime();
            onSeek(name, currentTime);
        });

        wsRef.current = wavesurfer;

        return () => {
            wavesurfer.destroy();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    // Volume / mute sync + auto-mute at 0
    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.setVolume(isMuted ? 0 : volume);
        }
    }, [volume, isMuted]);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        // Auto-mute when slider hits 0
        if (val === 0 && !isMuted) onMuteToggle();
        // Auto-unmute when sliding back up
        if (val > 0 && isMuted) onMuteToggle();
    };

    const handleIndividualPlay = useCallback(() => {
        if (!wsRef.current || loading) return;
        onIndividualPlay(name);
        if (wsRef.current.isPlaying()) {
            wsRef.current.pause();
        } else {
            wsRef.current.play();
        }
    }, [loading, name, onIndividualPlay]);

    const handleDownload = async () => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${name}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    return (
        <div className={`relative flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-md transition-all duration-500
            ${isMuted
                ? 'border-white/[0.03] bg-black/20 opacity-35'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.03]'
            }`}
        >
            {/* Track label + controls column */}
            <div className="w-28 shrink-0 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />
                    <span className="font-bold text-sm tracking-tight text-white truncate">{name}</span>
                </div>

                {/* Button row */}
                <div className="flex items-center gap-1.5">
                    {/* Individual play */}
                    <button
                        onClick={handleIndividualPlay}
                        disabled={loading}
                        className={`p-1.5 rounded-lg transition-all duration-300
                            ${loading ? 'text-zinc-700 cursor-not-allowed'
                                : isPlayingAlone ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
                            }`}
                        title={isPlayingAlone ? 'Pause' : 'Play'}
                    >
                        {isPlayingAlone ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>

                    {/* Mute */}
                    <button
                        onClick={onMuteToggle}
                        className={`p-1.5 rounded-lg transition-all duration-300
                            ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
                            }`}
                        title="Mute"
                    >
                        {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>

                    {/* Download */}
                    <button
                        onClick={handleDownload}
                        className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 transition-all duration-300"
                        title={`Download ${name}`}
                    >
                        <Download size={14} />
                    </button>
                </div>

                {/* Volume slider */}
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                />
            </div>

            {/* Waveform */}
            <div className="flex-1 relative min-w-0">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-xl">
                        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
                    </div>
                )}
                <div ref={containerRef} className="w-full relative z-0" />
            </div>
        </div>
    );
};

export default Track;
