import React, { useState } from 'react';
import { Play, Trash2, CheckCircle2, AlertCircle, X, Search, Sparkles, Layers, Loader2, RotateCcw } from 'lucide-react';
import { useSongLibrary } from '../../context/SongLibraryContext';
import { useTimeline } from '../../context/TimelineContext';
import type { SongItem } from '../../types';

interface SongBucketListProps {
    onSelectSong: (songId: string) => void;
    onOpenInTimeline?: () => void;
}

export const SongBucketList: React.FC<SongBucketListProps> = ({ onSelectSong, onOpenInTimeline }) => {
    const { songs, activeSongId, reprocessSong, cancelProcessing, removeSong, processAllQueued, isBatchProcessing } = useSongLibrary();
    const { loadSongStemsToTimeline } = useTimeline();
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingSongId, setLoadingSongId] = useState<string | null>(null);

    const filteredSongs = songs.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const queuedCount = songs.filter(s => s.status === 'idle' || s.status === 'queued' || s.status === 'error' || s.status === 'cancelled').length;

    const handleReprocessClick = (e: React.MouseEvent, song: SongItem) => {
        e.stopPropagation();
        reprocessSong(song.id);
    };

    const handleSendToTimeline = async (e: React.MouseEvent, song: SongItem) => {
        e.stopPropagation();
        if (song.status !== 'complete' || !song.stems || loadingSongId) return;
        setLoadingSongId(song.id);
        try {
            await loadSongStemsToTimeline(song);
            onOpenInTimeline?.();
        } finally {
            setLoadingSongId(null);
        }
    };

    const formatFileSize = (bytes: number): string => {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatETA = (seconds: number | null): string => {
        if (seconds === null || seconds === undefined) return '';
        if (seconds <= 0) return 'Almost done';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins > 0) return `~${mins}m ${secs}s`;
        return `~${secs}s`;
    };

    return (
        <div className="w-full flex flex-col h-full bg-zinc-950/60 border border-white/10 rounded-2xl sm:rounded-3xl backdrop-blur-xl p-3 sm:p-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">Song Bucket</h3>
                        <p className="text-[11px] text-zinc-400 font-medium">{songs.length} song{songs.length === 1 ? '' : 's'} in library</p>
                    </div>
                </div>

                {queuedCount > 0 && (
                    <button
                        onClick={() => processAllQueued()}
                        disabled={isBatchProcessing}
                        className="px-3 py-1.5 rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 text-xs font-bold transition-all shadow-[0_0_12px_rgba(250,204,21,0.25)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <Play className="w-3 h-3 fill-black" />
                        <span>Separate All ({queuedCount})</span>
                    </button>
                )}
            </div>

            {/* Search Bar */}
            {songs.length > 3 && (
                <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Filter songs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
                    />
                </div>
            )}

            {/* Songs List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[480px]">
                {filteredSongs.length === 0 ? (
                    <div className="text-center py-8 px-4 text-zinc-500">
                        <p className="text-xs font-medium">No songs in bucket yet.</p>
                        <p className="text-[11px] text-zinc-600 mt-1">Upload audio files above to add them to your queue.</p>
                    </div>
                ) : (
                    filteredSongs.map((song) => {
                        const isSelected = activeSongId === song.id;
                        const isProcessing = song.status === 'uploading' || song.status === 'processing';
                        const isQueued = song.status === 'queued';
                        const isInFlight = isProcessing || isQueued;
                        const isComplete = song.status === 'complete';
                        const isError = song.status === 'error';

                        return (
                            <div
                                key={song.id}
                                onClick={() => onSelectSong(song.id)}
                                className={`group relative p-3 rounded-xl sm:rounded-2xl border transition-all duration-200 cursor-pointer ${
                                    isSelected
                                        ? 'bg-yellow-500/[0.07] border-yellow-500/40 shadow-[0_0_15px_rgba(250,204,21,0.1)]'
                                        : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                                            {isProcessing && <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />}
                                            {isQueued && <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                                            {isError && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                            <h4 className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">
                                                {song.name}
                                            </h4>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-zinc-400">
                                            <span>{formatFileSize(song.fileSize)}</span>
                                            <span>•</span>
                                            {isProcessing ? (
                                                <span className="text-yellow-400 font-semibold">
                                                    {song.progress}% {formatETA(song.etaSeconds)}
                                                </span>
                                            ) : isComplete ? (
                                                <span className="text-green-400 font-medium">Stems Ready</span>
                                            ) : song.status === 'queued' ? (
                                                <span className="text-amber-400 font-medium animate-pulse">
                                                    {song.statusMessage || 'In Queue...'}
                                                </span>
                                            ) : isError ? (
                                                <span className="text-red-400">Error</span>
                                            ) : (
                                                <span className="text-zinc-500">Ready</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                         {isComplete && (
                                             <button
                                                 title="Open in Timeline Editor"
                                                 onClick={(e) => handleSendToTimeline(e, song)}
                                                 disabled={loadingSongId === song.id}
                                                 className="px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-black transition-colors disabled:opacity-75 disabled:cursor-wait text-[11px] font-semibold flex items-center gap-1"
                                             >
                                                 {loadingSongId === song.id ? (
                                                     <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                 ) : (
                                                     <Layers className="w-3.5 h-3.5" />
                                                 )}
                                                 <span>Open</span>
                                             </button>
                                         )}

                                         {isInFlight ? (
                                             <button
                                                 title={isQueued ? "Cancel / Remove from Queue" : "Cancel Separation"}
                                                 onClick={(e) => { e.stopPropagation(); cancelProcessing(song.id); }}
                                                 className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                                             >
                                                 <X className="w-3.5 h-3.5" />
                                             </button>
                                         ) : !isComplete ? (
                                             <button
                                                 title="Separate Stems for this song"
                                                 onClick={(e) => handleReprocessClick(e, song)}
                                                 className="px-2.5 py-1 rounded-lg bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-bold text-[11px] transition-all shadow-[0_0_10px_rgba(250,204,21,0.25)] flex items-center gap-1 cursor-pointer"
                                             >
                                                 <Play className="w-3 h-3 fill-black" />
                                                 <span>Separate</span>
                                             </button>
                                         ) : (
                                             <button
                                                 title="Reprocess / Re-separate Stems"
                                                 onClick={(e) => handleReprocessClick(e, song)}
                                                 className="p-1.5 rounded-lg text-zinc-400 hover:text-yellow-400 hover:bg-white/10 transition-colors cursor-pointer"
                                             >
                                                 <RotateCcw className="w-3.5 h-3.5" />
                                             </button>
                                         )}

                                        <button
                                            title="Delete Song"
                                            onClick={(e) => { e.stopPropagation(); removeSong(song.id); }}
                                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                {isProcessing && (
                                    <div className="w-full h-1.5 bg-white/10 rounded-full mt-2.5 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                                            style={{ width: `${song.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

        </div>
    );
};
