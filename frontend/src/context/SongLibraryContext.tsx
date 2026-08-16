import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import axios from 'axios';
import { apiGet, apiPost, type ProcessingMode } from '../utils/api';
import { projectStorage } from '../services/projectStorage';
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
    processSong: (songId: string, customFile?: File, passes?: number) => Promise<void>;
    reprocessSong: (songId: string, customFile?: File, passes?: number) => Promise<void>;
    cancelProcessing: (songId: string) => Promise<void>;
    processAllQueued: () => Promise<void>;
    selectSong: (songId: string | null) => void;
    clearAllSongs: () => Promise<void>;
    getStemUrl: (songId: string, stemName: string) => string | undefined;
    addCustomStemToSong: (songId: string, stemName: string, url: string) => void;
    moveCustomStemBetweenSongs: (fromSongId: string, toSongId: string, stemName: string) => void;
    copyCustomStemToSong: (toSongId: string, stemName: string, url: string) => void;
    removeStemFromSong: (songId: string, stemName: string) => void;
    restoreSongsState: (restoredSongs: SongItem[]) => void;
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
    const { processingMode, separationPasses } = useProcessingMode();
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
    const prevRawProgressRefs = useRef<Map<string, number>>(new Map()).current;
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

    // Save activeSongId to localStorage
    useEffect(() => {
        if (activeSongId) {
            localStorage.setItem(ACTIVE_SONG_KEY, activeSongId);
        } else {
            localStorage.removeItem(ACTIVE_SONG_KEY);
        }
    }, [activeSongId]);

    // Hydrate blob URLs & raw audio files on mount
    useEffect(() => {
        const hydrateStorage = async () => {
            let changed = false;
            const updatedSongs = await Promise.all(
                songs.map(async (song) => {
                    let songModified = false;
                    let updatedSong = { ...song };

                    // Restore raw original audio file if missing from memory
                    if (!updatedSong.originalFile) {
                        try {
                            const rawFile = await projectStorage.getRawAudioFile(song.id, `${song.name}.mp3`);
                            if (rawFile) {
                                updatedSong.originalFile = rawFile;
                                songModified = true;
                                changed = true;
                            }
                        } catch {
                            // Ignore
                        }
                    }

                    if (song.status === 'complete' && song.stems) {
                        const hydratedStems: Stems = { ...song.stems };
                        for (const stemName of Object.keys(song.stems)) {
                            const stemKey = `${song.id}_${stemName}`;
                            try {
                                const validUrl = await projectStorage.getStemAudioUrl(stemKey);
                                if (validUrl) {
                                    hydratedStems[stemName] = validUrl;
                                    songModified = true;
                                    changed = true;
                                }
                            } catch {
                                // Ignore
                            }
                        }
                        if (songModified) {
                            updatedSong.stems = hydratedStems;
                        }
                    }

                    return songModified ? updatedSong : song;
                })
            );
            if (changed) {
                setSongs(updatedSongs);
            }
        };

        hydrateStorage();
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

    const startPollingJob = useCallback((songId: string, jobId: string, mode: ProcessingMode, jobPasses?: number) => {
        // Clear any existing poller for this song
        if (activePollers.current.has(songId)) {
            clearInterval(activePollers.current.get(songId)!);
            activePollers.current.delete(songId);
        }

        passNumberRefs.current.set(songId, 1);
        prevRawProgressRefs.set(songId, 0);

        const totalPasses = jobPasses || separationPasses || 2;

        const poll = async () => {
            try {
                const res = await apiGet<JobStatus>(`/status/${jobId}`, mode);
                const data = res.data;
                const rawProgress = data.progress;
                const rawEta = data.eta_seconds;

                let currentPass = passNumberRefs.current.get(songId) || 1;
                const prevProgress = prevRawProgressRefs.get(songId) || 0;

                // Detect multi-pass transition
                if (prevProgress > 50 && rawProgress < 20 && currentPass < totalPasses) {
                    currentPass += 1;
                    passNumberRefs.current.set(songId, currentPass);
                }
                prevRawProgressRefs.set(songId, rawProgress);

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

                const completedPassesProgress = ((currentPass - 1) / totalPasses) * 100;
                const currentPassSlice = (rawProgress / totalPasses);
                const combinedProgress = Math.min(99, Math.round(completedPassesProgress + currentPassSlice));
                const remainingPasses = Math.max(1, totalPasses - currentPass + 1);
                const combinedEta = rawEta !== null ? Math.round(rawEta * remainingPasses) : null;

                updateSong(songId, {
                    status: 'processing',
                    progress: combinedProgress,
                    etaSeconds: combinedEta,
                    passNumber: currentPass,
                    statusMessage: data.message || `Separating stems (Pass ${currentPass}/${totalPasses})...`,
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
                        : Object.fromEntries(
                            Object.entries(data.stems).map(([k, v]) => [
                                k,
                                v && v.startsWith('/stems/') ? `http://127.0.0.1:8010${v}` : v,
                            ])
                          );

                    updateSong(songId, { statusMessage: 'Saving stems into project storage...' });
                    try {
                        const blobStems: Stems = {};
                        for (const [stemName, stemUrl] of Object.entries(finalStems)) {
                            if (!stemUrl) continue;
                            try {
                                const resp = await fetch(stemUrl);
                                if (resp.ok) {
                                    const blob = await resp.blob();
                                    const safeBlob = new Blob([blob], { type: 'audio/mpeg' });
                                    await projectStorage.saveStemAudio(`${songId}_${stemName}`, safeBlob);
                                    blobStems[stemName] = URL.createObjectURL(safeBlob);
                                } else {
                                    blobStems[stemName] = stemUrl;
                                }
                            } catch (e) {
                                console.warn(`Could not fetch stem audio for ${stemName}`, e);
                                blobStems[stemName] = stemUrl;
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
                        console.warn('Error saving stems to project storage fallback to URLs', err);
                        updateSong(songId, {
                            status: 'complete',
                            progress: 100,
                            etaSeconds: 0,
                            statusMessage: 'Separation complete!',
                            stems: finalStems,
                            processingTime: data.processing_time ?? undefined,
                            deviceUsed: data.device_used ?? undefined,
                        });
                        return;
                    }
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
    }, [updateSong, separationPasses, prevRawProgressRefs]);

    const processSong = useCallback(async (songId: string, customFile?: File, passes?: number) => {
        const song = songs.find(s => s.id === songId);
        let fileToUse = customFile || song?.originalFile;

        // Auto-fetch from persistent project storage if missing from RAM
        if (!fileToUse && song) {
            try {
                const storedFile = await projectStorage.getRawAudioFile(songId, `${song.name}.mp3`);
                if (storedFile) {
                    fileToUse = storedFile;
                    updateSong(songId, { originalFile: storedFile });
                }
            } catch (err) {
                console.warn('Could not restore raw audio from DB:', err);
            }
        }

        if (customFile) {
            projectStorage.saveRawAudio(songId, customFile).catch(() => {});
        }

        if (!song || !fileToUse) {
            console.error('Song or file not found for processing', songId);
            return;
        }

        const effectivePasses = passes || separationPasses || 2;

        updateSong(songId, {
            status: 'uploading',
            progress: 0,
            etaSeconds: null,
            passNumber: 1,
            statusMessage: 'Uploading audio to separator...',
            errorMessage: undefined,
            originalFile: fileToUse,
            separationPasses: effectivePasses,
        });

        // Abort previous request if any
        if (abortControllers.current.has(songId)) {
            abortControllers.current.get(songId)!.abort();
        }
        const controller = new AbortController();
        abortControllers.current.set(songId, controller);

        const formData = new FormData();
        formData.append('file', fileToUse);
        formData.append('shifts', String(effectivePasses));

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

            startPollingJob(songId, jobId, processingMode, effectivePasses);
        } catch (err) {
            if (axios.isCancel(err)) return;
            console.error('Failed to start separation for song', song.name, err);
            updateSong(songId, {
                status: 'error',
                statusMessage: 'Upload or separation failed.',
                errorMessage: axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Upload failed',
            });
        }
    }, [songs, processingMode, separationPasses, updateSong, startPollingJob]);

    const reprocessSong = useCallback(async (songId: string, customFile?: File, passes?: number) => {
        if (customFile) {
            projectStorage.saveRawAudio(songId, customFile).catch(() => {});
            updateSong(songId, {
                originalFile: customFile,
                status: 'queued',
                progress: 0,
                errorMessage: undefined,
            });
            setTimeout(() => {
                processSong(songId, customFile, passes);
            }, 50);
            return;
        }
        processSong(songId, undefined, passes);
    }, [updateSong, processSong]);

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
            // Persist raw source audio to IndexedDB
            await projectStorage.saveRawAudio(id, file);

            const newSong: SongItem = {
                id,
                name: file.name.replace(/\.[^/.]+$/, ''),
                fileSize: file.size,
                duration: null,
                uploadedAt: Date.now(),
                status: 'idle',
                progress: 0,
                etaSeconds: null,
                passNumber: 1,
                statusMessage: 'Ready to separate',
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
        const queued = songs.filter(s => s.status === 'idle' || s.status === 'queued' || s.status === 'error' || s.status === 'cancelled');

        for (const song of queued) {
            await processSong(song.id);
        }
        setIsBatchProcessing(false);
    }, [songs, processSong]);

    const removeSong = useCallback(async (songId: string) => {
        await cancelProcessing(songId);

        // Clean up project storage for all stems and raw audio of this song
        projectStorage.deleteRawAudio(songId).catch(() => {});
        const stemNames = ['Vocals', 'Drums', 'Bass', 'Guitar', 'Piano', 'Other'];
        for (const stem of stemNames) {
            projectStorage.deleteStemAudio(`${songId}_${stem}`).catch(() => {});
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
        setSongs([]);
        setActiveSongId(null);
        localStorage.removeItem(LIBRARY_STORAGE_KEY);
        localStorage.removeItem(ACTIVE_SONG_KEY);
        await projectStorage.clearAutoSaveSession();
    }, []);

    const restoreSongsState = useCallback((restoredSongs: SongItem[]) => {
        setSongs(restoredSongs);
        if (restoredSongs.length > 0) {
            setActiveSongId(restoredSongs[0].id);
        } else {
            setActiveSongId(null);
            localStorage.removeItem(LIBRARY_STORAGE_KEY);
            localStorage.removeItem(ACTIVE_SONG_KEY);
        }
    }, []);

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
        projectStorage.deleteStemAudio(`${songId}_${stemName}`).catch(() => {});
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
            reprocessSong,
            cancelProcessing,
            processAllQueued,
            selectSong,
            clearAllSongs,
            getStemUrl,
            addCustomStemToSong,
            moveCustomStemBetweenSongs,
            copyCustomStemToSong,
            removeStemFromSong,
            restoreSongsState,
        }}>
            {children}
        </SongLibraryContext.Provider>
    );
}
