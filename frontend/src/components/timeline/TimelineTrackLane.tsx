import React, { useState } from 'react';
import { useTimeline } from '../../context/TimelineContext';
import { TimelineClipView } from './TimelineClipView';
import type { TimelineTrack } from '../../types';

interface TimelineTrackLaneProps {
    track: TimelineTrack;
    width: number;
    isSelected: boolean;
    onSelect: (isMultiSelect?: boolean) => void;
}

export const TimelineTrackLane: React.FC<TimelineTrackLaneProps> = ({
    track,
    width,
    isSelected,
    onSelect,
}) => {
    const { project, selectedClipId, selectedClipIds, selectClip, addClip, seek } = useTimeline();
    const [isDragOver, setIsDragOver] = useState(false);

    const zoom = project.zoom;
    const trackClips = project.clips.filter(c => c.trackId === track.id);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target === e.currentTarget || target.dataset.role === 'lane-bg') {
            // Clicking empty space in lane deselects clips
            selectClip(null);
            const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
            onSelect(isMulti);
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const time = Math.max(0, clickX / zoom);
            seek(time);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        try {
            const data = JSON.parse(rawData);
            const rect = e.currentTarget.getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            const dropTime = Math.max(0, dropX / zoom);

            // Snapping if enabled
            const finalTime = project.isSnappingEnabled
                ? Math.round(dropTime / (project.snapInterval || 0.5)) * (project.snapInterval || 0.5)
                : dropTime;

            await addClip({
                trackId: track.id,
                stemName: data.stemName,
                songId: data.songId,
                songTitle: data.songTitle,
                audioUrl: data.audioUrl,
                startTime: finalTime,
                offset: 0,
                duration: 0,
                originalDuration: 0,
                gain: 1.0,
                color: data.color || track.color,
            });
        } catch (err) {
            console.error('Failed to handle stem drop', err);
        }
    };

    return (
        <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-role="lane-bg"
            className={`relative h-24 border-b border-white/5 transition-colors select-none cursor-pointer ${
                isDragOver ? 'bg-yellow-500/10' : isSelected ? 'bg-white/[0.02]' : 'bg-black/30 hover:bg-white/[0.01]'
            }`}
            style={{ width: `${Math.max(width, project.duration * zoom)}px` }}
        >
            {/* Center Grid Line */}
            <div data-role="lane-bg" className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.03] pointer-events-none" />

            {/* Render Clips */}
            {trackClips.map((clip) => (
                <TimelineClipView
                    key={clip.id}
                    clip={clip}
                    zoom={zoom}
                    isSelected={selectedClipIds.includes(clip.id) || selectedClipId === clip.id}
                    onSelect={(isMulti) => selectClip(clip.id, isMulti)}
                />
            ))}
        </div>
    );
};
