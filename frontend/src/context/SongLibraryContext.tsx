import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import axios from 'axios';
import { apiGet, apiPost, type ProcessingMode } from '../utils/api';
import { saveBlobToDB, getBlobFromDB, deleteBlobFromDB } from '../utils/db';
import { useProcessingMode } from './ProcessingModeContext';
import type { SongItem, Stems, JobStatus } from '../types';

const LIBRARY_STORAGE_KEY = 'unweave_song_library';
const ACTIVE_SONG_KEY = 'unweave_active_song_id';

interface SongLibraryContextValue {
    songs: SongItem[];
    activeSongId: string | null;
    activeSong: SongItem | null;
    isBatchProcessing: boolean;
    addSongs: (files: File[]) => Promise<void>;
    removeSong: (songId: string) => Promise<void>;
    processSong: (songId: string) => Promise<void>;
    cancelProcessing: (songId: string) => Promise<void>;
    processAllQueued: () => Promise<void>;
    selectSong: (songId: string | null) => void;
    clearAllSongs: () => Promise<void>;
    getStemUrl: (songId: string, stemName: string) => string | undefined;
    addCustomStemToSong: (songId: string, stemName: string, url: string) => void;
    moveCustomStemBetweenSongs: (fromSongId: string, toSongId: string, stemName: string) => void;
    copyCustomStemToSong: (toSongId: string, stemName: string, url: string) => void;
    removeStemFromSong: (songId: string, stemName: string) => void;
}

const SongLibraryContext = createContext<SongLibraryContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSongLibrary() {
    const context = useContext(SongLibraryContext);
    if (!context) {
        throw new Error('useSongLibrary must be used within a SongLibraryProvider');
    }
    return context;
}

