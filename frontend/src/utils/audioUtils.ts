import { Mp3Encoder } from '@breezystack/lamejs';
import { audioBufferToWavBlob } from './wavEncoder';
import { getOrFetchAudioBuffer } from './waveform';
import type { TimelineProject, TimelineTrack } from '../types';

/**
 * Downloads audio data from a given url (such as /stems/...) into an AudioBuffer.
 */
export async function fetchAudioBuffer(url: string, audioContext?: AudioContext | OfflineAudioContext): Promise<AudioBuffer> {
    return getOrFetchAudioBuffer(url, audioContext);
}

/**
 * Merges multiple audio URLs asynchronously using an OfflineAudioContext.
 * Returns an AudioBuffer containing the mixed audio.
 */
export async function mergeStemsToBuffer(urls: string[]): Promise<AudioBuffer> {
    const tempContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Decode all buffers
    const buffers = await Promise.all(urls.map(url => fetchAudioBuffer(url, tempContext)));
    tempContext.close();

    if (buffers.length === 0) {
        throw new Error("No buffers to merge.");
    }

    let maxLen = 0;
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = 2;

    for (const b of buffers) {
        if (b.length > maxLen) {
            maxLen = b.length;
        }
    }

    const offlineContext = new OfflineAudioContext(numberOfChannels, maxLen, sampleRate);

    for (const buffer of buffers) {
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(0);
    }

    return await offlineContext.startRendering();
}

/**
 * Normalizes an AudioBuffer to peak amplitude (0 dBFS).
 */
export function normalizeAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    let maxPeak = 0;

    for (let c = 0; c < numChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            const val = Math.abs(data[i]);
            if (val > maxPeak) maxPeak = val;
        }
    }

    if (maxPeak === 0 || maxPeak >= 0.999) return buffer;

    const multiplier = 0.99 / maxPeak;
    for (let c = 0; c < numChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            data[i] = data[i] * multiplier;
        }
    }

    return buffer;
}

/**
 * Renders the entire multi-track TimelineProject into a single AudioBuffer using OfflineAudioContext.
 * Respects:
 * - Clip start times & trim offsets
 * - Clip duration & clip gain
 * - Track mute & solo logic
 * - Track volume faders & stereo pan
 * - Track 3-Band Parametric EQ (Low shelf, Mid peaking, High shelf)
 */
