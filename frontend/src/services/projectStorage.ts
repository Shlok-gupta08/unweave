import { saveBlobToDB, getBlobFromDB, deleteBlobFromDB } from '../utils/db';
import type { TimelineProject, SongItem, AutoSaveInfo, AutoSaveMeta } from '../types';

const objectUrlCache = new Map<string, string>();

/**
 * Helper to convert Blob to Base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const base64 = reader.result.split(',')[1] || '';
                resolve(base64);
            } else {
                reject(new Error('Failed to read blob as string'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Helper to convert Base64 to Blob
 */
function base64ToBlob(base64: string, mimeType = 'audio/mpeg'): Blob {
    const byteCharacters = atob(base64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteArray.buffer as ArrayBuffer], { type: mimeType });
}

export const projectStorage = {
    /**
     * Permanently save raw stem / track audio data
     */
    async saveStemAudio(key: string, blob: Blob): Promise<void> {
        try {
            // Save to IndexedDB (available in both Web and Electron)
            await saveBlobToDB(key, blob);

            // If in desktop Electron, also save as real file in dedicated projects folder
            if (typeof window !== 'undefined' && window.electronAPI?.saveAudioFile) {
                const base64 = await blobToBase64(blob);
                const safeFilename = `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
                await window.electronAPI.saveAudioFile(safeFilename, base64);
            }
        } catch (err) {
            console.warn(`[ProjectStorage] Error persisting stem audio ${key}:`, err);
        }
    },

    /**
     * Retrieve a permanent stem audio file and generate a stable Blob URL
     */
    async getStemAudioUrl(key: string): Promise<string | null> {
        if (objectUrlCache.has(key)) {
            return objectUrlCache.get(key)!;
        }

        try {
            // Try Electron dedicated project folder first if on desktop
            if (typeof window !== 'undefined' && window.electronAPI?.loadAudioFile) {
                const safeFilename = `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
                const base64 = await window.electronAPI.loadAudioFile(safeFilename);
                if (base64) {
                    const blob = base64ToBlob(base64);
                    const url = URL.createObjectURL(blob);
                    objectUrlCache.set(key, url);
                    return url;
                }
            }

            // Fallback to IndexedDB
            const blob = await getBlobFromDB(key);
            if (blob && blob.size > 0) {
                const safeBlob = new Blob([blob], { type: 'audio/mpeg' });
                const url = URL.createObjectURL(safeBlob);
                objectUrlCache.set(key, url);
                return url;
            }
        } catch (err) {
            console.warn(`[ProjectStorage] Error loading stem audio ${key}:`, err);
        }

        return null;
    },

    /**
     * Delete stored stem audio
     */
    async deleteStemAudio(key: string): Promise<void> {
        objectUrlCache.delete(key);
        await deleteBlobFromDB(key).catch(() => {});
    },

    /**
     * Save raw source audio file to IndexedDB/Storage for persistent stem separation across reloads
     */
    async saveRawAudio(songId: string, file: File | Blob): Promise<void> {
        try {
            const key = `raw_audio_${songId}`;
            await saveBlobToDB(key, file);
        } catch (err) {
            console.warn(`[ProjectStorage] Error saving raw audio for ${songId}:`, err);
        }
    },

    /**
     * Retrieve stored raw source audio file as a valid File object
     */
    async getRawAudioFile(songId: string, fileName = 'audio.mp3'): Promise<File | null> {
        try {
            const key = `raw_audio_${songId}`;
            const blob = await getBlobFromDB(key);
            if (blob && blob.size > 0) {
                return new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
            }
        } catch (err) {
            console.warn(`[ProjectStorage] Error loading raw audio for ${songId}:`, err);
        }
        return null;
    },

    /**
     * Delete stored raw source audio
     */
    async deleteRawAudio(songId: string): Promise<void> {
        const key = `raw_audio_${songId}`;
        await deleteBlobFromDB(key).catch(() => {});
    },

    /**
     * Check if an autosaved session exists
     */
    async getAutoSaveInfo(): Promise<AutoSaveInfo> {
        try {
            if (typeof window !== 'undefined' && window.electronAPI?.getAutoSaveInfo) {
                const info = await window.electronAPI.getAutoSaveInfo();
                if (info && info.exists) {
                    return info;
                }
            }

            const rawMeta = localStorage.getItem('unweave_autosave_meta');
            if (rawMeta) {
                const meta: AutoSaveMeta = JSON.parse(rawMeta);
                return { exists: true, meta };
            }
        } catch (err) {
            console.warn('[ProjectStorage] Error getting autosave info:', err);
        }
        return { exists: false };
    },

    /**
     * Save the entire active workspace state (Song Library + Timeline Project)
     */
    async saveAutoSaveSession(timelineProject: TimelineProject, songs: SongItem[]): Promise<void> {
        try {
            const serializableSongs = songs.map(s => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { originalFile, stemBlobs, ...rest } = s;
                return rest;
            });

            const serializableProject = {
                ...timelineProject,
                clips: timelineProject.clips.map(c => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { peaks, audioBlob, ...rest } = c;
                    return rest;
                }),
            };

            const completedSongs = songs.filter(s => s.status === 'complete' && s.stems);
            const activeSong = songs.find(s => s.id === timelineProject.currentSongId) || completedSongs[0];
            const songName = activeSong?.name || (timelineProject.tracks.length > 0 ? timelineProject.tracks[0].name : 'Studio Session');

            let stemCount = 0;
            for (const s of songs) {
                if (s.stems) {
                    stemCount += Object.values(s.stems).filter(Boolean).length;
                }
            }

            const meta: AutoSaveMeta = {
                songName,
                stemCount,
                trackCount: timelineProject.tracks.length,
                lastSaved: Date.now(),
                songId: activeSong?.id || null,
            };

            const payloadData = {
                timelineProject: serializableProject,
                songs: serializableSongs,
            };

            localStorage.setItem('unweave_autosave_meta', JSON.stringify(meta));
            localStorage.setItem('unweave_timeline_project', JSON.stringify(serializableProject));
            localStorage.setItem('unweave_song_library', JSON.stringify(serializableSongs));

            if (typeof window !== 'undefined' && window.electronAPI?.saveAutoSaveState) {
                await window.electronAPI.saveAutoSaveState({
                    data: payloadData,
                    meta,
                });
            }
        } catch (err) {
            console.error('[ProjectStorage] Failed to save autosave session:', err);
        }
    },

    /**
     * Load the autosaved workspace state
     */
    async loadAutoSaveSession(): Promise<{ timelineProject?: TimelineProject; songs?: SongItem[] } | null> {
        try {
            if (typeof window !== 'undefined' && window.electronAPI?.loadAutoSaveState) {
                const data = await window.electronAPI.loadAutoSaveState();
                if (data && (data.timelineProject || data.songs)) {
                    return data;
                }
            }

            const rawProj = localStorage.getItem('unweave_timeline_project');
            const rawSongs = localStorage.getItem('unweave_song_library');

            if (rawProj || rawSongs) {
                return {
                    timelineProject: rawProj ? JSON.parse(rawProj) : undefined,
                    songs: rawSongs ? JSON.parse(rawSongs) : undefined,
                };
            }
        } catch (err) {
            console.error('[ProjectStorage] Failed to load autosave session:', err);
        }
        return null;
    },

    /**
     * Clear the autosaved workspace state
     */
    async clearAutoSaveSession(): Promise<void> {
        try {
            localStorage.removeItem('unweave_autosave_meta');
            localStorage.removeItem('unweave_timeline_project');
            localStorage.removeItem('unweave_song_library');
            localStorage.removeItem('unweave_active_song_id');

            if (typeof window !== 'undefined' && window.electronAPI?.clearAutoSave) {
                await window.electronAPI.clearAutoSave();
            }
        } catch (err) {
            console.warn('[ProjectStorage] Error clearing autosave session:', err);
        }
    },

    /**
     * List all custom saved projects
     */
    async listCustomProjects(): Promise<(AutoSaveMeta & { id: string; createdAt: number })[]> {
        try {
            const raw = localStorage.getItem('unweave_saved_projects_index');
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (err) {
            console.warn('[ProjectStorage] Error listing custom projects:', err);
        }
        return [];
    },

    /**
     * Save a project with a custom name
     */
    async saveCustomProject(
        name: string,
        timelineProject: TimelineProject,
        songs: SongItem[],
        existingId?: string
    ): Promise<string> {
        const id = existingId || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = Date.now();

        const serializableSongs = songs.map(s => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { originalFile, stemBlobs, ...rest } = s;
            return rest;
        });

        const serializableProject = {
            ...timelineProject,
            clips: timelineProject.clips.map(c => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { peaks, audioBlob, ...rest } = c;
                return rest;
            }),
        };

        let stemCount = 0;
        for (const s of songs) {
            if (s.stems) {
                stemCount += Object.values(s.stems).filter(Boolean).length;
            }
        }

        const projectPayload = {
            id,
            name: name.trim() || 'Untitled Project',
            timelineProject: serializableProject,
            songs: serializableSongs,
            lastModified: now,
        };

        localStorage.setItem(`unweave_project_${id}`, JSON.stringify(projectPayload));

        // Update index
        const index = await this.listCustomProjects();
        const existingIdx = index.findIndex(p => p.id === id);
        const metaEntry = {
            id,
            songName: name.trim() || 'Untitled Project',
            songCount: songs.length,
            trackCount: timelineProject.tracks.length,
            stemCount,
            lastSaved: now,
            createdAt: existingIdx >= 0 ? index[existingIdx].createdAt : now,
        };

        if (existingIdx >= 0) {
            index[existingIdx] = metaEntry;
        } else {
            index.unshift(metaEntry);
        }

        localStorage.setItem('unweave_saved_projects_index', JSON.stringify(index));
        return id;
    },

    /**
     * Load a saved custom project by ID
     */
    async loadCustomProject(id: string): Promise<{ timelineProject: TimelineProject; songs: SongItem[]; name: string } | null> {
        try {
            const raw = localStorage.getItem(`unweave_project_${id}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    timelineProject: parsed.timelineProject,
                    songs: parsed.songs || [],
                    name: parsed.name || 'Untitled Project',
                };
            }
        } catch (err) {
            console.error(`[ProjectStorage] Error loading project ${id}:`, err);
        }
        return null;
    },

    /**
     * Delete a saved custom project
     */
    async deleteCustomProject(id: string): Promise<boolean> {
        try {
            localStorage.removeItem(`unweave_project_${id}`);
            const index = await this.listCustomProjects();
            const filtered = index.filter(p => p.id !== id);
            localStorage.setItem('unweave_saved_projects_index', JSON.stringify(filtered));
            return true;
        } catch (err) {
            console.warn(`[ProjectStorage] Error deleting project ${id}:`, err);
            return false;
        }
    },

    /**
     * Complete Fresh Start: wipes old test sessions, corrupted states, and autosaves
     */
    async resetAllAppState(): Promise<void> {
        await this.clearAutoSaveSession();
        localStorage.removeItem('unweave_timeline_project');
        localStorage.removeItem('unweave_song_library');
        localStorage.removeItem('unweave_song_projects');
        localStorage.removeItem('unweave_active_song_id');
        localStorage.removeItem('unweave_timeline_project_v1');
        localStorage.removeItem('unweave_saved_projects_index');
        localStorage.removeItem('unweave_autosave_meta');
        localStorage.removeItem('unweave_v1_active_song');
        localStorage.removeItem('unweave_saved_songs');
    },
};