export function SongLibraryProvider({ children }: { children: ReactNode }) {
    const { processingMode } = useProcessingMode();
    const [songs, setSongs] = useState<SongItem[]>(() => {
        try {
            const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
            if (!raw) return [];
            const parsed: SongItem[] = JSON.parse(raw);
            return parsed;
        } catch {
            return [];
        }
    });

    const [activeSongId, setActiveSongId] = useState<string | null>(() => {
        return localStorage.getItem(ACTIVE_SONG_KEY) || null;
    });

    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const activePollers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const passNumberRefs = useRef<Map<string, number>>(new Map());
    const prevRawProgressRefs = useRef<Map<string, number>>(new Map());
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    // Save songs list to localStorage whenever it changes
    useEffect(() => {
        try {
            // Strip out non-serializable properties (File objects) before saving
            const serializableSongs = songs.map(s => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { originalFile, stemBlobs, ...rest } = s;
                return rest;
            });
            localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(serializableSongs));
        } catch (e) {
            console.error('Failed to save song library to localStorage', e);
        }
    }, [songs]);

    // Save active song ID
    useEffect(() => {
        if (activeSongId) {
            localStorage.setItem(ACTIVE_SONG_KEY, activeSongId);
        } else {
            localStorage.removeItem(ACTIVE_SONG_KEY);
        }
    }, [activeSongId]);

    // Hydrate blob: URLs from IndexedDB on initial mount
    useEffect(() => {
        const hydrateStemsFromDB = async () => {
            let changed = false;
            const updatedSongs = await Promise.all(songs.map(async (song) => {
                if (!song.stems) return song;

                const hydratedStems: Stems = { ...song.stems };
                let songChanged = false;

                for (const [stemName, url] of Object.entries(hydratedStems)) {
                    if (url && (url.startsWith('blob:') || processingMode === 'gpu')) {
                        try {
                            const dbKey = `${song.id}_${stemName}`;
                            const blob = await getBlobFromDB(dbKey);
                            if (blob && blob.size > 0) {
                                const safeBlob = new Blob([blob], { type: 'audio/mpeg' });
                                hydratedStems[stemName] = URL.createObjectURL(safeBlob);
                                songChanged = true;
                            }
                        } catch (err) {
                            console.warn(`Could not hydrate stem ${stemName} for song ${song.name}`, err);
                        }
                    }
                }

                if (songChanged) {
                    changed = true;
                    return { ...song, stems: hydratedStems };
                }
                return song;
            }));

            if (changed) {
                setSongs(updatedSongs);
            }
        };

        hydrateStemsFromDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Stop polling and cleanup on unmount
    useEffect(() => {
        const pollers = activePollers.current;
        const controllers = abortControllers.current;
        return () => {
            for (const [, timer] of pollers.entries()) {
                clearInterval(timer);
            }
            pollers.clear();
            for (const [, ctrl] of controllers.entries()) {
                ctrl.abort();
            }
            controllers.clear();
        };
    }, []);

    const updateSong = useCallback((songId: string, updates: Partial<SongItem>) => {
        setSongs(prev => prev.map(s => s.id === songId ? { ...s, ...updates } : s));
    }, []);

    const startPollingJob = useCallback((songId: string, jobId: string, mode: ProcessingMode) => {
        // Clear any existing poller for this song
        if (activePollers.current.has(songId)) {
            clearInterval(activePollers.current.get(songId)!);
            activePollers.current.delete(songId);
        }

        passNumberRefs.current.set(songId, 1);
        prevRawProgressRefs.current.set(songId, 0);

        const poll = async () => {
            try {
                const res = await apiGet<JobStatus>(`/status/${jobId}`, mode);
                const data = res.data;
                const rawProgress = data.progress;
                const rawEta = data.eta_seconds;

                let currentPass = passNumberRefs.current.get(songId) || 1;
                const prevProgress = prevRawProgressRefs.current.get(songId) || 0;

                // Detect dual-pass transition
                if (prevProgress > 50 && rawProgress < 20 && currentPass === 1) {
                    currentPass = 2;
                    passNumberRefs.current.set(songId, 2);
                }
                prevRawProgressRefs.current.set(songId, rawProgress);

                if (data.status === 'queued') {
                    updateSong(songId, {
                        status: 'queued',
                        progress: 0,
                        etaSeconds: null,
                        statusMessage: data.message || 'In Queue...',
                        deviceUsed: data.device_used,
                    });
                    return;
                }

                let combinedProgress = 0;
                let combinedEta: number | null = null;
                if (currentPass === 1) {
                    combinedProgress = Math.round(rawProgress / 2);
                    combinedEta = rawEta !== null ? Math.round(rawEta * 2) : null;
                } else {
                    combinedProgress = Math.round(50 + rawProgress / 2);
                    combinedEta = rawEta;
                }

                updateSong(songId, {
                    status: 'processing',
                    progress: combinedProgress,
                    etaSeconds: combinedEta,
                    passNumber: currentPass,
                    statusMessage: data.message || 'Separating stems...',
                    deviceUsed: data.device_used,
                });

                if (data.status === 'complete' && data.stems) {
                    if (activePollers.current.has(songId)) {
                        clearInterval(activePollers.current.get(songId)!);
                        activePollers.current.delete(songId);
                    }

                    const finalStems: Stems = mode === 'gpu'
                        ? Object.fromEntries(
                            Object.entries(data.stems).map(([k, v]) => [
                                k,
                                v && v.startsWith('/stems/') ? `/gpu-api${v}` : v,
                            ])
                          )
                        : data.stems;

                    // Download blobs for GPU mode and persist to IndexedDB
                    if (mode === 'gpu') {
                        updateSong(songId, { statusMessage: 'Downloading stems for playback...' });
                        try {
                            const blobStems: Stems = {};
                            for (const [stemName, stemUrl] of Object.entries(finalStems)) {
                                if (!stemUrl) continue;
                                const resp = await fetch(stemUrl);
                                if (resp.ok) {
                                    const blob = await resp.blob();
                                    const safeBlob = new Blob([blob], { type: 'audio/mpeg' });
                                    await saveBlobToDB(`${songId}_${stemName}`, safeBlob);
                                    blobStems[stemName] = URL.createObjectURL(safeBlob);
                                }
                            }
                            updateSong(songId, {
                                status: 'complete',
                                progress: 100,
                                etaSeconds: 0,
                                statusMessage: 'Separation complete!',
                                stems: blobStems,
                                processingTime: data.processing_time ?? undefined,
                                deviceUsed: data.device_used ?? undefined,
                            });
                            return;
                        } catch (err) {
                            console.warn('GPU blob fetch fallback to direct URLs', err);
                        }
                    }

                    // For CPU mode or fallback
                    updateSong(songId, {
                        status: 'complete',
                        progress: 100,
                        etaSeconds: 0,
                        statusMessage: 'Separation complete!',
                        stems: finalStems,
                        processingTime: data.processing_time ?? undefined,
                        deviceUsed: data.device_used ?? undefined,
                    });
                } else if (data.status === 'error' || data.status === 'cancelled') {
                    if (activePollers.current.has(songId)) {
                        clearInterval(activePollers.current.get(songId)!);
                        activePollers.current.delete(songId);
                    }
                    updateSong(songId, {
                        status: data.status,
                        statusMessage: data.message || 'Separation ended',
                        errorMessage: data.status === 'error' ? data.message : undefined,
                    });
                }
            } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    if (activePollers.current.has(songId)) {
                        clearInterval(activePollers.current.get(songId)!);
                        activePollers.current.delete(songId);
                    }
                    updateSong(songId, {
                        status: 'error',
                        statusMessage: 'Session expired. Please re-upload.',
                        errorMessage: 'Session expired on backend server.',
                    });
                }
            }
        };

        const timer = setInterval(poll, 1000);
        activePollers.current.set(songId, timer);
        poll();
    }, [updateSong]);

    const processSong = useCallback(async (songId: string) => {
        const song = songs.find(s => s.id === songId);
        if (!song || !song.originalFile) {
            console.error('Song or file not found for processing', songId);
            return;
        }

        updateSong(songId, {
            status: 'uploading',
            progress: 0,
            etaSeconds: null,
            statusMessage: 'Uploading audio to separator...',
            errorMessage: undefined,
        });

        // Abort previous request if any
        if (abortControllers.current.has(songId)) {
            abortControllers.current.get(songId)!.abort();
        }
        const controller = new AbortController();
        abortControllers.current.set(songId, controller);

        const formData = new FormData();
        formData.append('file', song.originalFile);

        try {
            const res = await apiPost<{ job_id: string; message: string }>(
                '/separate/',
                formData,
                processingMode,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    signal: controller.signal,
                }
            );

            const jobId = res.data.job_id;
            updateSong(songId, {
                jobId,
                status: 'processing',
                statusMessage: 'Separation started...',
            });

            startPollingJob(songId, jobId, processingMode);
        } catch (err) {
            if (axios.isCancel(err)) return;
            console.error('Failed to start separation for song', song.name, err);
            updateSong(songId, {
                status: 'error',
                statusMessage: 'Upload or separation failed.',
                errorMessage: axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Upload failed',
            });
        }
    }, [songs, processingMode, updateSong, startPollingJob]);

    const cancelProcessing = useCallback(async (songId: string) => {
        if (abortControllers.current.has(songId)) {
            abortControllers.current.get(songId)!.abort();
            abortControllers.current.delete(songId);
        }

        if (activePollers.current.has(songId)) {
            clearInterval(activePollers.current.get(songId)!);
            activePollers.current.delete(songId);
        }

        const song = songs.find(s => s.id === songId);
        if (song?.jobId) {
            try {
                await apiPost(`/cancel/${song.jobId}`, undefined, processingMode);
            } catch (err) {
                console.warn('Failed to cancel job on backend', err);
            }
        }

        updateSong(songId, {
            status: 'cancelled',
            statusMessage: 'Processing cancelled',
            progress: 0,
            etaSeconds: null,
        });
    }, [songs, processingMode, updateSong]);

    const addSongs = useCallback(async (files: File[]) => {
        const newSongs: SongItem[] = [];

        for (const file of files) {
            const id = `song_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const newSong: SongItem = {
                id,
                name: file.name.replace(/\.[^/.]+$/, ''),
                fileSize: file.size,
                duration: null,
                uploadedAt: Date.now(),
                status: 'queued',
                progress: 0,
                etaSeconds: null,
                passNumber: 1,
                statusMessage: 'Queued for separation',
                jobId: null,
                stems: null,
                originalFile: file,
            };
            newSongs.push(newSong);
        }

        setSongs(prev => [...prev, ...newSongs]);

        // If no active song, select the first new song
        if (!activeSongId && newSongs.length > 0) {
            setActiveSongId(newSongs[0].id);
        }
    }, [activeSongId]);

    const processAllQueued = useCallback(async () => {
        setIsBatchProcessing(true);
        const queued = songs.filter(s => s.status === 'queued' || s.status === 'error' || s.status === 'cancelled');

        for (const song of queued) {
            await processSong(song.id);
        }
        setIsBatchProcessing(false);
    }, [songs, processSong]);

    const removeSong = useCallback(async (songId: string) => {
        await cancelProcessing(songId);

        // Clean up DB blobs for all stems of this song
        const stemNames = ['Vocals', 'Drums', 'Bass', 'Guitar', 'Piano', 'Other'];
        for (const stem of stemNames) {
            deleteBlobFromDB(`${songId}_${stem}`).catch(() => {});
        }

        setSongs(prev => prev.filter(s => s.id !== songId));

        if (activeSongId === songId) {
            setSongs(prev => {
                const remaining = prev.filter(s => s.id !== songId);
                setActiveSongId(remaining.length > 0 ? remaining[0].id : null);
                return remaining;
            });
        }
    }, [cancelProcessing, activeSongId]);

    const clearAllSongs = useCallback(async () => {
        for (const song of songs) {
            await removeSong(song.id);
        }
        setSongs([]);
        setActiveSongId(null);
        localStorage.removeItem(LIBRARY_STORAGE_KEY);
        localStorage.removeItem(ACTIVE_SONG_KEY);
    }, [songs, removeSong]);

    const selectSong = useCallback((songId: string | null) => {
        setActiveSongId(songId);
    }, []);

    const getStemUrl = useCallback((songId: string, stemName: string): string | undefined => {
        const song = songs.find(s => s.id === songId);
        return song?.stems?.[stemName];
    }, [songs]);

    const addCustomStemToSong = useCallback((songId: string, stemName: string, url: string) => {
        setSongs(prev => prev.map(s => {
            if (s.id !== songId) return s;
            return {
                ...s,
                stems: {
                    ...(s.stems || {}),
                    [stemName]: url,
                },
            };
        }));
    }, []);

    const removeStemFromSong = useCallback((songId: string, stemName: string) => {
        setSongs(prev => prev.map(s => {
            if (s.id !== songId || !s.stems) return s;
            const updatedStems = { ...s.stems };
            delete updatedStems[stemName];
            return {
                ...s,
                stems: updatedStems,
            };
        }));
    }, []);

    const copyCustomStemToSong = useCallback((toSongId: string, stemName: string, url: string) => {
        addCustomStemToSong(toSongId, stemName, url);
    }, [addCustomStemToSong]);

    const moveCustomStemBetweenSongs = useCallback((fromSongId: string, toSongId: string, stemName: string) => {
        const fromSong = songs.find(s => s.id === fromSongId);
        const url = fromSong?.stems?.[stemName];
        if (!url) return;

        setSongs(prev => prev.map(s => {
            if (s.id === fromSongId && s.stems) {
                const nextStems = { ...s.stems };
                delete nextStems[stemName];
                return { ...s, stems: nextStems };
            }
            if (s.id === toSongId) {
                return {
                    ...s,
                    stems: {
                        ...(s.stems || {}),
                        [stemName]: url,
                    },
                };
            }
            return s;
        }));
    }, [songs]);

    const activeSong = songs.find(s => s.id === activeSongId) || null;

    return (
        <SongLibraryContext.Provider value={{
            songs,
            activeSongId,
            activeSong,
            isBatchProcessing,
            addSongs,
            removeSong,
            processSong,
            cancelProcessing,
            processAllQueued,
            selectSong,
            clearAllSongs,
            getStemUrl,
            addCustomStemToSong,
            moveCustomStemBetweenSongs,
            copyCustomStemToSong,
            removeStemFromSong,
        }}>
            {children}
        </SongLibraryContext.Provider>
    );
}
