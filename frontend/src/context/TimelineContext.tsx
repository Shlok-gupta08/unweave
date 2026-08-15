import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { audioEngine } from '../services/audioEngine';
import { getOrComputePeaks, getOrFetchAudioBuffer } from '../utils/waveform';
import { mergeStemsToBuffer, audioBufferToWavBlob } from '../utils/audioUtils';
import { saveBlobToDB } from '../utils/db';
import type { TimelineProject, TimelineTrack, TimelineClip, SongItem } from '../types';

const STEM_COLORS: Record<string, string> = {
    Vocals: '#ef4444',
    Drums: '#f59e0b',
    Bass: '#3b82f6',
    Guitar: '#10b981',
    Piano: '#8b5cf6',
    Other: '#64748b',
};

const TIMELINE_STORAGE_KEY = 'unweave_timeline_project';
const SONG_PROJECTS_STORAGE_KEY = 'unweave_song_projects';

interface TimelineContextValue {
    project: TimelineProject;
    isPlaying: boolean;
    playheadTime: number;
    selectedClipId: string | null;
    selectedTrackId: string | null;
    vuMeterLevels: { left: number; right: number; peak: number };
    // Track actions
    addTrack: (name?: string, color?: string) => string;
    removeTrack: (trackId: string) => void;
    updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
    toggleTrackMute: (trackId: string) => void;
    toggleTrackSolo: (trackId: string) => void;
    resetTrackToDefaults: (trackId: string) => void;
    resetAllTracksToDefaults: () => void;
    // Master volume
    setMasterVolume: (vol: number) => void;
    // Clip actions
    addClip: (clip: Omit<TimelineClip, 'id'>) => Promise<string>;
    updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
    removeClip: (clipId: string) => void;
    moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;
    trimClip: (clipId: string, newOffset: number, newDuration: number, newStartTime?: number) => void;
    splitClipAtPlayhead: (clipId?: string) => void;
    duplicateClip: (clipId: string) => void;
    setClipGain: (clipId: string, gain: number) => void;
    selectClip: (clipId: string | null) => void;
    selectTrack: (trackId: string | null) => void;
    // Merge Tracks
    mergeTracks: (trackIds: string[], mergedName?: string) => Promise<{ trackId: string; trackName: string; audioUrl: string }>;
    // Song Import & Persistence
    loadSongStemsToTimeline: (song: SongItem) => Promise<void>;
    clearTimeline: () => void;
    // Transport & Playback
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seek: (time: number) => void;
    setZoom: (zoom: number | ((prev: number) => number)) => void;
    toggleSnapping: () => void;
    setSnapInterval: (interval: number) => void;
    toggleLoop: () => void;
    setLoopPoints: (start: number | null, end: number | null) => void;
    // History
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const defaultTracks: TimelineTrack[] = [
    { id: 'track_vocals', name: 'Vocals', color: '#ef4444', volume: 1.0, pan: 0.0, isMuted: false, isSolo: false, eqLow: 0, eqMid: 0, eqHigh: 0 },
    { id: 'track_drums', name: 'Drums', color: '#f59e0b', volume: 1.0, pan: 0.0, isMuted: false, isSolo: false, eqLow: 0, eqMid: 0, eqHigh: 0 },
    { id: 'track_bass', name: 'Bass', color: '#3b82f6', volume: 1.0, pan: 0.0, isMuted: false, isSolo: false, eqLow: 0, eqMid: 0, eqHigh: 0 },
    { id: 'track_other', name: 'Instruments / Other', color: '#8b5cf6', volume: 1.0, pan: 0.0, isMuted: false, isSolo: false, eqLow: 0, eqMid: 0, eqHigh: 0 },
];

const initialProject: TimelineProject = {
    tracks: defaultTracks,
    clips: [],
    playheadTime: 0,
    masterVolume: 1.0,
    currentSongId: null,
    zoom: 50, // 50 pixels per second
    duration: 180, // Default 3 minutes minimum clickable span
    loopStart: null,
    loopEnd: null,
    isLooping: false,
    isSnappingEnabled: true,
    snapInterval: 0.5,
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useTimeline() {
    const context = useContext(TimelineContext);
    if (!context) {
        throw new Error('useTimeline must be used within a TimelineProvider');
    }
    return context;
}

export function TimelineProvider({ children }: { children: ReactNode }) {
    // Dictionary of saved projects per song
    const [savedSongProjects, setSavedSongProjects] = useState<Record<string, TimelineProject>>(() => {
        try {
            const raw = localStorage.getItem(SONG_PROJECTS_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    const [project, setProject] = useState<TimelineProject>(() => {
        try {
            const raw = localStorage.getItem(TIMELINE_STORAGE_KEY);
            if (!raw) return initialProject;
            const parsed: TimelineProject = JSON.parse(raw);
            return {
                ...initialProject,
                ...parsed,
                playheadTime: 0,
                duration: Math.max(180, parsed.duration || 180),
                masterVolume: parsed.masterVolume ?? 1.0,
            };
        } catch {
            return initialProject;
        }
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadTime, setPlayheadTime] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [vuMeterLevels, setVuMeterLevels] = useState({ left: 0, right: 0, peak: 0 });

    // History stack for Undo / Redo
    const [history, setHistory] = useState<TimelineProject[]>([initialProject]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const isUndoingOrRedoing = useRef(false);

    // Real-time live VU meter polling during playback
    useEffect(() => {
        if (!isPlaying) {
            setVuMeterLevels({ left: 0, right: 0, peak: 0 });
            return;
        }

        let animId: number;
        const pollVU = () => {
            const levels = audioEngine.getVULevel();
            setVuMeterLevels(levels);
            animId = requestAnimationFrame(pollVU);
        };
        animId = requestAnimationFrame(pollVU);

        return () => {
            cancelAnimationFrame(animId);
        };
    }, [isPlaying]);

    // Save savedSongProjects to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(SONG_PROJECTS_STORAGE_KEY, JSON.stringify(savedSongProjects));
        } catch (e) {
            console.error('Failed to save song projects dictionary', e);
        }
    }, [savedSongProjects]);

    // Save active project to localStorage and update in savedSongProjects if attached to a song
    useEffect(() => {
        try {
            const serializableProject = {
                ...project,
                clips: project.clips.map(c => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { peaks, audioBlob, ...rest } = c;
                    return rest;
                }),
            };
            localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(serializableProject));

            if (project.currentSongId) {
                setSavedSongProjects(prev => ({
                    ...prev,
                    [project.currentSongId!]: serializableProject,
                }));
            }
        } catch (e) {
            console.error('Failed to save timeline project', e);
        }
    }, [project]);

    // Apply master volume to audio engine
    useEffect(() => {
        audioEngine.setMasterVolume(project.masterVolume ?? 1.0);
    }, [project.masterVolume]);

    // Dynamic duration calculation: ensure at least 180s and expands with max clip end
    useEffect(() => {
        if (project.clips.length === 0) {
            if (project.duration < 180) {
                setProject(prev => ({ ...prev, duration: 180 }));
            }
            return;
        }
        const maxClipEnd = Math.max(...project.clips.map(c => c.startTime + c.duration));
        const requiredDuration = Math.max(180, Math.ceil(maxClipEnd + 30));
        if (requiredDuration > project.duration) {
            setProject(prev => ({ ...prev, duration: requiredDuration }));
        }
    }, [project.clips, project.duration]);

    // Push new history state
    const pushHistory = useCallback((newProj: TimelineProject) => {
        if (isUndoingOrRedoing.current) return;
        setHistory(prev => {
            const nextHistory = prev.slice(0, historyIndex + 1);
            nextHistory.push(newProj);
            if (nextHistory.length > 30) nextHistory.shift();
            return nextHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 29));
    }, [historyIndex]);

    // VU meter level polling during playback
    useEffect(() => {
        if (!isPlaying) {
            setVuMeterLevels({ left: 0, right: 0, peak: 0 });
            return;
        }

        let meterRaf: number;
        const updateMeter = () => {
            if (!isPlaying) return;
            const levels = audioEngine.getVULevel();
            setVuMeterLevels(levels);
            meterRaf = requestAnimationFrame(updateMeter);
        };

        meterRaf = requestAnimationFrame(updateMeter);
        return () => cancelAnimationFrame(meterRaf);
    }, [isPlaying]);

    // Sync tracks with AudioEngine
    useEffect(() => {
        audioEngine.syncTracks(project.tracks);
    }, [project.tracks]);

    // ──────────────────────────────────────────────
    // Transport Actions
    // ──────────────────────────────────────────────
    const play = useCallback(() => {
        setIsPlaying(true);
        audioEngine.play(
            playheadTime,
            project.clips,
            project.tracks,
            project.duration,
            (time) => {
                setPlayheadTime(time);
                if (project.isLooping && project.loopStart !== null && project.loopEnd !== null) {
                    if (time >= project.loopEnd) {
                        seek(project.loopStart);
                    }
                }
            },
            () => {
                setIsPlaying(false);
                setPlayheadTime(0);
            }
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playheadTime, project.clips, project.tracks, project.duration, project.isLooping, project.loopStart, project.loopEnd]);

    const pause = useCallback(() => {
        const pausedTime = audioEngine.pause();
        setIsPlaying(false);
        setPlayheadTime(pausedTime);
    }, []);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }, [isPlaying, play, pause]);

    const seek = useCallback((time: number) => {
        const clampedTime = Math.max(0, Math.min(project.duration, time));
        setPlayheadTime(clampedTime);
        audioEngine.seek(clampedTime, project.clips, project.tracks, project.duration);
    }, [project.duration, project.clips, project.tracks]);

    const setMasterVolume = useCallback((vol: number) => {
        const clamped = Math.max(0, Math.min(1.5, vol));
        audioEngine.setMasterVolume(clamped);
        setProject(prev => ({ ...prev, masterVolume: clamped }));
    }, []);

    // ──────────────────────────────────────────────
    // Track Actions
    // ──────────────────────────────────────────────
    const addTrack = useCallback((name?: string, color?: string): string => {
        const id = `track_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
        const chosenColor = color || colors[project.tracks.length % colors.length];

        const newTrack: TimelineTrack = {
            id,
            name: name || `Audio Track ${project.tracks.length + 1}`,
            color: chosenColor,
            volume: 1.0,
            pan: 0.0,
            isMuted: false,
            isSolo: false,
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0,
        };

        setProject(prev => {
            const nextProj = { ...prev, tracks: [...prev.tracks, newTrack] };
            pushHistory(nextProj);
            return nextProj;
        });

        return id;
    }, [project.tracks.length, pushHistory]);

    const removeTrack = useCallback((trackId: string) => {
        setProject(prev => {
            const nextProj = {
                ...prev,
                tracks: prev.tracks.filter(t => t.id !== trackId),
                clips: prev.clips.filter(c => c.trackId !== trackId),
            };
            pushHistory(nextProj);
            return nextProj;
        });
        if (selectedTrackId === trackId) setSelectedTrackId(null);
    }, [selectedTrackId, pushHistory]);

    const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
        setProject(prev => {
            const nextTracks = prev.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t);
            const nextProj = { ...prev, tracks: nextTracks };
            return nextProj;
        });
    }, []);

    const toggleTrackMute = useCallback((trackId: string) => {
        setProject(prev => {
            const nextTracks = prev.tracks.map(t => {
                if (t.id !== trackId) return t;
                const nextMute = !t.isMuted;
                return {
                    ...t,
                    isMuted: nextMute,
                    isSolo: nextMute ? false : t.isSolo,
                };
            });
            return { ...prev, tracks: nextTracks };
        });
    }, []);

    const toggleTrackSolo = useCallback((trackId: string) => {
        setProject(prev => {
            const target = prev.tracks.find(t => t.id === trackId);
            if (!target) return prev;
            const nextSolo = !target.isSolo;
            const nextTracks = prev.tracks.map(t => {
                if (t.id !== trackId) return t;
                return {
                    ...t,
                    isSolo: nextSolo,
                    isMuted: nextSolo ? false : t.isMuted,
                };
            });
            return { ...prev, tracks: nextTracks };
        });
    }, []);

    const resetTrackToDefaults = useCallback((trackId: string) => {
        setProject(prev => {
            const nextTracks = prev.tracks.map(t => {
                if (t.id !== trackId) return t;
                return {
                    ...t,
                    volume: 1.0,
                    pan: 0.0,
                    eqLow: 0,
                    eqMid: 0,
                    eqHigh: 0,
                    isMuted: false,
                    isSolo: false,
                };
            });
            const nextProj = { ...prev, tracks: nextTracks };
            pushHistory(nextProj);
            return nextProj;
        });
    }, [pushHistory]);

    const resetAllTracksToDefaults = useCallback(() => {
        setMasterVolume(1.0);
        setProject(prev => {
            const nextTracks = prev.tracks.map(t => ({
                ...t,
                volume: 1.0,
                pan: 0.0,
                eqLow: 0,
                eqMid: 0,
                eqHigh: 0,
                isMuted: false,
                isSolo: false,
            }));
            const nextProj = { ...prev, tracks: nextTracks, masterVolume: 1.0 };
            pushHistory(nextProj);
            return nextProj;
        });
    }, [pushHistory, setMasterVolume]);

    // ──────────────────────────────────────────────
    // Clip Actions
    // ──────────────────────────────────────────────
    const addClip = useCallback(async (clipData: Omit<TimelineClip, 'id'>): Promise<string> => {
        const id = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        let peaks = clipData.peaks;
        let originalDuration = clipData.originalDuration;

        if (!peaks || !originalDuration) {
            try {
                const buf = await getOrFetchAudioBuffer(clipData.audioUrl);
                originalDuration = buf.duration;
                peaks = await getOrComputePeaks(clipData.audioUrl);
            } catch (err) {
                console.warn('Failed to compute peaks for new clip', err);
            }
        }

        const newClip: TimelineClip = {
            ...clipData,
            id,
            originalDuration: originalDuration || clipData.duration,
            peaks,
        };

        setProject(prev => {
            const nextProj = { ...prev, clips: [...prev.clips, newClip] };
            pushHistory(nextProj);
            return nextProj;
        });

        return id;
    }, [pushHistory]);

    const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
        setProject(prev => {
            const nextClips = prev.clips.map(c => c.id === clipId ? { ...c, ...updates } : c);
            return { ...prev, clips: nextClips };
        });
    }, []);

    const removeClip = useCallback((clipId: string) => {
        setProject(prev => {
            const nextProj = {
                ...prev,
                clips: prev.clips.filter(c => c.id !== clipId),
            };
            pushHistory(nextProj);
            return nextProj;
        });
        if (selectedClipId === clipId) setSelectedClipId(null);
    }, [selectedClipId, pushHistory]);

    const moveClip = useCallback((clipId: string, newStartTime: number, newTrackId?: string) => {
        const clampedStart = Math.max(0, newStartTime);
        setProject(prev => {
            const nextClips = prev.clips.map(c => {
                if (c.id !== clipId) return c;
                return {
                    ...c,
                    startTime: clampedStart,
                    trackId: newTrackId || c.trackId,
                };
            });
            const nextProj = { ...prev, clips: nextClips };
            pushHistory(nextProj);
            return nextProj;
        });
    }, [pushHistory]);

    const trimClip = useCallback((clipId: string, newOffset: number, newDuration: number, newStartTime?: number) => {
        setProject(prev => {
            const nextClips = prev.clips.map(c => {
                if (c.id !== clipId) return c;
                const offset = Math.max(0, Math.min(c.originalDuration, newOffset));
                const maxDur = Math.max(0.1, c.originalDuration - offset);
                const duration = Math.max(0.1, Math.min(maxDur, newDuration));
                return {
                    ...c,
                    offset,
                    duration,
                    startTime: newStartTime !== undefined ? Math.max(0, newStartTime) : c.startTime,
                };
            });
            const nextProj = { ...prev, clips: nextClips };
            pushHistory(nextProj);
            return nextProj;
        });
    }, [pushHistory]);

    const splitClipAtPlayhead = useCallback((targetClipId?: string) => {
        const clipId = targetClipId || selectedClipId;
        if (!clipId) return;

        const clip = project.clips.find(c => c.id === clipId);
        if (!clip) return;

        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (playheadTime <= clipStart + 0.05 || playheadTime >= clipEnd - 0.05) {
            return;
        }

        const deltaT = playheadTime - clipStart;
        const leftDuration = deltaT;
        const rightOffset = clip.offset + deltaT;
        const rightDuration = clip.duration - deltaT;

        const rightClipId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const rightClip: TimelineClip = {
            ...clip,
            id: rightClipId,
            startTime: playheadTime,
            offset: rightOffset,
            duration: rightDuration,
        };

        setProject(prev => {
            const nextClips = prev.clips.map(c => {
                if (c.id !== clipId) return c;
                return {
                    ...c,
                    duration: leftDuration,
                };
            }).concat(rightClip);

            const nextProj = { ...prev, clips: nextClips };
            pushHistory(nextProj);
            return nextProj;
        });

        setSelectedClipId(rightClipId);
    }, [selectedClipId, project.clips, playheadTime, pushHistory]);

    const duplicateClip = useCallback((clipId: string) => {
        const clip = project.clips.find(c => c.id === clipId);
        if (!clip) return;

        const newId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newClip: TimelineClip = {
            ...clip,
            id: newId,
            startTime: clip.startTime + clip.duration + 0.5,
        };

        setProject(prev => {
            const nextProj = { ...prev, clips: [...prev.clips, newClip] };
            pushHistory(nextProj);
            return nextProj;
        });
        setSelectedClipId(newId);
    }, [project.clips, pushHistory]);

    const setClipGain = useCallback((clipId: string, gain: number) => {
        const clampedGain = Math.max(0, Math.min(2.0, gain));
        updateClip(clipId, { gain: clampedGain });
    }, [updateClip]);

    const selectClip = useCallback((clipId: string | null) => {
        setSelectedClipId(clipId);
        if (clipId) {
            const clip = project.clips.find(c => c.id === clipId);
            if (clip) setSelectedTrackId(clip.trackId);
        }
    }, [project.clips]);

    const selectTrack = useCallback((trackId: string | null) => {
        setSelectedTrackId(trackId);
    }, []);

    // ──────────────────────────────────────────────
    // Merge Selected Timeline Tracks
    // ──────────────────────────────────────────────
    const mergeTracks = useCallback(async (trackIds: string[], customName?: string): Promise<{ trackId: string; trackName: string; audioUrl: string }> => {
        const selectedClips = project.clips.filter(c => trackIds.includes(c.trackId));
        if (selectedClips.length === 0) {
            throw new Error('No clips found in selected tracks to merge.');
        }

        const urls = selectedClips.map(c => c.audioUrl);
        const mergedBuffer = await mergeStemsToBuffer(urls);
        const wavBlob = audioBufferToWavBlob(mergedBuffer);

        const newTrackName = customName || `Merged (${trackIds.length} Tracks)`;
        const trackId = `track_merged_${Date.now()}`;
        const newBlobUrl = URL.createObjectURL(wavBlob);

        // Persist blob
        await saveBlobToDB(trackId, wavBlob);

        const newTrack: TimelineTrack = {
            id: trackId,
            name: newTrackName,
            color: '#10b981',
            volume: 1.0,
            pan: 0.0,
            isMuted: false,
            isSolo: false,
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0,
        };

        const peaks = await getOrComputePeaks(newBlobUrl);
        const clipId = `clip_merged_${Date.now()}`;

        const newClip: TimelineClip = {
            id: clipId,
            trackId,
            stemName: 'Merged Track',
            songId: project.currentSongId || 'custom',
            songTitle: 'Merged',
            audioUrl: newBlobUrl,
            startTime: 0,
            offset: 0,
            duration: mergedBuffer.duration,
            originalDuration: mergedBuffer.duration,
            gain: 1.0,
            color: '#10b981',
            peaks,
        };

        setProject(prev => {
            const nextProj: TimelineProject = {
                ...prev,
                tracks: [...prev.tracks, newTrack],
                clips: [...prev.clips, newClip],
            };
            pushHistory(nextProj);
            return nextProj;
        });

        return { trackId, trackName: newTrackName, audioUrl: newBlobUrl };
    }, [project.clips, project.currentSongId, pushHistory]);

    // ──────────────────────────────────────────────
    // 1-Click Import / Restore Song Stems to Timeline
    // ──────────────────────────────────────────────
    const loadSongStemsToTimeline = useCallback(async (song: SongItem) => {
        // First check if user previously edited this song and we have saved state
        const savedProj = savedSongProjects[song.id];
        if (savedProj && savedProj.tracks.length > 0 && savedProj.clips.length > 0) {
            // Recompute peaks for clips if missing
            const hydratedClips = await Promise.all(savedProj.clips.map(async (c) => {
                if (!c.peaks || c.peaks.length === 0) {
                    try {
                        const p = await getOrComputePeaks(c.audioUrl);
                        return { ...c, peaks: p };
                    } catch {
                        return c;
                    }
                }
                return c;
            }));

            const restoredProj: TimelineProject = {
                ...savedProj,
                clips: hydratedClips,
                currentSongId: song.id,
                playheadTime: 0,
                duration: Math.max(180, savedProj.duration || 180),
            };

            setProject(restoredProj);
            pushHistory(restoredProj);
            seek(0);
            return;
        }

        if (!song.stems) return;

        const stemEntries = Object.entries(song.stems).filter(([, url]) => !!url);
        if (stemEntries.length === 0) return;

        const newTracks: TimelineTrack[] = [];
        const newClips: TimelineClip[] = [];

        for (const [stemName, url] of stemEntries) {
            if (!url) continue;

            const trackId = `track_${stemName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
            const color = STEM_COLORS[stemName] || '#64748b';

            newTracks.push({
                id: trackId,
                name: `${song.name} - ${stemName}`,
                color,
                volume: 1.0,
                pan: 0.0,
                isMuted: false,
                isSolo: false,
                eqLow: 0,
                eqMid: 0,
                eqHigh: 0,
            });

            let duration = 60;
            let peaks: number[] = [];
            try {
                const buf = await getOrFetchAudioBuffer(url);
                duration = buf.duration;
                peaks = await getOrComputePeaks(url);
            } catch (e) {
                console.warn(`Could not precompute peaks for ${stemName}`, e);
            }

            const clipId = `clip_${stemName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            newClips.push({
                id: clipId,
                trackId,
                stemName,
                songId: song.id,
                songTitle: song.name,
                audioUrl: url,
                startTime: 0,
                offset: 0,
                duration,
                originalDuration: duration,
                gain: 1.0,
                color,
                peaks,
            });
        }

        const maxDuration = Math.max(...newClips.map(c => c.duration), 60);
        const dynamicProjectDuration = Math.max(180, Math.ceil(maxDuration + 30));

        const nextProj: TimelineProject = {
            ...initialProject,
            tracks: newTracks,
            clips: newClips,
            currentSongId: song.id,
            playheadTime: 0,
            duration: dynamicProjectDuration,
        };

        setProject(nextProj);
        pushHistory(nextProj);
        seek(0);
    }, [savedSongProjects, pushHistory, seek]);

    const clearTimeline = useCallback(() => {
        setProject(initialProject);
        setSelectedClipId(null);
        setSelectedTrackId(null);
        seek(0);
        localStorage.removeItem(TIMELINE_STORAGE_KEY);
    }, [seek]);

    // ──────────────────────────────────────────────
    // Zoom, Snap & Loop
    // ──────────────────────────────────────────────
    const setZoom = useCallback((zoomOrUpdater: number | ((prev: number) => number)) => {
        setProject(prev => {
            const nextZoom = typeof zoomOrUpdater === 'function' ? zoomOrUpdater(prev.zoom) : zoomOrUpdater;
            const clamped = Math.max(10, Math.min(250, nextZoom));
            return { ...prev, zoom: clamped };
        });
    }, []);

    const toggleSnapping = useCallback(() => {
        setProject(prev => ({ ...prev, isSnappingEnabled: !prev.isSnappingEnabled }));
    }, []);

    const setSnapInterval = useCallback((snapInterval: number) => {
        setProject(prev => ({ ...prev, snapInterval }));
    }, []);

    const toggleLoop = useCallback(() => {
        setProject(prev => ({ ...prev, isLooping: !prev.isLooping }));
    }, []);

    const setLoopPoints = useCallback((start: number | null, end: number | null) => {
        setProject(prev => ({ ...prev, loopStart: start, loopEnd: end }));
    }, []);

    // ──────────────────────────────────────────────
    // Undo / Redo
    // ──────────────────────────────────────────────
    const undo = useCallback(() => {
        if (historyIndex <= 0) return;
        isUndoingOrRedoing.current = true;
        const targetIndex = historyIndex - 1;
        const targetProj = history[targetIndex];
        setHistoryIndex(targetIndex);
        setProject(targetProj);
        isUndoingOrRedoing.current = false;
    }, [historyIndex, history]);

    const redo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        isUndoingOrRedoing.current = true;
        const targetIndex = historyIndex + 1;
        const targetProj = history[targetIndex];
        setHistoryIndex(targetIndex);
        setProject(targetProj);
        isUndoingOrRedoing.current = false;
    }, [historyIndex, history]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
                splitClipAtPlayhead();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedClipId) {
                    removeClip(selectedClipId);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, splitClipAtPlayhead, selectedClipId, removeClip, undo, redo]);

    return (
        <TimelineContext.Provider value={{
            project,
            isPlaying,
            playheadTime,
            selectedClipId,
            selectedTrackId,
            vuMeterLevels,
            addTrack,
            removeTrack,
            updateTrack,
            toggleTrackMute,
            toggleTrackSolo,
            resetTrackToDefaults,
            resetAllTracksToDefaults,
            setMasterVolume,
            addClip,
            updateClip,
            removeClip,
            moveClip,
            trimClip,
            splitClipAtPlayhead,
            duplicateClip,
            setClipGain,
            selectClip,
            selectTrack,
            mergeTracks,
            loadSongStemsToTimeline,
            clearTimeline,
            play,
            pause,
            togglePlay,
            seek,
            setZoom,
            toggleSnapping,
            setSnapInterval,
            toggleLoop,
            setLoopPoints,
            undo,
            redo,
            canUndo: historyIndex > 0,
            canRedo: historyIndex < history.length - 1,
        }}>
            {children}
        </TimelineContext.Provider>
    );
}
