import React from 'react';
import { History, Disc, Music, ArrowRight, Trash2 } from 'lucide-react';
import type { AutoSaveMeta, AutoSaveInfo } from '../../types';

interface ProjectRecoveryModalProps {
    info?: AutoSaveInfo;
    meta?: AutoSaveMeta;
    onRestore: () => void;
    onDiscard: () => void;
}

export const ProjectRecoveryModal: React.FC<ProjectRecoveryModalProps> = ({
    info,
    meta,
    onRestore,
    onDiscard,
}) => {
    const activeMeta = info?.meta || meta || {
        songName: 'Recent Project',
        songCount: 1,
        stemCount: 0,
        trackCount: 0,
        lastSaved: Date.now(),
    };

    const formatTimeAgo = (timestamp: number): string => {
        if (!timestamp) return 'Earlier session';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div
                className="bg-zinc-950/95 border border-yellow-500/30 rounded-3xl w-full max-w-lg shadow-[0_25px_60px_rgba(0,0,0,0.95)] p-6 sm:p-7 relative space-y-6 animate-in zoom-in-95 duration-200 overflow-hidden"
                style={{ backdropFilter: 'blur(24px)' }}
            >
                {/* Background Ambient Glow */}
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Header */}
                <div className="flex items-start gap-4">
                    <div className="p-3.5 bg-yellow-500/15 border border-yellow-500/30 rounded-2xl text-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.2)] shrink-0">
                        <History className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px] font-black uppercase tracking-wider">
                                Auto-Save Recovered
                            </span>
                            <span className="text-zinc-500 text-xs font-mono">
                                {formatTimeAgo(activeMeta.lastSaved)}
                            </span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                            Restore Previous Studio Project?
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            An active editing session was preserved. All audio stems, waveform peaks, and timeline arrangements are intact.
                        </p>
                    </div>
                </div>

                {/* Project Summary Card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-black/50 border border-white/10 text-yellow-400 shrink-0">
                            <Music className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Project Name</span>
                            <h4 className="text-sm font-bold text-zinc-100 truncate">
                                {activeMeta.songName || 'Untitled Project'}
                            </h4>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                        <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2">
                            <Disc className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <div>
                                <span className="text-[9px] text-zinc-500 font-bold uppercase block">Stems</span>
                                <span className="text-xs font-mono font-bold text-zinc-200">{activeMeta.stemCount || 0} Layers</span>
                            </div>
                        </div>

                        <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2">
                            <History className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <div>
                                <span className="text-[9px] text-zinc-500 font-bold uppercase block">DAW Tracks</span>
                                <span className="text-xs font-mono font-bold text-zinc-200">{activeMeta.trackCount || 0} Channels</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                    <button
                        onClick={onDiscard}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-white/10 hover:border-red-500/30 bg-white/[0.03] hover:bg-red-500/10 text-zinc-400 hover:text-red-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer order-2 sm:order-1"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Start New Project</span>
                    </button>

                    <button
                        onClick={onRestore}
                        className="w-full sm:flex-1 py-2.5 px-5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(250,204,21,0.4)] cursor-pointer active:scale-[0.99] order-1 sm:order-2"
                    >
                        <span>Continue Previous Session</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
