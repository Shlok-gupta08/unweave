import React, { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, GripVertical, Disc, Loader2, FolderInput, Copy, Trash2, X, ArrowRight } from 'lucide-react';
import { useSongLibrary } from '../../context/SongLibraryContext';
import { useTimeline } from '../../context/TimelineContext';

const STEM_COLORS: Record<string, string> = {
    Vocals: '#ef4444',
    Drums: '#f59e0b',
    Bass: '#3b82f6',
    Guitar: '#10b981',
    Piano: '#8b5cf6',
    Other: '#64748b',
};

interface ActiveMoveStemState {
    songId: string;
    songTitle: string;
    stemName: string;
    audioUrl: string;
}

export const MediaPool: React.FC = () => {
    const { songs, moveCustomStemBetweenSongs, copyCustomStemToSong, removeStemFromSong } = useSongLibrary();
    const { addTrack, addClip, project, loadSongStemsToTimeline } = useTimeline();
    const [expandedSongs, setExpandedSongs] = useState<Record<string, boolean>>({});
    const [importingSongId, setImportingSongId] = useState<string | null>(null);
    const [activeMoveStem, setActiveMoveStem] = useState<ActiveMoveStemState | null>(null);
    const [selectedTargetSongId, setSelectedTargetSongId] = useState<string>('');

    const toggleExpand = (songId: string) => {
        setExpandedSongs(prev => ({ ...prev, [songId]: !prev[songId] }));
    };

    const completedSongs = songs.filter(s => s.status === 'complete' && s.stems);

    const handleOpenMoveModal = (songId: string, songTitle: string, stemName: string, audioUrl: string) => {
        const otherSongs = songs.filter(s => s.id !== songId);
        setSelectedTargetSongId(otherSongs[0]?.id || '');
        setActiveMoveStem({ songId, songTitle, stemName, audioUrl });
    };

    const handleAddStemToNewTrack = async (songId: string, songTitle: string, stemName: string, url: string) => {
        const color = STEM_COLORS[stemName] || '#64748b';
        const trackId = addTrack(`${songTitle} - ${stemName}`, color);

        await addClip({
            trackId,
            stemName,
            songId,
            songTitle,
            audioUrl: url,
            startTime: project.playheadTime,
            offset: 0,
            duration: 60,
            originalDuration: 60,
            gain: 1.0,
            color,
        });
    };

    const handleDragStart = (e: React.DragEvent, songId: string, songTitle: string, stemName: string, url: string) => {
        const color = STEM_COLORS[stemName] || '#64748b';
        const dragData = JSON.stringify({
            stemName,
            songId,
            songTitle,
            audioUrl: url,
            color,
        });
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <div className="w-full flex flex-col h-full bg-zinc-950/70 border border-white/10 rounded-2xl backdrop-blur-xl p-3 overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Disc className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">Media Pool</h3>
                </div>
                <span className="text-[10px] font-semibold text-zinc-500">{completedSongs.length} Ready</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {completedSongs.length === 0 ? (
                    <div className="text-center py-8 px-2 text-zinc-500">
                        <p className="text-xs font-medium">No stems in pool.</p>
                        <p className="text-[11px] text-zinc-600 mt-1">Separate audio tracks in the 'Separate' tab first.</p>
                    </div>
                ) : (
                    completedSongs.map((song) => {
                        const isExpanded = expandedSongs[song.id] ?? true;
                        const stems = song.stems || {};
                        const stemEntries = Object.entries(stems).filter(([, url]) => !!url);
                        const otherSongs = songs.filter(s => s.id !== song.id);

                        return (
                            <div key={song.id} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                                <div
                                    onClick={() => toggleExpand(song.id)}
                                    className="flex items-center justify-between p-2 hover:bg-white/[0.04] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                                        <span className="text-xs font-bold text-zinc-200 truncate">{song.name}</span>
                                    </div>

                                    <button
                                        title="Import all stems to timeline"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (importingSongId === song.id) return;
                                            setImportingSongId(song.id);
                                            try {
                                                await loadSongStemsToTimeline(song);
                                            } finally {
                                                setImportingSongId(null);
                                            }
                                        }}
                                        disabled={importingSongId === song.id}
                                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-black transition-colors shrink-0 disabled:opacity-75 flex items-center gap-1 cursor-pointer"
                                    >
                                        {importingSongId === song.id ? (
                                            <>
                                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                <span>Importing...</span>
                                            </>
                                        ) : (
                                            <span>Import All</span>
                                        )}
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="p-1.5 pt-0 space-y-1">
                                        {stemEntries.map(([stemName, url]) => {
                                            const color = STEM_COLORS[stemName] || '#64748b';
                                            const DEFAULT_STEMS = new Set(['Vocals', 'Drums', 'Bass', 'Guitar', 'Piano', 'Other', 'vocals', 'drums', 'bass', 'guitar', 'piano', 'other']);
                                            const isCustomOrMerged = !DEFAULT_STEMS.has(stemName);

                                            return (
                                                <div
                                                    key={stemName}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, song.id, song.name, stemName, url!)}
                                                    className="flex items-center justify-between p-1.5 rounded-lg bg-black/40 hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all cursor-grab active:cursor-grabbing text-xs group"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                                                        <GripVertical className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                                                        <span
                                                            className="w-2 h-2 rounded-full shrink-0"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <span className="font-semibold text-zinc-300 truncate" title={stemName}>{stemName}</span>
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                                        {/* Move to another bucket option - ONLY for custom / merged layers */}
                                                        {isCustomOrMerged && otherSongs.length > 0 && (
                                                            <button
                                                                title="Move or Copy layer to another song bucket"
                                                                onClick={() => handleOpenMoveModal(song.id, song.name, stemName, url!)}
                                                                className="p-1 rounded text-zinc-500 hover:text-yellow-400 hover:bg-white/10 transition-colors cursor-pointer"
                                                            >
                                                                <FolderInput className="w-3 h-3" />
                                                            </button>
                                                        )}

                                                        {/* Delete custom/merged stem option - ONLY for custom / merged layers */}
                                                        {isCustomOrMerged && (
                                                            <button
                                                                title="Delete Custom / Merged Layer"
                                                                onClick={() => removeStemFromSong(song.id, stemName)}
                                                                className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        )}

                                                        {/* Add to Timeline Track */}
                                                        <button
                                                            title="Add to new track"
                                                            onClick={() => handleAddStemToNewTrack(song.id, song.name, stemName, url!)}
                                                            className="p-1 rounded text-zinc-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Move / Copy Layer Modal Dialog */}
            {activeMoveStem && (
                <div
                    onClick={() => setActiveMoveStem(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-zinc-900 border border-white/15 rounded-3xl w-full max-w-sm shadow-2xl p-5 relative space-y-4 animate-in zoom-in-95 duration-200"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400">
                                    <FolderInput className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white">Move / Copy Layer</h4>
                                    <p className="text-[11px] text-zinc-400 font-medium truncate max-w-[200px]">{activeMoveStem.stemName}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveMoveStem(null)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Current Bucket vs Destination Bucket */}
                        <div className="space-y-3">
                            <div>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Source Bucket</span>
                                <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-zinc-300 font-semibold truncate">
                                    {activeMoveStem.songTitle}
                                </div>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">Destination Song Bucket</span>
                                <select
                                    value={selectedTargetSongId}
                                    onChange={(e) => setSelectedTargetSongId(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-xs font-semibold text-white focus:outline-none focus:border-yellow-500/50 cursor-pointer"
                                >
                                    {songs.filter(s => s.id !== activeMoveStem.songId).map(s => (
                                        <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                            <button
                                onClick={() => {
                                    if (selectedTargetSongId) {
                                        copyCustomStemToSong(selectedTargetSongId, activeMoveStem.stemName, activeMoveStem.audioUrl);
                                        setActiveMoveStem(null);
                                    }
                                }}
                                disabled={!selectedTargetSongId}
                                className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy to Bucket</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedTargetSongId) {
                                        moveCustomStemBetweenSongs(activeMoveStem.songId, selectedTargetSongId, activeMoveStem.stemName);
                                        setActiveMoveStem(null);
                                    }
                                }}
                                disabled={!selectedTargetSongId}
                                className="w-full py-2 px-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(250,204,21,0.3)] cursor-pointer disabled:opacity-50"
                            >
                                <ArrowRight className="w-3.5 h-3.5" />
                                <span>Move to Bucket</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
