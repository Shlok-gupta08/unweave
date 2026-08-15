import { getOrFetchAudioBuffer } from '../utils/waveform';
import type { TimelineClip, TimelineTrack } from '../types';

interface TrackAudioNodes {
    input: GainNode;
    eqLow: BiquadFilterNode;
    eqMid: BiquadFilterNode;
    eqHigh: BiquadFilterNode;
    volumeGain: GainNode;
    panner: StereoPannerNode;
}

interface ActiveSourceInfo {
    source: AudioBufferSourceNode;
    clipGain: GainNode;
}

export class TimelineAudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private limiter: DynamicsCompressorNode | null = null;
    private analyser: AnalyserNode | null = null;
    private analyserData: Uint8Array<ArrayBuffer> | null = null;

    private trackNodes = new Map<string, TrackAudioNodes>();
    private activeSources = new Map<string, ActiveSourceInfo>();

    private isPlaying = false;
    private playbackStartTime = 0;
    private timelineStartOffset = 0;
    private animationFrameId: number | null = null;
    private onTimeUpdateCallback: ((time: number) => void) | null = null;
    private onEndedCallback: (() => void) | null = null;
    private totalDuration = 0;

    private masterVolume = 1.0;

    constructor() {
        // AudioContext initialized lazily on first user interaction
    }

    private ensureContext(): AudioContext {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new AudioContextClass();

            // Master Limiter
            this.limiter = this.ctx.createDynamicsCompressor();
            this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
            this.limiter.knee.setValueAtTime(6.0, this.ctx.currentTime);
            this.limiter.ratio.setValueAtTime(12.0, this.ctx.currentTime);
            this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.limiter.release.setValueAtTime(0.15, this.ctx.currentTime);

            // Master Gain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

            // Realtime Analyser for VU meters
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.analyserData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

            // Chain: limiter -> masterGain -> analyser -> destination
            this.limiter.connect(this.masterGain);
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        return this.ctx;
    }

    public getContext(): AudioContext {
        return this.ensureContext();
    }

    public syncTracks(tracks: TimelineTrack[]) {
        const ctx = this.ensureContext();
        const currentIds = new Set(tracks.map(t => t.id));

        // Clean up removed tracks
        for (const [id, nodes] of this.trackNodes.entries()) {
            if (!currentIds.has(id)) {
                nodes.panner.disconnect();
                this.trackNodes.delete(id);
            }
        }

        // Determine Solo mode
        const hasSolo = tracks.some(t => t.isSolo);

        // Add or update track nodes
        for (const track of tracks) {
            let nodes = this.trackNodes.get(track.id);
            if (!nodes) {
                const input = ctx.createGain();

                const eqLow = ctx.createBiquadFilter();
                eqLow.type = 'lowshelf';
                eqLow.frequency.setValueAtTime(80, ctx.currentTime);

                const eqMid = ctx.createBiquadFilter();
                eqMid.type = 'peaking';
                eqMid.frequency.setValueAtTime(1000, ctx.currentTime);
                eqMid.Q.setValueAtTime(1.0, ctx.currentTime);

                const eqHigh = ctx.createBiquadFilter();
                eqHigh.type = 'highshelf';
                eqHigh.frequency.setValueAtTime(10000, ctx.currentTime);

                const volumeGain = ctx.createGain();
                const panner = ctx.createStereoPanner();

                // Chain: input -> eqLow -> eqMid -> eqHigh -> volumeGain -> panner -> limiter
                input.connect(eqLow);
                eqLow.connect(eqMid);
                eqMid.connect(eqHigh);
                eqHigh.connect(volumeGain);
                volumeGain.connect(panner);
                if (this.limiter) {
                    panner.connect(this.limiter);
                }

                nodes = { input, eqLow, eqMid, eqHigh, volumeGain, panner };
                this.trackNodes.set(track.id, nodes);
            }

            // Apply Track Parameters
            const isAudible = hasSolo ? track.isSolo : !track.isMuted;
            const targetVolume = isAudible ? (track.volume ?? 1.0) : 0.0;

            nodes.volumeGain.gain.setValueAtTime(targetVolume, ctx.currentTime);
            nodes.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), ctx.currentTime);
            nodes.eqLow.gain.setValueAtTime(track.eqLow || 0, ctx.currentTime);
            nodes.eqMid.gain.setValueAtTime(track.eqMid || 0, ctx.currentTime);
            nodes.eqHigh.gain.setValueAtTime(track.eqHigh || 0, ctx.currentTime);
        }
    }

    public async play(
        fromTimelineTime: number,
        clips: TimelineClip[],
        tracks: TimelineTrack[],
        totalDuration: number,
        onTimeUpdate?: (time: number) => void,
        onEnded?: () => void
    ) {
        const ctx = this.ensureContext();
        this.stopSources();

        this.syncTracks(tracks);
        this.totalDuration = totalDuration;
        this.timelineStartOffset = Math.max(0, fromTimelineTime);
        this.playbackStartTime = ctx.currentTime;
        this.isPlaying = true;
        this.onTimeUpdateCallback = onTimeUpdate || null;
        this.onEndedCallback = onEnded || null;

        // Determine active audible tracks
        const hasSolo = tracks.some(t => t.isSolo);
        const activeTrackIds = new Set(
            tracks.filter(t => hasSolo ? t.isSolo : !t.isMuted).map(t => t.id)
        );

        // Schedule audible clips
        for (const clip of clips) {
            if (!activeTrackIds.has(clip.trackId)) continue;

            const clipEnd = clip.startTime + clip.duration;
            if (clipEnd <= this.timelineStartOffset) continue;

            const trackNodes = this.trackNodes.get(clip.trackId);
            if (!trackNodes) continue;

            try {
                const buffer = await getOrFetchAudioBuffer(clip.audioUrl, ctx);
                if (!this.isPlaying) return; // If stopped during async fetch

                const source = ctx.createBufferSource();
                source.buffer = buffer;

                const clipGain = ctx.createGain();
                clipGain.gain.setValueAtTime(clip.gain ?? 1.0, ctx.currentTime);

                source.connect(clipGain);
                clipGain.connect(trackNodes.input);

                // Calculate scheduling
                const scheduleDelay = Math.max(0, clip.startTime - this.timelineStartOffset);
                const whenToStart = this.playbackStartTime + scheduleDelay;
                const offsetWithinSource = clip.offset + Math.max(0, this.timelineStartOffset - clip.startTime);
                const playDuration = Math.max(0, clipEnd - Math.max(clip.startTime, this.timelineStartOffset));

                if (playDuration > 0) {
                    source.start(whenToStart, Math.max(0, offsetWithinSource), playDuration);
                    this.activeSources.set(clip.id, { source, clipGain });
                }
            } catch (err) {
                console.error(`AudioEngine: Failed to load clip ${clip.id}`, err);
            }
        }

        this.startClock();
    }

    public pause(): number {
        const currentTime = this.getCurrentTime();
        this.stopSources();
        this.isPlaying = false;
        this.stopClock();
        return currentTime;
    }

    public stop(): number {
        this.stopSources();
        this.isPlaying = false;
        this.stopClock();
        this.timelineStartOffset = 0;
        return 0;
    }

    public seek(
        newTime: number,
        clips: TimelineClip[],
        tracks: TimelineTrack[],
        totalDuration: number
    ) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.play(newTime, clips, tracks, totalDuration, this.onTimeUpdateCallback || undefined, this.onEndedCallback || undefined);
        } else {
            this.timelineStartOffset = newTime;
        }
    }

    public getCurrentTime(): number {
        if (!this.isPlaying || !this.ctx) {
            return this.timelineStartOffset;
        }
        const elapsed = this.ctx.currentTime - this.playbackStartTime;
        return this.timelineStartOffset + elapsed;
    }

    public getIsPlaying(): boolean {
        return this.isPlaying;
    }

    public setMasterVolume(vol: number) {
        this.masterVolume = Math.max(0, Math.min(2, vol));
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
    }

    public getMasterVolume(): number {
        return this.masterVolume;
    }

    public getVULevel(): { left: number; right: number; peak: number } {
        if (!this.analyser || !this.analyserData || !this.isPlaying) {
            return { left: 0, right: 0, peak: 0 };
        }

        this.analyser.getByteFrequencyData(this.analyserData);
        let sum = 0;
        let peak = 0;
        const count = this.analyserData.length;

        for (let i = 0; i < count; i++) {
            const val = this.analyserData[i] / 255;
            sum += val;
            if (val > peak) peak = val;
        }

        const avg = sum / count;
        // Dynamic, responsive stereo peak/RMS metering
        const left = Math.min(1.0, avg * 2.2 + peak * 0.15);
        const right = Math.min(1.0, avg * 2.1 + peak * 0.2);
        return {
            left,
            right,
            peak: Math.min(1.0, peak),
        };
    }

    private stopSources() {
        for (const [, info] of this.activeSources.entries()) {
            try {
                info.source.stop();
                info.source.disconnect();
                info.clipGain.disconnect();
            } catch {
                // Ignore if already stopped
            }
        }
        this.activeSources.clear();
    }

    private startClock() {
        this.stopClock();

        const tick = () => {
            if (!this.isPlaying) return;

            const time = this.getCurrentTime();
            this.onTimeUpdateCallback?.(time);

            if (this.totalDuration > 0 && time >= this.totalDuration) {
                this.pause();
                this.onEndedCallback?.();
                return;
            }

            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }

    private stopClock() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}

// Export singleton audio engine instance
export const audioEngine = new TimelineAudioEngine();
