import { fetchAudioBuffer, normalizeAudioBuffer } from './audioUtils';
import type { TimelineProject, TimelineTrack } from '../types';

export type SpatialCategory = 'center-anchor' | 'vocal-orbit' | 'instrument-orbit' | 'ambient-orbit';

export interface LayerSpatialProfile {
    category: SpatialCategory;
    description: string;
    orbitSpeedMultiplier: number;
    radius: number;
    elevation: number;
    direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
    reverbWet: number;
}

export interface Spatial8DOptions {
    rangeStart?: number;
    rangeEnd?: number;
    sampleRate?: number;
    normalize?: boolean;
    rotationPeriodSeconds?: number; // Base speed: e.g. 10s per revolution
    reverbPreset?: 'studio' | 'concert' | 'cathedral' | 'cosmic' | 'dry';
    groundLowEnd?: boolean; // Keep Bass / Drums locked in center
}

/**
 * Smartly classifies a track/clip into a spatial category based on its name and stem metadata.
 */
export function classifyTrackSpatialProfile(
    trackName: string,
    stemName?: string,
    groundLowEnd = true
): LayerSpatialProfile {
    const combined = `${trackName} ${stemName || ''}`.toLowerCase();

    // 1. Low-End / Rhythm (Bass, Kick, Drums, 808, Sub, Percussion)
    if (
        combined.includes('bass') ||
        combined.includes('sub') ||
        combined.includes('808') ||
        combined.includes('kick') ||
        combined.includes('drum') ||
        combined.includes('beat') ||
        combined.includes('snare') ||
        combined.includes('percussion')
    ) {
        if (groundLowEnd) {
            return {
                category: 'center-anchor',
                description: 'Center Grounded (Dynamic Low-End Leveler)',
                orbitSpeedMultiplier: 0,
                radius: 0,
                elevation: 0,
                direction: 1,
                reverbWet: 0.03, // Minimal reverb to keep transient punch tight
            };
        }
    }

    // 2. Vocals / Speech / Acapella
    if (
        combined.includes('vocal') ||
        combined.includes('voice') ||
        combined.includes('acapella') ||
        combined.includes('speech') ||
        combined.includes('lead voc') ||
        combined.includes('sing')
    ) {
        return {
            category: 'vocal-orbit',
            description: 'Front-Lateral Vocal Orbit (Lush 360° surround reflection)',
            orbitSpeedMultiplier: 0.85, // Slower, smooth rotation
            radius: 2.0, // Natural vocal intimacy
            elevation: 0.30, // Eye/ear level soundstage
            direction: 1,
            reverbWet: 0.16, // Rich binaural surround reflections on opposite ear
        };
    }

    // 3. Harmonic Instruments (Guitar, Piano, Keys, Synth, Strings, Brass, Lead)
    if (
        combined.includes('guitar') ||
        combined.includes('piano') ||
        combined.includes('key') ||
        combined.includes('synth') ||
        combined.includes('string') ||
        combined.includes('brass') ||
        combined.includes('organ') ||
        combined.includes('acoustic') ||
        combined.includes('electric') ||
        combined.includes('lead') ||
        combined.includes('solo') ||
        combined.includes('melody')
    ) {
        return {
            category: 'instrument-orbit',
            description: 'Wide 360° Counter-Rotation (Expansive soundstage)',
            orbitSpeedMultiplier: 1.15, // Counter-rotating at complementary speed
            radius: 3.2,
            elevation: 0.15,
            direction: -1,
            reverbWet: 0.16, // Spacious 3D surround acoustic dispersion
        };
    }

    // 4. Other / Ambience / FX / Backing Layers
    return {
        category: 'ambient-orbit',
        description: 'Deep Ambient Sphere (360° immersive diffusion)',
        orbitSpeedMultiplier: 0.65, // Slow, atmospheric orbit
        radius: 4.0,
        elevation: -0.10,
        direction: 1,
        reverbWet: 0.14,
    };
}