export async function renderTimelineMixdown(
    project: TimelineProject,
    options?: {
        rangeStart?: number;
        rangeEnd?: number;
        sampleRate?: number;
        normalize?: boolean;
    }
): Promise<AudioBuffer> {
    const { tracks, clips } = project;

    if (clips.length === 0) {
        throw new Error("No clips on timeline to export.");
    }

    // Determine solo tracks
    const hasSolo = tracks.some(t => t.isSolo);
    const activeTracks = new Map<string, TimelineTrack>();
    for (const t of tracks) {
        if (hasSolo ? t.isSolo : !t.isMuted) {
            activeTracks.set(t.id, t);
        }
    }

    // Filter clips belonging to active tracks
    const activeClips = clips.filter(c => activeTracks.has(c.trackId));
    if (activeClips.length === 0) {
        throw new Error("All active tracks are muted.");
    }

    // Calculate total rendered duration
    const maxEnd = Math.max(...activeClips.map(c => c.startTime + c.duration));
    const rangeStart = Math.max(0, options?.rangeStart ?? 0);
    const rangeEnd = Math.min(maxEnd, options?.rangeEnd ?? maxEnd);
    const renderDuration = Math.max(0.1, rangeEnd - rangeStart);

    const sampleRate = options?.sampleRate || 44100;
    const totalSamples = Math.ceil(renderDuration * sampleRate);
    const offlineContext = new OfflineAudioContext(2, totalSamples, sampleRate);

    // Fetch and cache all clip buffers
    const bufferMap = new Map<string, AudioBuffer>();
    for (const clip of activeClips) {
        if (!bufferMap.has(clip.audioUrl)) {
            const buf = await fetchAudioBuffer(clip.audioUrl, offlineContext);
            bufferMap.set(clip.audioUrl, buf);
        }
    }

    // Set up master bus limiter
    const compressor = offlineContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-1.0, 0);
    compressor.knee.setValueAtTime(6.0, 0);
    compressor.ratio.setValueAtTime(12.0, 0);
    compressor.attack.setValueAtTime(0.003, 0);
    compressor.release.setValueAtTime(0.15, 0);
    compressor.connect(offlineContext.destination);

    // Set up audio sub-graph for each active track
    const trackNodes = new Map<string, {
        input: GainNode;
        panner: StereoPannerNode;
        eqLow: BiquadFilterNode;
        eqMid: BiquadFilterNode;
        eqHigh: BiquadFilterNode;
        volGain: GainNode;
    }>();

    for (const [trackId, track] of activeTracks.entries()) {
        const input = offlineContext.createGain();

        // 3-Band Parametric EQ
        const eqLow = offlineContext.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.setValueAtTime(80, 0);
        eqLow.gain.setValueAtTime(track.eqLow || 0, 0);

        const eqMid = offlineContext.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.setValueAtTime(1000, 0);
        eqMid.Q.setValueAtTime(1.0, 0);
        eqMid.gain.setValueAtTime(track.eqMid || 0, 0);

        const eqHigh = offlineContext.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.setValueAtTime(10000, 0);
        eqHigh.gain.setValueAtTime(track.eqHigh || 0, 0);

        // Volume Gain
        const volGain = offlineContext.createGain();
        volGain.gain.setValueAtTime(track.volume ?? 1.0, 0);

        // Stereo Panner
        const panner = offlineContext.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), 0);

        // Chain nodes: input -> eqLow -> eqMid -> eqHigh -> volGain -> panner -> master
        input.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqHigh);
        eqHigh.connect(volGain);
        volGain.connect(panner);
        panner.connect(compressor);

        trackNodes.set(trackId, { input, panner, eqLow, eqMid, eqHigh, volGain });
    }

    // Schedule all active clips
    for (const clip of activeClips) {
        const audioBuffer = bufferMap.get(clip.audioUrl);
        if (!audioBuffer) continue;

        const clipStartOnTimeline = clip.startTime;
        const clipEndOnTimeline = clip.startTime + clip.duration;

        // Skip if outside export range
        if (clipEndOnTimeline <= rangeStart || clipStartOnTimeline >= rangeEnd) {
            continue;
        }

        const nodes = trackNodes.get(clip.trackId);
        if (!nodes) continue;

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // Clip-level Gain Node
        const clipGain = offlineContext.createGain();
        clipGain.gain.setValueAtTime(clip.gain ?? 1.0, 0);
        source.connect(clipGain);
        clipGain.connect(nodes.input);

        // Calculate schedule timing relative to export range
        const effectiveTimelineStart = Math.max(clipStartOnTimeline, rangeStart);
        const scheduleTime = effectiveTimelineStart - rangeStart;
        const trimOffset = clip.offset + (effectiveTimelineStart - clipStartOnTimeline);
        const playDuration = Math.min(clipEndOnTimeline, rangeEnd) - effectiveTimelineStart;

        if (playDuration > 0) {
            source.start(scheduleTime, Math.max(0, trimOffset), playDuration);
        }
    }

    const renderedBuffer = await offlineContext.startRendering();

    if (options?.normalize) {
        return normalizeAudioBuffer(renderedBuffer);
    }

    return renderedBuffer;
}

/**
 * Converts an AudioBuffer into an MP3 Blob using Mp3Encoder.
 */
export async function audioBufferToMP3Blob(buffer: AudioBuffer, kbps = 192): Promise<Blob> {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

    const leftFloat = buffer.getChannelData(0);
    const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : undefined;

    const sampleBlockSize = 1152;
    const mp3Data: Uint8Array[] = [];

    const leftInt16 = new Int16Array(leftFloat.length);
    for (let i = 0; i < leftFloat.length; i++) {
        const s = Math.max(-1, Math.min(1, leftFloat[i]));
        leftInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    let rightInt16: Int16Array | undefined = undefined;
    if (rightFloat) {
        rightInt16 = new Int16Array(rightFloat.length);
        for (let i = 0; i < rightFloat.length; i++) {
            const s = Math.max(-1, Math.min(1, rightFloat[i]));
            rightInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
    }

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
        let mp3buf: Int8Array | Uint8Array;
        if (numChannels === 2 && rightInt16) {
            const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }

        if (mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf));
        }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
    }

    return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mpeg' });
}

export { audioBufferToWavBlob };
