import React, { useState } from 'react';
import { X, CheckSquare, Square, Loader2, Sparkles } from 'lucide-react';

interface MergeDialogProps {
    availableTracks: string[];
    onClose: () => void;
    onMerge: (selectedTracks: string[], customName?: string, targetSongId?: string) => void;
    isMerging: boolean;
    title?: string;
    availableSongBuckets?: Array<{ id: string; name: string }>;
    defaultTargetSongId?: string;
}

export const MergeDialog: React.FC<MergeDialogProps> = ({
    availableTracks,
    onClose,
    onMerge,
    isMerging,
    title = 'Merge & Combine Layers',
    availableSongBuckets = [],
    defaultTargetSongId,
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set(availableTracks.slice(0, 2)));
    const [customName, setCustomName] = useState('');
    const [targetSongId, setTargetSongId] = useState<string>(defaultTargetSongId || availableSongBuckets[0]?.id || '');

    const toggleTrack = (track: string) => {
        const next = new Set(selected);
        if (next.has(track)) {
            next.delete(track);
        } else {
            next.add(track);
        }
        setSelected(next);
    };

    const handleConfirm = () => {
        if (selected.size > 0 && !isMerging) {
            const name = customName.trim() || `Merged (${Array.from(selected).join(', ')})`;
            onMerge(Array.from(selected), name, targetSongId || undefined);
        }
    };

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        >
            <div
                className="bg-zinc-900/95 border border-white/15 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-400">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">{title}</h3>
                            <p className="text-xs text-zinc-400">Combine multiple stem layers into 1 new track</p>
                        </div>
                    </div>
                    {!isMerging && (
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Optional Name Input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Merged Layer Name (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. Backing Track (Drums + Bass)"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            disabled={isMerging}
                            className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>

                    {/* Destination Song Bucket */}
                    {availableSongBuckets.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Save to Song Bucket</label>
                            <select
                                value={targetSongId}
                                onChange={(e) => setTargetSongId(e.target.value)}
                                disabled={isMerging}
                                className="w-full px-3.5 py-2 bg-zinc-950 border border-white/10 rounded-xl text-xs sm:text-sm font-medium text-white focus:outline-none focus:border-yellow-500/50 cursor-pointer"
                            >
                                {availableSongBuckets.map(bucket => (
                                    <option key={bucket.id} value={bucket.id} className="bg-zinc-900 text-white">
                                        {bucket.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Select Layers to Merge</label>
                        <div className="space-y-2">
                            {availableTracks.map(track => {
                                const isSelected = selected.has(track);
                                return (
                                    <button
                                        key={track}
                                        onClick={() => toggleTrack(track)}
                                        disabled={isMerging}
                                        className={`flex items-center justify-between w-full p-3 rounded-xl border transition-all text-left ${
                                            isSelected
                                                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 font-bold'
                                                : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10'
                                        } ${isMerging ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-40" />}
                                            <span className="text-xs sm:text-sm">{track}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 flex items-center justify-end gap-3 bg-white/[0.02] border-t border-white/10">
                    <button
                        onClick={onClose}
                        disabled={isMerging}
                        className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selected.size === 0 || isMerging}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl font-black text-xs sm:text-sm bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(250,204,21,0.3)] cursor-pointer"
                    >
                        {isMerging ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Merging Audio...</span>
                            </>
                        ) : (
                            <span>Merge ({selected.size} Layers)</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