/**
 * Creates a synthetic stereo impulse response for binaural acoustic depth simulation
 * with cross-ear reflections for a true 360° surround sensation.
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

    // Inter-aural cross delay (~1.1ms for acoustic head shadow & wall bounce)
    const crossDelaySamples = Math.floor(sampleRate * 0.0011);

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-decay * t);

        // Early reflection burst + diffuse tail
        const early = t < 0.04 ? Math.sin(t * 1500) * 0.25 : 0;
        const noiseL = (Math.random() * 2 - 1) + early;
        const noiseR = (Math.random() * 2 - 1) + early;

        left[i] = noiseL * env;

        // Cross-channel acoustic reflection spill creates realistic opposite-ear surround effect
        if (i >= crossDelaySamples) {
            right[i] = (noiseR * 0.85 + left[i - crossDelaySamples] * 0.35) * env;
        } else {
            right[i] = noiseR * env;
        }
    }

    return impulse;
}

/**
 * Renders the entire multi-track TimelineProject with true Stem-Driven 8D Spatial Audio.
 */
export async function render8DSpatialMixdown(
    project: TimelineProject,
    options?: Spatial8DOptions,
    onProgress?: (percent: number, status: string) => void
): Promise<AudioBuffer> {
    const { tracks, clips } = project;

    if (clips.length === 0) {
        throw new Error('No clips on timeline to export.');
    }

    onProgress?.(10, 'Analyzing track stem acoustics & profiles...');

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
        throw new Error('All active tracks are muted.');
    }

    // Calculate duration
    const maxEnd = Math.max(...activeClips.map(c => c.startTime + c.duration));
    const rangeStart = Math.max(0, options?.rangeStart ?? 0);
    const rangeEnd = Math.min(maxEnd, options?.rangeEnd ?? maxEnd);
    const renderDuration = Math.max(0.1, rangeEnd - rangeStart);

    const sampleRate = options?.sampleRate || 48000;
    const totalSamples = Math.ceil(renderDuration * sampleRate);
    const offlineContext = new OfflineAudioContext(2, totalSamples, sampleRate);

    onProgress?.(25, 'Loading audio buffers & building 3D spatial graph...');

    // Fetch and cache all clip buffers
    const bufferMap = new Map<string, AudioBuffer>();
    for (const clip of activeClips) {
        if (!bufferMap.has(clip.audioUrl)) {
            const buf = await fetchAudioBuffer(clip.audioUrl, offlineContext);
            bufferMap.set(clip.audioUrl, buf);
        }
    }

    onProgress?.(45, 'Synthesizing binaural surround impulse response...');

    // Master Bus Limiter / Compressor
    const compressor = offlineContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-1.0, 0);
    compressor.knee.setValueAtTime(4.0, 0);
    compressor.ratio.setValueAtTime(6.0, 0);
    compressor.attack.setValueAtTime(0.004, 0);
    compressor.release.setValueAtTime(0.15, 0);
    compressor.connect(offlineContext.destination);

    // Binaural Convolution Reverb Node
    let convolver: ConvolverNode | null = null;
    let reverbWetGain: GainNode | null = null;

    if (options?.reverbPreset !== 'dry') {
        const reverbPreset = options?.reverbPreset || 'studio';
        const reverbDecay = reverbPreset === 'concert' ? 2.8 : reverbPreset === 'cathedral' ? 4.5 : reverbPreset === 'cosmic' ? 6.0 : 1.8;
        const impulseBuffer = createBinauralImpulseResponse(offlineContext, Math.min(4.0, reverbDecay * 0.8), 2.0 / reverbDecay);

        convolver = offlineContext.createConvolver();
        convolver.buffer = impulseBuffer;

        reverbWetGain = offlineContext.createGain();
        reverbWetGain.gain.setValueAtTime(0.18, 0);
        convolver.connect(reverbWetGain);
        reverbWetGain.connect(compressor);
    }

    onProgress?.(60, 'Calculating 360° HRTF orbital trajectories for each stem...');

    const basePeriod = options?.rotationPeriodSeconds || 10.0;
    const groundLowEnd = options?.groundLowEnd ?? true;

    // Track subgraphs with HRTF Panner Nodes
    interface TrackSpatialNodeGroup {
        input: GainNode;
        panner: PannerNode;
        eqLow: BiquadFilterNode;
        eqMid: BiquadFilterNode;
        eqHigh: BiquadFilterNode;
        volGain: GainNode;
        profile: LayerSpatialProfile;
    }

    const trackNodes = new Map<string, TrackSpatialNodeGroup>();

    // Calculate curve points for position automation (25 points per second)
    const curvePointsCount = Math.max(50, Math.ceil(renderDuration * 25));

    for (const [trackId, track] of activeTracks.entries()) {
        const input = offlineContext.createGain();

        // Classify track
        const trackClipsForThis = activeClips.filter(c => c.trackId === trackId);
        const stemName = trackClipsForThis[0]?.stemName || '';
        const profile = classifyTrackSpatialProfile(track.name, stemName, groundLowEnd);

        const isManual = project.globalSpatialSettings?.isManualMode ?? false;
        const customSpatial = track.spatialSettings;

        // 8D Audio Stem-Aware Mix Balancing & Acoustic Sculpting
        let targetVolume = isManual
            ? (customSpatial?.intensity ?? 1.0)
            : (track.volume ?? 1.0);
        let effectiveEqLow = track.eqLow || 0;
        let effectiveEqMid = track.eqMid || 0;
        let effectiveEqHigh = track.eqHigh || 0;

        let vocalHighPassNode: BiquadFilterNode | null = null;
        let vocalPresenceNode: BiquadFilterNode | null = null;
        let instrumentClarityNode: BiquadFilterNode | null = null;
        let bassAdaptiveCompressor: DynamicsCompressorNode | null = null;

        if (!isManual) {
            // ── AI Auto-Guided Acoustic Sculpting ──
            if (profile.category === 'center-anchor') {
                targetVolume *= 0.95;

                bassAdaptiveCompressor = offlineContext.createDynamicsCompressor();
                bassAdaptiveCompressor.threshold.setValueAtTime(-8.0, 0);
                bassAdaptiveCompressor.knee.setValueAtTime(6.0, 0);
                bassAdaptiveCompressor.ratio.setValueAtTime(2.5, 0);
                bassAdaptiveCompressor.attack.setValueAtTime(0.015, 0);
                bassAdaptiveCompressor.release.setValueAtTime(0.12, 0);
            } else if (profile.category === 'vocal-orbit') {
                targetVolume *= 1.08;
                effectiveEqLow -= 1.5;
                effectiveEqMid += 0.8;
                effectiveEqHigh += 1.2;

                vocalHighPassNode = offlineContext.createBiquadFilter();
                vocalHighPassNode.type = 'highpass';
                vocalHighPassNode.frequency.setValueAtTime(95, 0);
                vocalHighPassNode.Q.setValueAtTime(0.7, 0);

                vocalPresenceNode = offlineContext.createBiquadFilter();
                vocalPresenceNode.type = 'peaking';
                vocalPresenceNode.frequency.setValueAtTime(3200, 0);
                vocalPresenceNode.Q.setValueAtTime(1.0, 0);
                vocalPresenceNode.gain.setValueAtTime(1.8, 0);
            } else if (profile.category === 'instrument-orbit') {
                targetVolume *= 1.10;
                effectiveEqHigh += 1.2;

                instrumentClarityNode = offlineContext.createBiquadFilter();
                instrumentClarityNode.type = 'peaking';
                instrumentClarityNode.frequency.setValueAtTime(3800, 0);
                instrumentClarityNode.Q.setValueAtTime(1.0, 0);
                instrumentClarityNode.gain.setValueAtTime(1.8, 0);
            }
        }

        // 3-Band Parametric EQ
        const eqLow = offlineContext.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.setValueAtTime(80, 0);
        eqLow.gain.setValueAtTime(effectiveEqLow, 0);

        const eqMid = offlineContext.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.setValueAtTime(1000, 0);
        eqMid.Q.setValueAtTime(1.0, 0);
        eqMid.gain.setValueAtTime(effectiveEqMid, 0);

        const eqHigh = offlineContext.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.setValueAtTime(10000, 0);
        eqHigh.gain.setValueAtTime(effectiveEqHigh, 0);

        // Volume Gain
        const volGain = offlineContext.createGain();
        volGain.gain.setValueAtTime(targetVolume, 0);

        // HRTF Panner Node
        const panner = offlineContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 0.70;

        let activeReverbWet = profile.reverbWet;

        if (isManual && customSpatial) {
            // ── Manual Custom Spatial Mode ──
            activeReverbWet = customSpatial.reverbWet ?? 0.12;

            if (customSpatial.isCenterLocked || customSpatial.pattern === 'static-center') {
                panner.positionX.setValueAtTime(0, 0);
                panner.positionY.setValueAtTime(0, 0);
                panner.positionZ.setValueAtTime(-1, 0);
            } else {
                const masterMul = project.globalSpatialSettings?.masterSpeedMultiplier || 1.0;
                const masterSpread = project.globalSpatialSettings?.masterSpread || 1.0;
                const period = Math.max(1.0, (customSpatial.speedSeconds || 10.0) / masterMul);
                const radius = (customSpatial.radius || 2.5) * masterSpread;
                const direction = customSpatial.direction || 1;

                const xCurve = new Float32Array(curvePointsCount);
                const yCurve = new Float32Array(curvePointsCount);
                const zCurve = new Float32Array(curvePointsCount);

                for (let i = 0; i < curvePointsCount; i++) {
                    const t = (i / (curvePointsCount - 1)) * renderDuration;
                    const theta = (direction * (2 * Math.PI * t)) / period;

                    if (customSpatial.pattern === 'front-ellipse') {
                        xCurve[i] = radius * Math.sin(theta);
                        zCurve[i] = -(Math.abs(radius * Math.cos(theta) * 0.7) + 0.5);
                        yCurve[i] = (customSpatial.elevation || 0.2) * Math.sin(theta * 0.5);
                    } else {
                        xCurve[i] = radius * Math.sin(theta);
                        zCurve[i] = -radius * Math.cos(theta);
                        yCurve[i] = (customSpatial.elevation || 0.2) * Math.sin(theta * 2);
                    }
                }

                panner.positionX.setValueCurveAtTime(xCurve, 0, renderDuration);
                panner.positionY.setValueCurveAtTime(yCurve, 0, renderDuration);
                panner.positionZ.setValueCurveAtTime(zCurve, 0, renderDuration);
            }
        } else {
            // ── AI Auto Guided 3D Spatial Trajectories ──
            if (profile.category === 'center-anchor') {
                panner.positionX.setValueAtTime(0, 0);
                panner.positionY.setValueAtTime(0, 0);
                panner.positionZ.setValueAtTime(-1, 0);
            } else {
                const period = Math.max(2.0, basePeriod * profile.orbitSpeedMultiplier);
                const xCurve = new Float32Array(curvePointsCount);
                const yCurve = new Float32Array(curvePointsCount);
                const zCurve = new Float32Array(curvePointsCount);

                for (let i = 0; i < curvePointsCount; i++) {
                    const t = (i / (curvePointsCount - 1)) * renderDuration;
                    const theta = (profile.direction * (2 * Math.PI * t)) / period;

                    if (profile.category === 'vocal-orbit') {
                        xCurve[i] = profile.radius * Math.sin(theta);
                        zCurve[i] = -Math.abs(profile.radius * Math.cos(theta) * 0.7) - 0.5;
                        yCurve[i] = profile.elevation * Math.sin(theta * 0.5);
                    } else {
                        xCurve[i] = profile.radius * Math.sin(theta);
                        zCurve[i] = -profile.radius * Math.cos(theta);
                        yCurve[i] = profile.elevation * Math.sin(theta * 2);
                    }
                }

                panner.positionX.setValueCurveAtTime(xCurve, 0, renderDuration);
                panner.positionY.setValueCurveAtTime(yCurve, 0, renderDuration);
                panner.positionZ.setValueCurveAtTime(zCurve, 0, renderDuration);
            }
        }

        // Connect Chain: input -> (vocalHighPass / bassCompressor) -> eqLow -> eqMid -> (vocalPresence / instrumentClarity) -> eqHigh -> volGain -> panner
        let currentNode: AudioNode = input;

        if (vocalHighPassNode) {
            currentNode.connect(vocalHighPassNode);
            currentNode = vocalHighPassNode;
        }

        if (bassAdaptiveCompressor) {
            currentNode.connect(bassAdaptiveCompressor);
            currentNode = bassAdaptiveCompressor;
        }

        currentNode.connect(eqLow);
        currentNode = eqLow;

        currentNode.connect(eqMid);
        currentNode = eqMid;

        if (vocalPresenceNode) {
            currentNode.connect(vocalPresenceNode);
            currentNode = vocalPresenceNode;
        }

        if (instrumentClarityNode) {
            currentNode.connect(instrumentClarityNode);
            currentNode = instrumentClarityNode;
        }

        currentNode.connect(eqHigh);
        currentNode = eqHigh;

        currentNode.connect(volGain);
        volGain.connect(panner);

        panner.connect(compressor);

        if (convolver && activeReverbWet > 0) {
            const sendGain = offlineContext.createGain();
            sendGain.gain.setValueAtTime(activeReverbWet, 0);
            panner.connect(sendGain);
            sendGain.connect(convolver);
        }

        trackNodes.set(trackId, { input, panner, eqLow, eqMid, eqHigh, volGain, profile });
    }

    onProgress?.(75, 'Scheduling timeline clips & spatial automation...');

    // Schedule all active clips
    for (const clip of activeClips) {
        const audioBuffer = bufferMap.get(clip.audioUrl);
        if (!audioBuffer) continue;

        const clipStartOnTimeline = clip.startTime;
        const clipEndOnTimeline = clip.startTime + clip.duration;

        if (clipEndOnTimeline <= rangeStart || clipStartOnTimeline >= rangeEnd) {
            continue;
        }

        const nodes = trackNodes.get(clip.trackId);
        if (!nodes) continue;

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        const clipGain = offlineContext.createGain();
        clipGain.gain.setValueAtTime(clip.gain ?? 1.0, 0);
        source.connect(clipGain);
        clipGain.connect(nodes.input);

        const effectiveTimelineStart = Math.max(clipStartOnTimeline, rangeStart);
        const scheduleTime = effectiveTimelineStart - rangeStart;
        const trimOffset = clip.offset + (effectiveTimelineStart - clipStartOnTimeline);
        const playDuration = Math.min(clipEndOnTimeline, rangeEnd) - effectiveTimelineStart;

        if (playDuration > 0) {
            source.start(scheduleTime, Math.max(0, trimOffset), playDuration);
        }
    }

    onProgress?.(85, 'Rendering 8D spatial audio matrix (Offline HRTF engine)...');

    const renderedBuffer = await offlineContext.startRendering();

    onProgress?.(95, 'Mastering & normalizing 8D spatial field...');

    if (options?.normalize) {
        return normalizeAudioBuffer(renderedBuffer);
    }

    return renderedBuffer;
}
