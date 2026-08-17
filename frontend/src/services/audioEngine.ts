import { getOrFetchAudioBuffer } from '../utils/waveform';
import type { TimelineClip, TimelineTrack, GlobalSpatialSettings } from '../types';

interface TrackAudioNodes {
    input: GainNode;
    // Standard 3-Band Parametric EQ
    eqLow: BiquadFilterNode;
    eqMid: BiquadFilterNode;
    eqHigh: BiquadFilterNode;
    volumeGain: GainNode;
    // Stereo Mode Panner
    stereoPanner: StereoPannerNode;
    // 8D Mode Preprocessing Filters & Compressors
    vocalHighPass: BiquadFilterNode;
    vocalPresence: BiquadFilterNode;
    instrumentClarity: BiquadFilterNode;
    bassCompressor: DynamicsCompressorNode;
    // 8D HRTF Panner
    spatialPanner: PannerNode;
    reverbSendGain: GainNode;
    // Routing gains
    stereoBusGain: GainNode;
    spatialBusGain: GainNode;
}

interface ActiveSourceInfo {
    source: AudioBufferSourceNode;
    clipGain: GainNode;
}

/**
 * Creates a synthetic stereo impulse response for binaural acoustic depth simulation.
 */
function createBinauralImpulseResponse(
    audioContext: BaseAudioContext,
    durationSeconds = 1.6,
    decay = 2.0
): AudioBuffer {
    const sampleRate = audioContext.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    const crossDelaySamples = Math.floor(sampleRate * 0.0011);

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-decay * t);
        const early = t < 0.04 ? Math.sin(t * 1500) * 0.25 : 0;
        const noiseL = (Math.random() * 2 - 1) + early;
        const noiseR = (Math.random() * 2 - 1) + early;

        left[i] = noiseL * env;
        if (i >= crossDelaySamples) {
            right[i] = (noiseR * 0.85 + left[i - crossDelaySamples] * 0.35) * env;
        } else {
            right[i] = noiseR * env;
        }
    }
    return impulse;
}

