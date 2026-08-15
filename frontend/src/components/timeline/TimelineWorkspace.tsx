import React, { useRef, useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Download, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';
import { useSongLibrary } from '../../context/SongLibraryContext';
import { MediaPool } from './MediaPool';
import { TimelineTransport } from './TimelineTransport';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import { TimelineTrackLane } from './TimelineTrackLane';
import { MergeDialog } from '../MergeDialog';

interface TimelineWorkspaceProps {
    onNavigateToExport?: () => void;
}

export const TimelineWorkspace: React.FC<TimelineWorkspaceProps> = ({ onNavigateToExport }) => {
    const {
        project,
        playheadTime,
        isPlaying,
        selectedTrackId,
        selectTrack,
        addTrack,
        resetAllTracksToDefaults,
        mergeTracks,
    } = useTimeline();

    const { songs, activeSongId, activeSong, addCustomStemToSong } = useSongLibrary();

    const [isMediaPoolOpen, setIsMediaPoolOpen] = useState(true);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isMerging, setIsMerging] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    const isUserScrolledAwayRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const prevPlayheadTimeRef = useRef(playheadTime);

    useEffect(() => {
        const updateWidth = () => {
            if (scrollContainerRef.current) {
                setContainerWidth(scrollContainerRef.current.clientWidth);
            }
        };
        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    // Auto-follow playhead if it is in frame and user hasn't scrolled away
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const currentX = playheadTime * project.zoom;
        const scrollLeft = container.scrollLeft;
        const clientWidth = container.clientWidth;

        // If user manually seeked / jumped playhead time, bring it back into view and re-enable follow
        const isManualSeek = Math.abs(playheadTime - prevPlayheadTimeRef.current) > 1.0;
        prevPlayheadTimeRef.current = playheadTime;

        if (isManualSeek) {
            isUserScrolledAwayRef.current = false;
        }

        // Check if playhead is currently inside or entered the visible frame
        const isPlayheadInView = currentX >= scrollLeft && currentX <= scrollLeft + clientWidth;
        if (isPlayheadInView) {
            isUserScrolledAwayRef.current = false;
        }

        // If playing and follow is active, smoothly advance viewport when playhead nears right edge
        if (isPlaying && !isUserScrolledAwayRef.current) {
            const rightThreshold = scrollLeft + clientWidth * 0.82;
            const leftThreshold = scrollLeft;

            if (currentX > rightThreshold) {
                isProgrammaticScrollRef.current = true;
                container.scrollLeft = currentX - clientWidth * 0.25;
                setTimeout(() => { isProgrammaticScrollRef.current = false; }, 60);
            } else if (currentX < leftThreshold) {
                isProgrammaticScrollRef.current = true;
                container.scrollLeft = Math.max(0, currentX - 50);
                setTimeout(() => { isProgrammaticScrollRef.current = false; }, 60);
            }
        }
    }, [playheadTime, isPlaying, project.zoom]);

    const handleContainerScroll = () => {
        if (isProgrammaticScrollRef.current || !scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const currentX = playheadTime * project.zoom;
        const scrollLeft = container.scrollLeft;
        const clientWidth = container.clientWidth;

        const isPlayheadInView = currentX >= scrollLeft && currentX <= scrollLeft + clientWidth;
        if (!isPlayheadInView) {
            // User intentionally scrolled away to inspect another section
            isUserScrolledAwayRef.current = true;
        } else {
            // User scrolled back into playhead view
            isUserScrolledAwayRef.current = false;
        }
    };

    const zoom = project.zoom;
    const playheadX = playheadTime * zoom;
    const timelineTotalWidth = Math.max(containerWidth + 300, project.duration * zoom);

    const handleMergeTimelineTracks = async (selectedTrackNames: string[], customName?: string, targetSongId?: string) => {
        setIsMerging(true);
        try {
            const trackIdsToMerge = project.tracks
                .filter(t => selectedTrackNames.includes(t.name))
                .map(t => t.id);

            const result = await mergeTracks(trackIdsToMerge, customName);
            selectTrack(result.trackId);

            // Register the merged layer into the selected target song bucket
            const destSongId = targetSongId || activeSongId || activeSong?.id || (songs.length > 0 ? songs[0].id : undefined);
            if (destSongId && result.audioUrl) {
                addCustomStemToSong(destSongId, result.trackName, result.audioUrl);
            }

            setIsMergeModalOpen(false);
        } catch (err) {
            console.error('Merge tracks failed', err);
            alert(`Failed to merge tracks: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsMerging(false);
        }
    };

    return (
        <div className="w-full h-[calc(100vh-8.5rem)] flex flex-col bg-zinc-950 text-slate-50 overflow-hidden select-none">
            {/* Top Transport & Master Bar */}
            <TimelineTransport onOpenMergeModal={() => setIsMergeModalOpen(true)} />

            {/* Main DAW Editor Layout: Left Media Pool + Right Multi-Track View */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Collapsible Media Pool */}
                <div
                    className={`transition-all duration-300 border-r border-white/10 flex flex-col z-30 shrink-0 ${
                        isMediaPoolOpen ? 'w-64 sm:w-72' : 'w-0'
                    } overflow-hidden`}
                >
                    <MediaPool />
                </div>

                {/* Media Pool Collapse Toggle Button */}
                <button
                    title={isMediaPoolOpen ? 'Collapse Media Pool' : 'Expand Media Pool'}
                    onClick={() => setIsMediaPoolOpen(prev => !prev)}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-40 p-1.5 bg-zinc-900 border border-white/15 rounded-r-xl text-zinc-400 hover:text-white transition-all shadow-2xl cursor-pointer"
                    style={{ left: isMediaPoolOpen ? (typeof window !== 'undefined' && window.innerWidth >= 640 ? '288px' : '256px') : '0px' }}
                >
                    {isMediaPoolOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Center / Main DAW Multi-Track Editor */}
                <div className="flex-1 flex overflow-hidden bg-black/60 relative">
                    {/* Fixed Left Track Headers Sidebar (Pins cleanly on scroll, high z-index) */}
                    <div className="w-64 bg-zinc-950 border-r border-white/10 flex flex-col shrink-0 z-30 shadow-2xl overflow-hidden">
                        {/* Top Corner Header */}
                        <div className="h-8 bg-zinc-950 border-b border-white/10 px-3 flex items-center justify-between shrink-0">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                                Tracks ({project.tracks.length})
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    title="Reset All Tracks to Defaults"
                                    onClick={resetAllTracksToDefaults}
                                    className="p-1 rounded text-zinc-500 hover:text-yellow-400 hover:bg-white/5 transition-colors text-[10px] font-bold"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                                {project.tracks.length >= 2 && (
                                    <button
                                        title="Merge Selected Tracks into 1"
                                        onClick={() => setIsMergeModalOpen(true)}
                                        className="p-1 rounded text-zinc-400 hover:text-yellow-400 hover:bg-white/5 transition-colors text-[10px] font-bold"
                                    >
                                        <SlidersHorizontal className="w-3 h-3" />
                                    </button>
                                )}
                                {onNavigateToExport && (
                                    <button
                                        title="Export & Mixdown"
                                        onClick={onNavigateToExport}
                                        className="p-1 rounded text-zinc-400 hover:text-yellow-400 hover:bg-white/5 transition-colors text-[10px] font-bold"
                                    >
                                        <Download className="w-3 h-3" />
                                    </button>
                                )}
                                <button
                                    title="Add New Audio Track"
                                    onClick={() => addTrack()}
                                    className="p-1 rounded text-zinc-500 hover:text-yellow-400 hover:bg-white/5 transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Track Control Strip Headers */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between">
                            <div>
                                {project.tracks.map((track) => (
                                    <TimelineTrackHeader
                                        key={track.id}
                                        track={track}
                                        isSelected={selectedTrackId === track.id}
                                        onSelect={() => selectTrack(track.id)}
                                    />
                                ))}
                            </div>

                            {/* Bottom Pill-shaped Action Buttons */}
                            <div className="p-3 border-t border-white/5 bg-zinc-950/90 flex flex-col gap-2 shrink-0">
                                {project.tracks.length >= 2 && (
                                    <button
                                        title="Merge Selected Tracks into a New Layer"
                                        onClick={() => setIsMergeModalOpen(true)}
                                        className="w-full py-2 px-3 rounded-full border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 active:scale-[0.98] transition-all text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(250,204,21,0.15)] cursor-pointer"
                                    >
                                        <SlidersHorizontal className="w-3.5 h-3.5" />
                                        <span>Merge Layers</span>
                                    </button>
                                )}

                                <button
                                    title="Add New Audio Track"
                                    onClick={() => addTrack()}
                                    className="w-full py-1.5 px-3 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Track</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Unified Right Horizontally Scrollable Container for Ruler + Track Lanes */}
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleContainerScroll}
                        className="flex-1 flex flex-col overflow-x-auto overflow-y-auto relative custom-scrollbar bg-black/50"
                    >
                        {/* Top Timeline Ruler (Scrolls horizontally with lanes) */}
                        <div className="sticky top-0 z-20 shrink-0">
                            <TimelineRuler
                                width={timelineTotalWidth}
                            />
                        </div>

                        {/* Track Lanes Area */}
                        <div
                            className="relative flex-1"
                            style={{ width: `${timelineTotalWidth}px`, minHeight: `${project.tracks.length * 96 + 48}px` }}
                        >
                            {/* Persistent Full-Height Vertical Playhead Needle Line */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 pointer-events-none z-20 shadow-[0_0_10px_rgba(250,204,21,0.9)] transition-transform duration-75 ease-out"
                                style={{
                                    transform: `translateX(${playheadX}px)`,
                                }}
                            />

                            {/* Render Track Lanes */}
                            {project.tracks.map((track) => (
                                <TimelineTrackLane
                                    key={track.id}
                                    track={track}
                                    width={timelineTotalWidth}
                                    isSelected={selectedTrackId === track.id}
                                    onSelect={() => selectTrack(track.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Merge Timeline Tracks Modal */}
            {isMergeModalOpen && project.tracks.length >= 2 && (
                <MergeDialog
                    availableTracks={project.tracks.map(t => t.name)}
                    onClose={() => setIsMergeModalOpen(false)}
                    onMerge={handleMergeTimelineTracks}
                    isMerging={isMerging}
                    title="Merge Timeline Tracks"
                    availableSongBuckets={songs.map(s => ({ id: s.id, name: s.name }))}
                    defaultTargetSongId={activeSongId || (songs[0]?.id)}
                />
            )}
        </div>
    );
};
