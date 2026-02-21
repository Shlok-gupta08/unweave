import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Volume2, VolumeX, Loader2, Headphones } from 'lucide-react';

interface TrackProps {
    name: string;
    url: string;
    onReady: (waversurfer: WaveSurfer) => void;
    color: string;
    isMutedBySolo: boolean;
    isSolo: boolean;
    onSoloToggle: () => void;
}

const Track: React.FC<TrackProps> = ({ name, url, onReady, color, isMutedBySolo, isSolo, onSoloToggle }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [ws, setWs] = useState<WaveSurfer | null>(null);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!containerRef.current) return;

        const wavesurfer = WaveSurfer.create({
            container: containerRef.current,
            waveColor: `${color}80`, // Adds transparency
            progressColor: color,
            cursorColor: '#ffffff',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 60,
            normalize: true,
            url: url,
        });

        wavesurfer.on('ready', () => {
            setLoading(false);
            onReady(wavesurfer);
        });

        setWs(wavesurfer);

        return () => {
            wavesurfer.destroy();
        };
    }, [url, color]);

    // Handle external or internal volume changes
    useEffect(() => {
        if (ws) {
            if (isMutedBySolo || isMuted) {
                ws.setVolume(0);
            } else {
                ws.setVolume(volume);
            }
        }
    }, [volume, isMuted, isMutedBySolo, ws]);

    return (
        <div className={`flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-md transition-all duration-300 ${isSolo ? 'border-yellow-500/50 shadow-[0_0_20px_rgba(250,204,21,0.15)] bg-white/[0.03]' : (isMutedBySolo ? 'border-white/5 bg-transparent opacity-40' : 'border-white/10 bg-white/[0.01] hover:bg-white/[0.02]')}`}>
            <div className="w-32 shrink-0 flex flex-col gap-3">
                <span className="font-bold tracking-tight text-white drop-shadow-md truncate">{name}</span>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`p-2 rounded-xl transition-all duration-300 ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'}`}
                        title="Mute"
                    >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>

                    <button
                        onClick={onSoloToggle}
                        className={`p-2 rounded-xl transition-all duration-300 ${isSolo ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)] border border-yellow-400' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'}`}
                        title="Solo"
                    >
                        <Headphones size={16} />
                    </button>

                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-16 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-500 shadow-[0_0_10px_rgba(250,204,21,0.2)]"
                    />
                </div>
            </div>

            <div className="flex-1 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10 rounded-xl">
                        <Loader2 className="w-8 h-8 text-yellow-500 animate-spin drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                    </div>
                )}
                <div ref={containerRef} className="w-full relative z-0" />
            </div>
        </div>
    );
};

export default Track;
