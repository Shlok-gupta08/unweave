export interface Stems {
    Vocals?: string;
    Drums?: string;
    Bass?: string;
    Guitar?: string;
    Piano?: string;
    Other?: string;
    [key: string]: string | undefined;
}

export interface SeparationJob {
    job_id: string;
    stems: Stems;
    message?: string;
    processing_time?: number;
    device_used?: string;
}

export interface JobStatus {
    status: 'queued' | 'uploading' | 'processing' | 'complete' | 'error' | 'cancelled';
    progress: number;
    eta_seconds: number | null;
    message: string;
    stems: Stems | null;
    processing_time: number | null;
    device_used: string;
}

export interface SongItem {
    id: string;
    name: string;
    fileSize: number;
    duration: number | null;
    uploadedAt: number;
    status: 'queued' | 'uploading' | 'processing' | 'complete' | 'error' | 'cancelled';
    progress: number;
    etaSeconds: number | null;
    passNumber: number;
    statusMessage: string;
    jobId: string | null;
    stems: Stems | null;
    stemBlobs?: Record<string, Blob>;
    deviceUsed?: string;
    processingTime?: number;
    originalFile?: File;
    errorMessage?: string;
}

export interface TimelineClip {
    id: string;
    trackId: string;
    stemName: string; // e.g. "Vocals", "Drums", etc.
    songId: string; // Reference to source song in SongLibrary
    songTitle: string;
    audioUrl: string;
    audioBlob?: Blob;
    startTime: number; // Timeline start time in seconds
    offset: number; // Start offset within the source audio buffer in seconds
    duration: number; // Playback duration in seconds on the timeline
    originalDuration: number; // Total duration of the raw audio file in seconds
    gain: number; // Clip volume multiplier (0.0 to 2.0, default 1.0)
    color: string; // Hex color for clip and waveform
    peaks?: number[]; // Pre-extracted waveform peaks
}

export interface TimelineTrack {
    id: string;
    name: string;
    color: string;
    volume: number; // Volume fader (0.0 to 1.5, default 1.0)
    pan: number; // Stereo pan (-1.0 to +1.0, default 0.0)
    isMuted: boolean;
    isSolo: boolean;
    eqLow: number; // Low Shelf EQ gain in dB (-12 to +12, default 0)
    eqMid: number; // Peaking Mid EQ gain in dB (-12 to +12, default 0)
    eqHigh: number; // High Shelf EQ gain in dB (-12 to +12, default 0)
}

export interface TimelineProject {
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    playheadTime: number; // Current playback position in seconds
    masterVolume: number; // Master fader (0.0 to 1.5, default 1.0)
    currentSongId?: string | null; // ID of the currently active song in timeline
    zoom: number; // Pixels per second (e.g. 50)
    duration: number; // Maximum timeline duration in seconds
    loopStart: number | null;
    loopEnd: number | null;
    isLooping: boolean;
    isSnappingEnabled: boolean;
    snapInterval: number; // in seconds (e.g. 0.5)
}

export type WorkspaceTab = 'separate' | 'editor' | 'mixer' | 'export';

export interface ExportOptions {
    target: 'master' | 'stems' | 'loop';
    format: 'wav' | 'mp3';
    bitrate: 128 | 192 | 320; // for MP3
    sampleRate: 44100 | 48000;
    normalize: boolean;
}

declare global {
    interface Window {
        electronAPI?: {
            isDesktop: boolean;
            platform: string;
            onMenuAction: (callback: (action: string, payload?: unknown) => void) => () => void;
            sendAction: (channel: string, data?: unknown) => void;
            invokeAction: (channel: string, data?: unknown) => Promise<unknown>;
        };
    }
}

