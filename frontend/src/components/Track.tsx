import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Volume2, VolumeX, Loader2, Download, Play, Pause, Trash2 } from 'lucide-react';

interface TrackProps {
    name: string;
    url: string;
    onReady: (name: string, wavesurfer: WaveSurfer) => void;
    color: string;
    isMuted: boolean;
    isGlobalPlaying: boolean;
    onMuteToggle: () => void;
    onSeek: (name: string, time: number) => void;
    onSoloPlay: (name: string) => void;
    onRemove?: () => void;
}

const Track: React.FC<TrackProps> = ({
    name, url, onReady, color,
    isMuted, isGlobalPlaying, onMuteToggle,
    onSeek, onSoloPlay, onRemove
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const [volume, setVolume] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!containerRef.current) return;

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: `${color}50`,
            progressColor: color,
            cursorColor: '#facc15',
            cursorWidth: 2,
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

        // Sync seeking — WaveSurfer v7 emits 'interaction' with time in SECONDS.
        // WaveSurfer also internally seeks this track before firing this event.
        wavesurfer.on('interaction', (timeInSeconds: number) => {
            onSeek(name, timeInSeconds);
        });

        wavesurfer.on('error', (err) => {
            console.error('WaveSurfer error on track', name, err);
            setLoading(false);
        });

        wsRef.current = wavesurfer;

        return () => {
            wavesurfer.destroy();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    // Volume / mute sync — near-zero volume keeps the Web Audio pipeline alive so it doesn't desync.
    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.setVolume(isMuted ? 0.000001 : volume);
        }
    }, [volume, isMuted]);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (val === 0 && !isMuted) onMuteToggle();
        if (val > 0 && isMuted) onMuteToggle();
    };

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

    // Determine if this specific track is audible (playing + not muted)
    const isTrackAudible = isGlobalPlaying && !isMuted;

    return (
        <div className={`relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border backdrop-blur-md transition-all duration-500
            ${isMuted
                ? 'border-white/[0.03] bg-black/20 opacity-35 hover:opacity-100'
                : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.03]'
            }`}
        >
            {/* Track label + controls row */}
            <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-2 sm:w-28 shrink-0">
                {/* Name badge */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />
                    <span className="font-bold text-xs sm:text-sm tracking-tight text-white truncate max-w-[80px] sm:max-w-none" title={name}>{name}</span>
                </div>

                {/* Button row — inline on mobile, below label on desktop */}
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    {/* Solo Play */}
                    <button
                        onClick={() => onSoloPlay(name)}
                        disabled={loading}
                        className={`p-2 sm:p-1.5 rounded-lg transition-all duration-300 ${isTrackAudible
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 active:scale-95'
                            : 'bg-white/5 text-zinc-400 hover:text-white active:scale-95 hover:bg-white/10 border border-white/5'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={isTrackAudible ? `Pause` : `Solo ${name}`}
                    >
                        {isTrackAudible ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>

                    {/* Mute */}
                    <button
                        onClick={onMuteToggle}
                        className={`p-2 sm:p-1.5 rounded-lg transition-all duration-300
                            ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95'
                                : 'bg-white/5 text-zinc-400 hover:text-white active:scale-95 hover:bg-white/10 border border-white/5'
                            }`}
                        title={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>

                    {/* Download */}
                    <button
                        onClick={handleDownload}
                        className="p-2 sm:p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-emerald-400 active:scale-95 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 transition-all duration-300"
                        title={`Download ${name}`}
                    >
                        <Download size={14} />
                    </button>

                    {/* Delete (only for merged tracks) */}
                    {onRemove && (
                        <button
                            onClick={onRemove}
                            className="p-2 sm:p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-red-400 active:scale-95 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 transition-all duration-300"
                            title={`Delete ${name}`}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}

                    {/* Volume slider — inline on mobile */}
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-16 sm:w-20 h-1.5 rounded-lg cursor-pointer accent-yellow-500 ml-1"
                    />
                </div>
            </div>

            {/* Waveform */}
            <div className="flex-1 relative min-w-0" style={{ touchAction: 'none' }}>
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
