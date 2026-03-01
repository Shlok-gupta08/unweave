import React, { useState } from 'react';
import { X, FileAudio, CheckSquare, Square, Loader2 } from 'lucide-react';

interface MergeDialogProps {
    availableTracks: string[];
    onClose: () => void;
    onMerge: (selectedTracks: string[]) => void;
    isMerging: boolean;
}

export const MergeDialog: React.FC<MergeDialogProps> = ({ availableTracks, onClose, onMerge, isMerging }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

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
            onMerge(Array.from(selected));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative max-h-[85vh] sm:max-h-none flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/5 bg-white/[0.02] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/10 rounded-xl">
                            <FileAudio className="w-5 h-5 text-yellow-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Merge & Export Layers</h3>
                    </div>
                    {!isMerging && (
                        <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-white/10 active:scale-95 text-zinc-400 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                    <p className="text-xs sm:text-sm text-zinc-400 mb-4 font-medium">
                        Select the layers you want to combine. They will be merged and exported as a single MP3 file.
                    </p>

                    <div className="flex flex-col gap-2 max-h-48 sm:max-h-60 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                        {availableTracks.map(track => {
                            const isSelected = selected.has(track);
                            return (
                                <button
                                    key={track}
                                    onClick={() => toggleTrack(track)}
                                    disabled={isMerging}
                                    className={`flex items-center gap-3 w-full p-3 sm:p-4 rounded-xl border transition-all text-left active:scale-[0.98] ${isSelected
                                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                            : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10 hover:border-white/10'
                                        } ${isMerging ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 opacity-50" />}
                                    <span className="font-semibold">{track}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-6 sm:pt-2 flex items-center justify-end gap-3 bg-white/[0.02] border-t border-white/5 shrink-0 pb-safe">
                    <button
                        onClick={onClose}
                        disabled={isMerging}
                        className="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-sm text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selected.size === 0 || isMerging}
                        className="flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                    >
                        {isMerging ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            'Merge & Export MP3'
                        )}
                    </button>
                </div>

                {/* Progress Overlay */}
                {isMerging && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                        <div className="h-full bg-yellow-500 w-1/2 rounded-r-full shadow-[0_0_10px_rgba(250,204,21,0.5)] animate-[slide_1.5s_ease-in-out_infinite]" />
                    </div>
                )}
            </div>
        </div>
    );
};