export class TimelineAudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private limiter: DynamicsCompressorNode | null = null;
    private analyser: AnalyserNode | null = null;
    private analyserData: Uint8Array<ArrayBuffer> | null = null;

    // Master Reverb Convolver for 3D Binaural Depth
    private convolver: ConvolverNode | null = null;
    private reverbMasterGain: GainNode | null = null;
    private activeReverbPreset: string = 'studio';

    private trackNodes = new Map<string, TrackAudioNodes>();
    private activeSources = new Map<string, ActiveSourceInfo>();
    private cachedTracks: TimelineTrack[] = [];
    private cachedGlobalSettings: GlobalSpatialSettings | null = null;

    private isPlaying = false;
    private playbackStartTime = 0;
    private timelineStartOffset = 0;
    private animationFrameId: number | null = null;
    private onTimeUpdateCallback: ((time: number) => void) | null = null;
    private onEndedCallback: (() => void) | null = null;
    private totalDuration = 0;

    private masterVolume = 1.0;

    constructor() {
        // AudioContext initialized lazily on user action
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

            // Master Binaural Convolver & Reverb
            this.convolver = this.ctx.createConvolver();
            this.convolver.buffer = createBinauralImpulseResponse(this.ctx, 1.8, 1.1);

            this.reverbMasterGain = this.ctx.createGain();
            this.reverbMasterGain.gain.setValueAtTime(0.20, this.ctx.currentTime);

            this.convolver.connect(this.reverbMasterGain);
            this.reverbMasterGain.connect(this.limiter);

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

    private updateReverbBuffer(preset: string) {
        if (!this.ctx || !this.convolver || preset === this.activeReverbPreset) return;
        this.activeReverbPreset = preset;

        if (preset === 'dry') {
            if (this.reverbMasterGain) {
                this.reverbMasterGain.gain.setValueAtTime(0, this.ctx.currentTime);
            }
            return;
        }

        const reverbDecay = preset === 'concert' ? 2.8 : preset === 'cathedral' ? 4.5 : preset === 'cosmic' ? 6.0 : 1.8;
        const impulse = createBinauralImpulseResponse(this.ctx, Math.min(3.5, reverbDecay * 0.8), 2.0 / reverbDecay);
        this.convolver.buffer = impulse;

        if (this.reverbMasterGain) {
            this.reverbMasterGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
        }
    }

    private playbackMode: 'stereo' | '8d' = 'stereo';

    public setPlaybackMode(mode: 'stereo' | '8d') {
        this.playbackMode = mode;
        if (this.ctx) {
            this.syncTracks(this.cachedTracks, this.cachedGlobalSettings);
        }
    }

    public getPlaybackMode(): 'stereo' | '8d' {
        return this.playbackMode;
    }

    public syncTracks(tracks: TimelineTrack[], globalSettings?: GlobalSpatialSettings | null) {
        const ctx = this.ensureContext();
        this.cachedTracks = tracks;
        if (globalSettings) {
            this.cachedGlobalSettings = globalSettings;
            if (globalSettings.reverbPreset) {
                this.updateReverbBuffer(globalSettings.reverbPreset);
            }
        }

        const currentIds = new Set(tracks.map(t => t.id));

        // Clean up removed tracks
        for (const [id, nodes] of this.trackNodes.entries()) {
            if (!currentIds.has(id)) {
                nodes.stereoPanner.disconnect();
                nodes.spatialPanner.disconnect();
                nodes.reverbSendGain.disconnect();
                this.trackNodes.delete(id);
            }
        }

        // Determine Solo mode
        const hasSolo = tracks.some(t => t.isSolo);
        const is8DActive = this.playbackMode === '8d' && !(globalSettings?.is8DBypassed);

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

                // 1. Clean Stereo Route
                const stereoBusGain = ctx.createGain();
                const stereoPanner = ctx.createStereoPanner();

                // 2. 8D Spatial Route with Inherent Acoustic Sculpting
                const spatialBusGain = ctx.createGain();

                const vocalHighPass = ctx.createBiquadFilter();
                vocalHighPass.type = 'highpass';
                vocalHighPass.frequency.setValueAtTime(95, ctx.currentTime);
                vocalHighPass.Q.setValueAtTime(0.7, ctx.currentTime);

                const vocalPresence = ctx.createBiquadFilter();
                vocalPresence.type = 'peaking';
                vocalPresence.frequency.setValueAtTime(3200, ctx.currentTime);
                vocalPresence.Q.setValueAtTime(1.0, ctx.currentTime);
                vocalPresence.gain.setValueAtTime(1.8, ctx.currentTime);

                const instrumentClarity = ctx.createBiquadFilter();
                instrumentClarity.type = 'peaking';
                instrumentClarity.frequency.setValueAtTime(3800, ctx.currentTime);
                instrumentClarity.Q.setValueAtTime(1.0, ctx.currentTime);
                instrumentClarity.gain.setValueAtTime(1.8, ctx.currentTime);

                const bassCompressor = ctx.createDynamicsCompressor();
                bassCompressor.threshold.setValueAtTime(-8.0, ctx.currentTime);
                bassCompressor.knee.setValueAtTime(6.0, ctx.currentTime);
                bassCompressor.ratio.setValueAtTime(2.5, ctx.currentTime);
                bassCompressor.attack.setValueAtTime(0.015, ctx.currentTime);
                bassCompressor.release.setValueAtTime(0.12, ctx.currentTime);

                // High-fidelity HRTF 3D Panner Node
                const spatialPanner = ctx.createPanner();
                spatialPanner.panningModel = 'HRTF';
                spatialPanner.distanceModel = 'inverse';
                spatialPanner.refDistance = 1;
                spatialPanner.maxDistance = 10000;
                spatialPanner.rolloffFactor = 0.70;

                const reverbSendGain = ctx.createGain();
                reverbSendGain.gain.setValueAtTime(track.spatialSettings?.reverbWet ?? 0.12, ctx.currentTime);

                // Wire EQ chain: input -> eqLow -> eqMid -> eqHigh -> volumeGain
                input.connect(eqLow);
                eqLow.connect(eqMid);
                eqMid.connect(eqHigh);
                eqHigh.connect(volumeGain);

                // Wire Stereo Route: volumeGain -> stereoBusGain -> stereoPanner -> limiter
                volumeGain.connect(stereoBusGain);
                stereoBusGain.connect(stereoPanner);
                if (this.limiter) {
                    stereoPanner.connect(this.limiter);
                }

                // Wire 8D Spatial Route with Stem-Specific Preprocessing Filters:
                volumeGain.connect(spatialBusGain);

                const trackNameLower = track.name.toLowerCase();
                if (trackNameLower.includes('vocal') || trackNameLower.includes('voice') || trackNameLower.includes('sing')) {
                    spatialBusGain.connect(vocalHighPass);
                    vocalHighPass.connect(vocalPresence);
                    vocalPresence.connect(spatialPanner);
                } else if (trackNameLower.includes('bass') || trackNameLower.includes('drum') || trackNameLower.includes('kick')) {
                    spatialBusGain.connect(bassCompressor);
                    bassCompressor.connect(spatialPanner);
                } else {
                    spatialBusGain.connect(instrumentClarity);
                    instrumentClarity.connect(spatialPanner);
                }

                if (this.limiter) {
                    spatialPanner.connect(this.limiter);
                }

                // Reverb send (only from 8D spatial bus)
                if (this.convolver) {
                    spatialBusGain.connect(reverbSendGain);
                    reverbSendGain.connect(this.convolver);
                }

                nodes = {
                    input,
                    eqLow,
                    eqMid,
                    eqHigh,
                    volumeGain,
                    stereoPanner,
                    vocalHighPass,
                    vocalPresence,
                    instrumentClarity,
                    bassCompressor,
                    spatialPanner,
                    reverbSendGain,
                    stereoBusGain,
                    spatialBusGain,
                };
                this.trackNodes.set(track.id, nodes);
            }

            // Apply Track Parameters
            const isAudible = hasSolo ? track.isSolo : !track.isMuted;
            const targetVolume = isAudible ? (track.volume ?? 1.0) : 0.0;

            nodes.volumeGain.gain.setValueAtTime(targetVolume, ctx.currentTime);
            nodes.eqLow.gain.setValueAtTime(track.eqLow || 0, ctx.currentTime);
            nodes.eqMid.gain.setValueAtTime(track.eqMid || 0, ctx.currentTime);
            nodes.eqHigh.gain.setValueAtTime(track.eqHigh || 0, ctx.currentTime);

            // Toggle Stereo vs 8D routes seamlessly
            if (is8DActive) {
                nodes.stereoBusGain.gain.setValueAtTime(0, ctx.currentTime);
                nodes.spatialBusGain.gain.setValueAtTime(1, ctx.currentTime);
                const reverbWet = track.spatialSettings?.reverbWet ?? 0.16;
                nodes.reverbSendGain.gain.setValueAtTime(reverbWet, ctx.currentTime);
            } else {
                nodes.stereoBusGain.gain.setValueAtTime(1, ctx.currentTime);
                nodes.spatialBusGain.gain.setValueAtTime(0, ctx.currentTime);
                nodes.reverbSendGain.gain.setValueAtTime(0, ctx.currentTime);
                nodes.stereoPanner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), ctx.currentTime);
            }
        }

        if (is8DActive) {
            this.updateSpatialPositions(this.getCurrentTime());
        }
    }

    /**
     * Real-time 8D Audio HRTF Trajectory Calculator
     * Modulates 360° soundstage coordinates on every playback frame (only in 8D mode)
     */
    public updateSpatialPositions(currentTime: number) {
        if (!this.ctx || this.playbackMode !== '8d') return;

        const globalSettings = this.cachedGlobalSettings;
        const isBypassed = globalSettings?.is8DBypassed ?? false;
        const masterSpeed = globalSettings?.masterSpeedMultiplier || 1.0;
        const masterSpread = globalSettings?.masterSpread || 1.0;

        for (const track of this.cachedTracks) {
            const nodes = this.trackNodes.get(track.id);
            if (!nodes) continue;

            const spatial = track.spatialSettings;

            if (isBypassed || !spatial || spatial.isCenterLocked || spatial.pattern === 'static-center' || spatial.radius < 0.1) {
                // Grounded Center
                nodes.spatialPanner.positionX.setValueAtTime(0, this.ctx.currentTime);
                nodes.spatialPanner.positionY.setValueAtTime(0, this.ctx.currentTime);
                nodes.spatialPanner.positionZ.setValueAtTime(-1, this.ctx.currentTime);
            } else {
                // Dynamic 360° 8D Orbit
                const effectiveSpeed = Math.max(1, (spatial.speedSeconds || 10) / masterSpeed);
                const direction = spatial.direction || 1;
                const theta = (currentTime / effectiveSpeed) * (2 * Math.PI) * direction;
                const r = (spatial.radius || 2.5) * masterSpread;

                let x = 0;
                let y = 0;
                let z = 0;

                if (spatial.pattern === 'front-ellipse') {
                    x = r * Math.sin(theta);
                    z = -(Math.abs(r * Math.cos(theta) * 0.7) + 0.5);
                    y = (spatial.elevation || 0.2) * Math.sin(theta * 0.5);
                } else {
                    x = r * Math.sin(theta);
                    z = -r * Math.cos(theta);
                    y = (spatial.elevation || 0.2) * Math.sin(theta * 2);
                }

                // Update HRTF spatial coordinates smoothly
                nodes.spatialPanner.positionX.setValueAtTime(x, this.ctx.currentTime);
                nodes.spatialPanner.positionY.setValueAtTime(y, this.ctx.currentTime);
                nodes.spatialPanner.positionZ.setValueAtTime(z, this.ctx.currentTime);
            }
        }
    }

    public async play(
        fromTimelineTime: number,
        clips: TimelineClip[],
        tracks: TimelineTrack[],
        totalDuration: number,
        onTimeUpdate?: (time: number) => void,
        onEnded?: () => void,
        globalSettings?: GlobalSpatialSettings
    ) {
        const ctx = this.ensureContext();
        this.stopSources();

        this.syncTracks(tracks, globalSettings);
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
                if (!this.isPlaying) return;

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
        totalDuration: number,
        globalSettings?: GlobalSpatialSettings
    ) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.play(
                newTime,
                clips,
                tracks,
                totalDuration,
                this.onTimeUpdateCallback || undefined,
                this.onEndedCallback || undefined,
                globalSettings
            );
        } else {
            this.timelineStartOffset = newTime;
            this.updateSpatialPositions(newTime);
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
            this.updateSpatialPositions(time);
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
