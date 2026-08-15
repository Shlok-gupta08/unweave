import { resolveStemUrl } from './api';

/**
 * Waveform extraction and Canvas rendering utilities for DAW Timeline clips.
 */

// In-memory cache for decoded AudioBuffers and pre-extracted peaks
const audioBufferCache = new Map<string, AudioBuffer>();
const peaksCache = new Map<string, number[]>();

/**
 * Extracts a normalized peak array (values 0.0 to 1.0) from an AudioBuffer.
 * Precomputing 800–1200 peaks gives 60fps canvas rendering without touching large raw PCM data.
 */
export function extractPeaks(audioBuffer: AudioBuffer, numPeaks = 1000): number[] {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const step = Math.max(1, Math.floor(length / numPeaks));
    const peaks: number[] = new Array(numPeaks);

    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
        channelData.push(audioBuffer.getChannelData(c));
    }

    for (let i = 0; i < numPeaks; i++) {
        const start = i * step;
        const end = Math.min(start + step, length);
        let max = 0;

        for (let c = 0; c < numChannels; c++) {
            const data = channelData[c];
            for (let j = start; j < end; j++) {
                const val = Math.abs(data[j]);
                if (val > max) max = val;
            }
        }

        // Clamp to 1.0
        peaks[i] = Math.min(1.0, max);
    }

    return peaks;
}

/**
 * Fetches and decodes an audio file into an AudioBuffer, utilizing the memory cache.
 */
export async function getOrFetchAudioBuffer(
    url: string,
    audioContext?: AudioContext | OfflineAudioContext
): Promise<AudioBuffer> {
    if (audioBufferCache.has(url)) {
        return audioBufferCache.get(url)!;
    }

    const resolvedUrl = resolveStemUrl(url);
    const ctx = audioContext || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const response = await fetch(resolvedUrl);
    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

    audioBufferCache.set(url, decodedBuffer);
    return decodedBuffer;
}

/**
 * Gets or computes the normalized peak array for an audio URL.
 */
export async function getOrComputePeaks(url: string, audioContext?: AudioContext): Promise<number[]> {
    if (peaksCache.has(url)) {
        return peaksCache.get(url)!;
    }

    const buffer = await getOrFetchAudioBuffer(url, audioContext);
    const peaks = extractPeaks(buffer);
    peaksCache.set(url, peaks);
    return peaks;
}

/**
 * Draws high-performance waveform bars on an HTML Canvas.
 * Accounts for trim range (startRatio to endRatio) and clip gain.
 */
export function drawWaveformToCanvas(
    canvas: HTMLCanvasElement,
    peaks: number[],
    color: string,
    options?: {
        startRatio?: number; // 0.0 to 1.0
        endRatio?: number;   // 0.0 to 1.0
        gain?: number;       // e.g. 1.0
        barWidth?: number;
        barGap?: number;
    }
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) {
        // Draw empty center line
        ctx.strokeStyle = `${color}40`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        return;
    }

    const startRatio = Math.max(0, Math.min(1, options?.startRatio ?? 0));
    const endRatio = Math.max(startRatio, Math.min(1, options?.endRatio ?? 1));
    const gain = Math.max(0, options?.gain ?? 1.0);

    const barWidth = options?.barWidth ?? 2;
    const barGap = options?.barGap ?? 1;
    const totalBars = Math.floor(width / (barWidth + barGap));

    // Slice or sample the peak array based on the trim window
    const startIndex = Math.floor(startRatio * (peaks.length - 1));
    const endIndex = Math.floor(endRatio * (peaks.length - 1));
    const peakRange = Math.max(1, endIndex - startIndex);

    ctx.fillStyle = color;

    for (let i = 0; i < totalBars; i++) {
        const peakIdx = Math.min(peaks.length - 1, startIndex + Math.floor((i / totalBars) * peakRange));
        const rawPeak = peaks[peakIdx] || 0;
        const amplitude = Math.min(1.0, rawPeak * gain);

        // Calculate bar height with a minimum visibility threshold
        const barHeight = Math.max(2, amplitude * (height * 0.88));
        const x = i * (barWidth + barGap);
        const y = centerY - barHeight / 2;

        ctx.fillRect(x, y, barWidth, barHeight);
    }
}
