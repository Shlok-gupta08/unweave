import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Trash2, Check, X } from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';
import type { TimelineTrack } from '../../types';

interface TimelineTrackHeaderProps {
    track: TimelineTrack;
    isSelected: boolean;
    onSelect: (isMultiSelect?: boolean) => void;
}

export const TimelineTrackHeader: React.FC<TimelineTrackHeaderProps> = ({
    track,
    isSelected,
    onSelect,
}) => {
    const { updateTrack, toggleTrackMute, toggleTrackSolo, removeTrack } = useTimeline();
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameVal, setNameVal] = useState(track.name);
    const [showEQ, setShowEQ] = useState(false);
    const eqPopoverRef = useRef<HTMLDivElement>(null);

    // Close EQ popover when clicking outside
    useEffect(() => {
        if (!showEQ) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (eqPopoverRef.current && !eqPopoverRef.current.contains(e.target as Node)) {
                setShowEQ(false);
            }
        };
        window.addEventListener('mousedown', handleOutsideClick);
        return () => window.removeEventListener('mousedown', handleOutsideClick);
    }, [showEQ]);

    const handleNameSubmit = () => {
        setIsEditingName(false);
        if (nameVal.trim()) {
            updateTrack(track.id, { name: nameVal.trim() }, true);
        }
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

    return (
        <div
            onClick={(e) => {
                const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
                onSelect(isMulti);
            }}
            className={`w-64 h-24 p-2.5 bg-zinc-950 border-r border-b transition-all duration-150 flex flex-col justify-between select-none relative group cursor-pointer ${
                isSelected
                    ? 'bg-yellow-500/[0.08] border-yellow-500/40 shadow-[inset_0_0_12px_rgba(250,204,21,0.06)]'
                    : 'border-white/10 hover:bg-zinc-900/40'
            }`}
        >
            {/* Left Color Swatch Line */}
            <div
                className={`absolute left-0 top-0 bottom-0 transition-all ${
                    isSelected ? 'w-1.5 shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'w-1'
                }`}
                style={{ backgroundColor: isSelected ? '#facc15' : track.color }}
            />

            {/* Top Row: Track Name & Track Actions */}
            <div className="flex items-center justify-between gap-1 pl-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <button
                        type="button"
                        title={isSelected ? "Selected (Click to deselect)" : "Click to select layer (Cmd+Click for multi-selection)"}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(true);
                        }}
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            isSelected
                                ? 'bg-yellow-400 border-yellow-400 text-black shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                                : 'border-white/20 bg-white/5 hover:border-yellow-400/60'
                        }`}
                    >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </button>
                    <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: track.color }}
                    />
                    {isEditingName ? (
                        <div className="flex items-center gap-1 flex-1">
                            <input
                                type="text"
                                value={nameVal}
                                onChange={(e) => setNameVal(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                                autoFocus
                                className="w-full text-xs font-bold bg-white/10 text-white rounded px-1 py-0.5 outline-none"
                            />
                            <button onClick={handleNameSubmit} className="text-green-400">
                                <Check className="w-3 h-3" />
                            </button>
                        </div>
                    ) : (
                        <div
                            onDoubleClick={() => setIsEditingName(true)}
                            className="text-xs font-bold text-white truncate max-w-[130px] cursor-text"
                            title="Double click to rename"
                        >
                            {track.name}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* EQ Popover */}
                    <div className="relative" ref={eqPopoverRef}>
                        <button
                            title="3-Band EQ Filter"
                            onClick={(e) => { e.stopPropagation(); setShowEQ(prev => !prev); }}
                            className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                                showEQ || track.eqLow !== 0 || track.eqMid !== 0 || track.eqHigh !== 0
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Sliders className="w-3 h-3" />
                        </button>

                        {showEQ && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-2 p-3.5 bg-zinc-950/98 border border-yellow-500/30 rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.95)] z-50 w-56 backdrop-blur-2xl space-y-2.5 text-xs animate-in zoom-in-95 duration-150"
                            >
                                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                                    <span className="font-black text-white text-[11px] uppercase tracking-wider">3-Band EQ</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateTrack(track.id, { eqLow: 0, eqMid: 0, eqHigh: 0 })}
                                            className="text-[10px] font-bold text-yellow-400 hover:underline cursor-pointer"
                                        >
                                            Reset
                                        </button>
                                        <button
                                            onClick={() => setShowEQ(false)}
                                            className="p-0.5 rounded text-zinc-400 hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-400 font-semibold">High (10kHz)</span>
                                        <span className="text-white font-mono font-bold">{track.eqHigh > 0 ? `+${track.eqHigh}` : track.eqHigh} dB</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={track.eqHigh}
                                        onChange={(e) => updateTrack(track.id, { eqHigh: parseFloat(e.target.value) })}
                                        className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-400 font-semibold">Mid (1kHz)</span>
                                        <span className="text-white font-mono font-bold">{track.eqMid > 0 ? `+${track.eqMid}` : track.eqMid} dB</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={track.eqMid}
                                        onChange={(e) => updateTrack(track.id, { eqMid: parseFloat(e.target.value) })}
                                        className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-400 font-semibold">Low (80Hz)</span>
                                        <span className="text-white font-mono font-bold">{track.eqLow > 0 ? `+${track.eqLow}` : track.eqLow} dB</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="0.5"
                                        value={track.eqLow}
                                        onChange={(e) => updateTrack(track.id, { eqLow: parseFloat(e.target.value) })}
                                        className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        title="Delete Track"
                        onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                        className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Middle Row: Mute & Solo Buttons + Pan Slider */}
            <div className="flex items-center justify-between gap-2 pl-1.5">
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id); }}
                        className={`w-6 h-5 rounded text-[10px] font-black transition-all ${
                            track.isMuted
                                ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                : 'bg-white/10 text-zinc-400 hover:text-white'
                        }`}
                    >
                        M
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); toggleTrackSolo(track.id); }}
                        className={`w-6 h-5 rounded text-[10px] font-black transition-all ${
                            track.isSolo
                                ? 'bg-yellow-400 text-black shadow-[0_0_8px_rgba(250,204,21,0.6)]'
                                : 'bg-white/10 text-zinc-400 hover:text-white'
                        }`}
                    >
                        S
                    </button>
                </div>

                {/* Pan Slider */}
                <div className="flex items-center gap-1.5 flex-1 max-w-[110px]">
                    <span className="text-[9px] font-mono text-zinc-400 w-5 text-right font-semibold">
                        {formatPan(track.pan)}
                    </span>
                    <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={track.pan}
                        onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
                        className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                    />
                </div>
            </div>

            {/* Bottom Row: Volume Slider with dB readout */}
            <div className="flex items-center gap-2 pl-1.5">
                <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.02"
                    value={track.volume}
                    onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                    className="w-full h-1 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                />
                <span className="text-[9px] font-mono text-zinc-400 w-12 text-right font-semibold">
                    {formatVolumeDB(track.volume)}
                </span>
            </div>
        </div>
    );
};
