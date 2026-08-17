import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
    Play, Pause, SkipBack, RotateCcw,
    Headphones, Sparkles, Sliders, ShieldCheck, Compass, Radio,
    Undo2, Redo2, X, Info
} from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';
import { drawWaveformToCanvas } from '../../utils/waveform';
import type { TimelineTrack, TrackSpatialSettings } from '../../types';

interface TrailPoint {
    x: number;
    y: number;
    alpha: number;
}

const NOTICE_STORAGE_KEY = 'unweave_has_seen_8d_notice_v1';

export const Spatial8DMixerWorkspace: React.FC = () => {
    const {
        project,
        updateTrackSpatialSettings,
        setGlobalSpatialSettings,
        toggleSpatialManualMode,
        toggleSpatial8DBypass,
        resetAllTracksToDefaults,
        isPlaying,
        togglePlay,
        seek,
        playheadTime,
        undo,
        redo,
        canUndo,
        canRedo,
        selectedTrackId,
        selectTrack,
    } = useTimeline();

    const scrubberContainerRef = useRef<HTMLDivElement>(null);
    const scrubberCanvasRef = useRef<HTMLCanvasElement>(null);
    const radarCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    // First-time 8D Audio reminder notice state
    const [showNotice, setShowNotice] = useState(() => {
        try {
            return localStorage.getItem(NOTICE_STORAGE_KEY) !== 'true';
        } catch {
            return true;
        }
    });

    const handleDismissNotice = () => {
        setShowNotice(false);
        try {
            localStorage.setItem(NOTICE_STORAGE_KEY, 'true');
        } catch {
            // Ignore
        }
    };

    const globalSettings = useMemo(() => project.globalSpatialSettings || {
        isManualMode: false,
        is8DBypassed: false,
        masterSpeedMultiplier: 1.0,
        reverbPreset: 'studio',
        masterSpread: 1.0,
    }, [project.globalSpatialSettings]);

    // ──────────────────────────────────────────────
    // 4 Consolidated Spatial Soundstage Groups
    // (Bass+Drums, Other/Ambience, Vocals, Guitar+Piano)
    // ──────────────────────────────────────────────
    interface SpatialGroup {
        id: string;
        title: string;
        subtitle: string;
        color: string;
        secondaryColor?: string;
        stems: string[];
        trackIds: string[];
        tracks: TimelineTrack[];
        spatial: TrackSpatialSettings;
    }

    const spatialGroups: SpatialGroup[] = useMemo(() => {
        const allTracks = project.tracks;

        const bassDrumsTracks = allTracks.filter(t => {
            const n = t.name.toLowerCase();
            return n.includes('bass') || n.includes('drum') || n.includes('kick') || n.includes('808') || n.includes('snare') || n.includes('percussion');
        });

        const otherTracks = allTracks.filter(t => {
            const n = t.name.toLowerCase();
            return n.includes('other') || n.includes('fx') || n.includes('synth') || n.includes('ambient') || n.includes('pad');
        });

        const vocalTracks = allTracks.filter(t => {
            const n = t.name.toLowerCase();
            return n.includes('vocal') || n.includes('voice') || n.includes('sing') || n.includes('acapella') || n.includes('lead');
        });

        const guitarPianoTracks = allTracks.filter(t => {
            const n = t.name.toLowerCase();
            return n.includes('guitar') || n.includes('piano') || n.includes('key') || n.includes('acoustic') || n.includes('electric') || n.includes('organ');
        });

        const assignedIds = new Set([
            ...bassDrumsTracks.map(t => t.id),
            ...otherTracks.map(t => t.id),
            ...vocalTracks.map(t => t.id),
            ...guitarPianoTracks.map(t => t.id),
        ]);

        const remainingTracks = allTracks.filter(t => !assignedIds.has(t.id));

        return [
            {
                id: 'group_bass_drums',
                title: 'Bass & Drums',
                subtitle: 'Low-End Rhythm (Mono Centered)',
                color: '#3b82f6',
                secondaryColor: '#f59e0b',
                stems: ['Bass', 'Drums'],
                trackIds: bassDrumsTracks.map(t => t.id),
                tracks: bassDrumsTracks,
                spatial: bassDrumsTracks[0]?.spatialSettings || {
                    pattern: 'static-center',
                    radius: 0,
                    speedSeconds: 0,
                    direction: 1,
                    reverbWet: 0.03,
                    elevation: 0,
                    isCenterLocked: true,
                    intensity: 1.0,
                    crossEarSpill: 0.15,
                },
            },
            {
                id: 'group_other',
                title: 'Other & Ambience',
                subtitle: 'Atmosphere & FX Bed',
                color: '#8b5cf6',
                stems: ['Other'],
                trackIds: [...otherTracks.map(t => t.id), ...remainingTracks.map(t => t.id)],
                tracks: [...otherTracks, ...remainingTracks],
                spatial: otherTracks[0]?.spatialSettings || remainingTracks[0]?.spatialSettings || {
                    pattern: 'circle',
                    radius: 3.0,
                    speedSeconds: 12,
                    direction: 1,
                    reverbWet: 0.16,
                    elevation: 0.15,
                    isCenterLocked: false,
                    intensity: 1.0,
                    crossEarSpill: 0.35,
                },
            },
            {
                id: 'group_vocals',
                title: 'Vocals & Lead',
                subtitle: 'Surround Orbit (Counter-Clockwise)',
                color: '#ef4444',
                stems: ['Vocals'],
                trackIds: vocalTracks.map(t => t.id),
                tracks: vocalTracks,
                spatial: vocalTracks[0]?.spatialSettings || {
                    pattern: 'circle',
                    radius: 2.2,
                    speedSeconds: 10,
                    direction: -1,
                    reverbWet: 0.16,
                    elevation: 0.25,
                    isCenterLocked: false,
                    intensity: 1.0,
                    crossEarSpill: 0.35,
                },
            },
            {
                id: 'group_guitar_piano',
                title: 'Guitar & Piano',
                subtitle: 'Harmonics & Melodic (Clockwise)',
                color: '#10b981',
                secondaryColor: '#ec4899',
                stems: ['Guitar', 'Piano'],
                trackIds: guitarPianoTracks.map(t => t.id),
                tracks: guitarPianoTracks,
                spatial: guitarPianoTracks[0]?.spatialSettings || {
                    pattern: 'circle',
                    radius: 3.0,
                    speedSeconds: 12,
                    direction: 1,
                    reverbWet: 0.16,
                    elevation: 0.15,
                    isCenterLocked: false,
                    intensity: 1.0,
                    crossEarSpill: 0.35,
                },
            },
        ];
    }, [project.tracks]);

    const updateGroupSpatialSettings = useCallback((group: SpatialGroup, updates: Partial<TrackSpatialSettings>) => {
        if (group.trackIds.length === 0) return;
        for (const trackId of group.trackIds) {
            updateTrackSpatialSettings(trackId, updates);
        }
    }, [updateTrackSpatialSettings]);

    const isManualMode = globalSettings.isManualMode;
    const is8DBypassed = globalSettings.is8DBypassed;
    const masterSpeed = globalSettings.masterSpeedMultiplier || 1.0;
    const totalDuration = Math.max(1, project.duration || 180);

    // Trails history for trailing cloudy streamer & collapsing blob
    const trailsRef = useRef<Record<string, TrailPoint[]>>({});
    const draggingTrackIdRef = useRef<string | null>(null);

    const formatPreciseTimecode = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const hundredths = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
    };

    const getTrackStemLabel = (track: TimelineTrack): string => {
        const clip = project.clips.find(c => c.trackId === track.id);
        if (clip && clip.stemName) return clip.stemName;
        if (track.name) return track.name;
        return 'Track';
    };

    // Draw consolidated waveform on top scrubber canvas
    useEffect(() => {
        const canvas = scrubberCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 2;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const availablePeaks = project.clips.find(c => c.peaks && c.peaks.length > 0)?.peaks;
        const peaksToDraw = availablePeaks || Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.15) * 0.4 + 0.3);

        drawWaveformToCanvas(canvas, peaksToDraw, '#facc15', {
            startRatio: 0,
            endRatio: 1,
            gain: 1.1,
            barWidth: 3,
            barGap: 1.5,
        });
    }, [project.clips]);

    // Handle Scrubber Click & Drag
    const handleScrubAtPoint = useCallback((clientX: number) => {
        if (!scrubberContainerRef.current) return;
        const rect = scrubberContainerRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const targetTime = ratio * totalDuration;
        seek(targetTime);
    }, [seek, totalDuration]);

    const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsScrubbing(true);
        handleScrubAtPoint(e.clientX);
    };

    useEffect(() => {
        if (!isScrubbing) return;
        const handleMouseMove = (e: MouseEvent) => handleScrubAtPoint(e.clientX);
        const handleMouseUp = () => setIsScrubbing(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isScrubbing, handleScrubAtPoint]);

    // Calculate current 2D soundstage position for a track
    const getTrackPosition = useCallback((track: TimelineTrack, time: number) => {
        const spatial = track.spatialSettings || {
            pattern: 'circle',
            radius: 2.5,
            speedSeconds: 10,
            direction: 1,
            reverbWet: 0.12,
            elevation: 0.2,
            isCenterLocked: false,
            intensity: 1.0,
            crossEarSpill: 0.35,
        };

        if (spatial.isCenterLocked || spatial.pattern === 'static-center' || spatial.radius < 0.1) {
            return { x: 0, y: 0, radius: 0, angle: 0 };
        }

        const effectiveSpeed = Math.max(1, (spatial.speedSeconds || 10) / masterSpeed);
        const direction = spatial.direction || 1;
        const baseAngle = (time / effectiveSpeed) * (2 * Math.PI) * direction;

        const r = spatial.radius * (globalSettings.masterSpread || 1.0);
        let x = 0;
        let y = 0;

        if (spatial.pattern === 'front-ellipse') {
            x = Math.sin(baseAngle) * r;
            y = -(Math.abs(Math.cos(baseAngle)) * r * 0.7 + 0.4);
        } else {
            x = Math.sin(baseAngle) * r;
            y = -Math.cos(baseAngle) * r;
        }

        return { x, y, radius: r, angle: baseAngle };
    }, [masterSpeed, globalSettings.masterSpread]);

    // Animate 360° Radar Canvas with Centering & Trailing Cloudy Tail / Collapsing Blob
    useEffect(() => {
        const canvas = radarCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const width = rect.width;
            const height = rect.height;
            const centerX = width / 2;
            const centerY = height / 2;
            // Enhanced radius: 1.15x scale for bigger visual impact
            const maxRadarRadius = Math.max(50, Math.min(centerX, centerY) - 16);
            const scale = maxRadarRadius / 4.5;

            ctx.clearRect(0, 0, width, height);

            // 1. Concentric Distance Radar Rings
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;

            const ringDistances = [1, 2, 3, 4];
            ringDistances.forEach((dist) => {
                const ringRadius = (dist / 4.5) * maxRadarRadius;
                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, 2 * Math.PI);
                ctx.stroke();

                // Distance label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.font = '9px monospace';
                ctx.fillText(`${dist}m`, centerX + 4, centerY - ringRadius + 11);
            });

            // Crosshair lines
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - maxRadarRadius - 6);
            ctx.lineTo(centerX, centerY + maxRadarRadius + 6);
            ctx.moveTo(centerX - maxRadarRadius - 6, centerY);
            ctx.lineTo(centerX + maxRadarRadius + 6, centerY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.stroke();

            // Field of View labels (FRONT / BACK / L / R)
            ctx.fillStyle = 'rgba(250, 204, 21, 0.7)';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('FRONT', centerX, centerY - maxRadarRadius - 8);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillText('BACK', centerX, centerY + maxRadarRadius + 14);
            ctx.fillText('L', centerX - maxRadarRadius - 10, centerY + 3);
            ctx.fillText('R', centerX + maxRadarRadius + 10, centerY + 3);

            // 2. Center Listener Head with Glowing Headphones
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, 13, 0, 2 * Math.PI);
            ctx.fillStyle = '#18181b';
            ctx.fill();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Headphone band arc
            ctx.beginPath();
            ctx.arc(centerX, centerY, 17, Math.PI * 0.8, Math.PI * 2.2);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Ear cups
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.ellipse(centerX - 16, centerY, 3.5, 5.5, 0, 0, 2 * Math.PI);
            ctx.ellipse(centerX + 16, centerY, 3.5, 5.5, 0, 0, 2 * Math.PI);
            ctx.fill();

            // Center listener dot
            ctx.beginPath();
            ctx.arc(centerX, centerY, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();

            // 3. Render Each Active Track with Trailing Cloudy Tail / Collapsed Blob
            project.tracks.forEach((track) => {
                if (track.isMuted) return;

                const pos = getTrackPosition(track, playheadTime);
                const canvasX = centerX + pos.x * scale;
                const canvasY = centerY + pos.y * scale;
                const isSelected = selectedTrackId === track.id;

                if (!trailsRef.current[track.id]) {
                    trailsRef.current[track.id] = [];
                }
                const trails = trailsRef.current[track.id];

                if (isPlaying && pos.radius > 0.1) {
                    // Moving: push head to trail
                    trails.unshift({ x: canvasX, y: canvasY, alpha: 1.0 });
                    if (trails.length > 22) trails.pop();
                } else {
                    // Stopped / Stationary: smoothly collapse tail towards head position!
                    for (let i = 0; i < trails.length; i++) {
                        trails[i].x += (canvasX - trails[i].x) * 0.18;
                        trails[i].y += (canvasY - trails[i].y) * 0.18;
                    }
                    if (trails.length > 1 && Math.hypot(trails[trails.length - 1].x - canvasX, trails[trails.length - 1].y - canvasY) < 1.5) {
                        trails.length = 1;
                    }
                }

                // Render Trailing Cloudy Tail if moving
                if (trails.length > 1 && isPlaying) {
                    ctx.save();
                    // 1. Soft ribbon stream
                    ctx.beginPath();
                    ctx.moveTo(trails[0].x, trails[0].y);
                    for (let i = 1; i < trails.length; i++) {
                        const xc = (trails[i].x + trails[i - 1].x) / 2;
                        const yc = (trails[i].y + trails[i - 1].y) / 2;
                        ctx.quadraticCurveTo(trails[i - 1].x, trails[i - 1].y, xc, yc);
                    }
                    ctx.strokeStyle = `${track.color}40`;
                    ctx.lineWidth = 5;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.stroke();

                    // 2. Overlapping soft cloudy discs
                    for (let i = trails.length - 1; i >= 0; i--) {
                        const pt = trails[i];
                        const ratio = (trails.length - i) / trails.length;
                        const cloudRadius = 3 + ratio * 8;
                        const alpha = ratio * 0.35;

                        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, cloudRadius);
                        grad.addColorStop(0, `${track.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`);
                        grad.addColorStop(0.7, `${track.color}${Math.round(alpha * 0.3 * 255).toString(16).padStart(2, '0')}`);
                        grad.addColorStop(1, `${track.color}00`);

                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, cloudRadius, 0, 2 * Math.PI);
                        ctx.fillStyle = grad;
                        ctx.fill();
                    }
                    ctx.restore();
                } else {
                    // Collapsed / Stationary: Render circular glowing cloudy halo/blob around node
                    const blobRadius = 14 + (isSelected ? 3 : 0);
                    const blobGrad = ctx.createRadialGradient(canvasX, canvasY, 1, canvasX, canvasY, blobRadius);
                    blobGrad.addColorStop(0, `${track.color}65`);
                    blobGrad.addColorStop(0.5, `${track.color}25`);
                    blobGrad.addColorStop(1, `${track.color}00`);

                    ctx.beginPath();
                    ctx.arc(canvasX, canvasY, blobRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = blobGrad;
                    ctx.fill();
                }

                // Orbital Path Guide Ring
                if (pos.radius > 0.1) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, pos.radius * scale, 0, 2 * Math.PI);
                    ctx.strokeStyle = isSelected ? `${track.color}60` : `${track.color}25`;
                    ctx.lineWidth = isSelected ? 1.5 : 1;
                    ctx.setLineDash([3, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Selection highlight ring around active node
                if (isSelected) {
                    ctx.beginPath();
                    ctx.arc(canvasX, canvasY, 12, 0, 2 * Math.PI);
                    ctx.strokeStyle = '#facc15';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // Track Node Center Orb
                ctx.beginPath();
                ctx.arc(canvasX, canvasY, 7, 0, 2 * Math.PI);
                ctx.fillStyle = track.color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Stem Label
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9.5px sans-serif';
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0,0,0,0.9)';
                ctx.shadowBlur = 4;
                ctx.fillText(getTrackStemLabel(track), canvasX, canvasY - 11);
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, [project.tracks, project.clips, playheadTime, isPlaying, selectedTrackId, getTrackPosition]);

    // Handle Interactive Mouse Down & Drag to adjust Distance in Radar Canvas (With Deselection on Blank Space)
    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = radarCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const maxRadarRadius = Math.max(50, Math.min(centerX, centerY) - 16);
        const scale = maxRadarRadius / 4.5;

        let hitTrackId: string | null = null;

        // Check if clicked near any track node
        for (const track of project.tracks) {
            const pos = getTrackPosition(track, playheadTime);
            const canvasX = centerX + pos.x * scale;
            const canvasY = centerY + pos.y * scale;

            const dist = Math.hypot(mouseX - canvasX, mouseY - canvasY);
            if (dist <= 22) {
                hitTrackId = track.id;
                draggingTrackIdRef.current = track.id;
                selectTrack(track.id);
                break;
            }
        }

        // If clicked on blank space on radar, deselect track!
        if (!hitTrackId) {
            selectTrack(null);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const trackId = draggingTrackIdRef.current;
            if (!trackId || !radarCanvasRef.current) return;

            const canvas = radarCanvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const maxRadarRadius = Math.max(50, Math.min(centerX, centerY) - 16);
            const scale = maxRadarRadius / 4.5;

            const dx = mouseX - centerX;
            const dy = mouseY - centerY;
            const distPx = Math.hypot(dx, dy);
            const rMeters = distPx / scale;

            if (rMeters < 0.35) {
                updateTrackSpatialSettings(trackId, {
                    radius: 0,
                    isCenterLocked: true,
                    pattern: 'static-center',
                });
            } else {
                const clampedR = Math.min(4.5, Math.max(0.5, Math.round(rMeters * 10) / 10));
                const targetTrack = project.tracks.find(t => t.id === trackId);
                const currentPattern = targetTrack?.spatialSettings?.pattern === 'static-center'
                    ? 'circle'
                    : (targetTrack?.spatialSettings?.pattern || 'circle');

                updateTrackSpatialSettings(trackId, {
                    radius: clampedR,
                    isCenterLocked: false,
                    pattern: currentPattern,
                });
            }
        };

        const handleMouseUp = () => {
            draggingTrackIdRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [project.tracks, updateTrackSpatialSettings]);

    return (
        <div className="w-full h-[calc(100vh-8.5rem)] flex flex-col bg-zinc-950 text-slate-50 overflow-hidden select-none">
            {/* ── First-time 8D Audio Notice Banner ── */}
            {showNotice && (
                <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-between gap-3 text-xs text-yellow-200 z-40">
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>
                            <strong>🎧 Headphones Recommended:</strong> 8D binaural sound rotates in 360° space around your head.
                            In <strong>AI Auto-Guided mode</strong>, acoustic frequencies are pre-sculpted. Switch to <strong>Manual Studio</strong> to drag nodes on the radar or tweak individual parameters!
                        </span>
                    </div>
                    <button
                        onClick={handleDismissNotice}
                        className="p-1 rounded-lg text-yellow-400 hover:bg-yellow-500/20 transition-colors shrink-0 cursor-pointer"
                        title="Dismiss"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* ── Top Header Toolbar (Matching Mixer Console Structure) ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-zinc-950 border-b border-white/10 shrink-0 z-20 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                        <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm sm:text-base font-black text-white tracking-tight">8D Spatial Audio Mixer</h2>
                        <p className="text-[11px] text-zinc-400 font-medium">
                            {project.tracks.length} Spatial Layers • 360° Binaural HRTF Soundstage
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Timecode */}
                    <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-xl font-mono text-xs sm:text-sm font-black text-yellow-400 tabular-nums shadow-inner">
                        {formatPreciseTimecode(playheadTime)}
                    </div>

                    {/* Undo / Redo */}
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
                        <button
                            title="Undo (Ctrl+Z / Cmd+Z)"
                            onClick={undo}
                            disabled={!canUndo}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            title="Redo (Ctrl+Y / Cmd+Shift+Z)"
                            onClick={redo}
                            disabled={!canRedo}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Rewind to Start */}
                    <button
                        title="Rewind to Start (0:00)"
                        onClick={() => seek(0)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    >
                        <SkipBack className="w-4 h-4" />
                    </button>

                    {/* Play / Pause */}
                    <button
                        title="Play / Pause (Spacebar)"
                        onClick={togglePlay}
                        className={`px-4 py-1.5 rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                            isPlaying
                                ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]'
                                : 'bg-white/10 text-white hover:bg-yellow-500 hover:text-black'
                        }`}
                    >
                        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                    </button>

                    {/* Reset All to Defaults */}
                    <button
                        title="Reset All Spatial Parameters to Defaults"
                        onClick={resetAllTracksToDefaults}
                        className="px-3 py-1.5 rounded-xl border border-white/10 hover:border-yellow-500/40 text-zinc-400 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <RotateCcw className="w-3 h-3" />
                        <span className="hidden sm:inline">Reset</span>
                    </button>

                    {/* ── 8D Binaural vs Stereo Segmented Switch (Clean Rectangular Group) ── */}
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 shadow-sm">
                        <button
                            type="button"
                            title="8D Spatial Binaural Mode Active"
                            onClick={() => is8DBypassed && toggleSpatial8DBypass()}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                !is8DBypassed
                                    ? 'bg-yellow-400 text-black shadow-sm'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Headphones className="w-3.5 h-3.5" />
                            <span>8D Audio</span>
                        </button>
                        <button
                            type="button"
                            title="Flat Stereo Compare (Bypass 8D)"
                            onClick={() => !is8DBypassed && toggleSpatial8DBypass()}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                is8DBypassed
                                    ? 'bg-zinc-700 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <span>Stereo</span>
                        </button>
                    </div>

                    {/* ── AI Auto-Guided vs Manual Studio Segmented Switch (Clean Rectangular Group) ── */}
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 shadow-sm">
                        <button
                            type="button"
                            title="AI Auto-Guided Mode: Pre-sculpted acoustic balances"
                            onClick={() => isManualMode && toggleSpatialManualMode()}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                !isManualMode
                                    ? 'bg-emerald-500 text-black shadow-sm'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>AI Auto</span>
                        </button>
                        <button
                            type="button"
                            title="Manual Studio: Full control over orbits and sliders"
                            onClick={() => !isManualMode && toggleSpatialManualMode()}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                isManualMode
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Manual</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Full-Width Consolidated Overview Waveform & Timeline Scrubber (Matching Mixer Console) ── */}
            <div className="px-4 sm:px-6 py-2 bg-zinc-950/90 border-b border-white/10 shrink-0">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1 px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-yellow-400 font-black text-xs">{formatPreciseTimecode(playheadTime)}</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400 text-xs">{formatPreciseTimecode(totalDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => seek(Math.max(0, playheadTime - 5))}
                            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold transition-all cursor-pointer"
                            title="Rewind 5 seconds"
                        >
                            -5s
                        </button>
                        <button
                            onClick={() => seek(Math.min(totalDuration, playheadTime + 5))}
                            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-bold transition-all cursor-pointer"
                            title="Forward 5 seconds"
                        >
                            +5s
                        </button>
                    </div>
                </div>

                <div
                    ref={scrubberContainerRef}
                    onMouseDown={handleScrubberMouseDown}
                    className="w-full h-10 bg-black/70 border border-white/10 hover:border-yellow-500/40 rounded-2xl relative overflow-hidden cursor-pointer group shadow-inner transition-colors"
                >
                    <canvas ref={scrubberCanvasRef} className="w-full h-full block opacity-60 group-hover:opacity-80 transition-opacity" />
                    <div
                        className="absolute top-0 bottom-0 w-1 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,1)] pointer-events-none transition-transform duration-75 ease-out"
                        style={{
                            left: `${(playheadTime / totalDuration) * 100}%`,
                            transform: 'translateX(-50%)',
                        }}
                    />
                </div>
            </div>

            {/* ── Main Workspace Body: Split View ── */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* ── LEFT PANEL: Consolidated 8D Spatial Groups (60-65%) ── */}
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            selectTrack(null);
                        }
                    }}
                    className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 border-r border-white/10 bg-black/40 flex flex-col gap-3"
                >
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <Compass className="w-4 h-4 text-yellow-400" />
                            <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
                                8D Spatial Soundstage Modules (4 Groups)
                            </span>
                        </div>
                        {!isManualMode ? (
                            <span className="text-[11px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>AI Spatial Acoustics Active</span>
                            </span>
                        ) : (
                            <span className="text-[11px] font-bold text-indigo-400 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-1">
                                <Sliders className="w-3 h-3" />
                                <span>Manual Trajectory Control</span>
                            </span>
                        )}
                    </div>

                    {/* 4 Consolidated Spatial Group Cards Grid */}
                    <div
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                selectTrack(null);
                            }
                        }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    >
                        {spatialGroups.map((group) => {
                            const spatial = group.spatial;
                            const isGroupSelected = group.trackIds.some(id => id === selectedTrackId);

                            return (
                                <div
                                    key={group.id}
                                    onClick={() => {
                                        if (group.trackIds[0]) {
                                            selectTrack(group.trackIds[0]);
                                        }
                                    }}
                                    className={`p-3 sm:p-3.5 rounded-2xl border transition-all relative overflow-hidden cursor-pointer ${
                                        isGroupSelected
                                            ? 'border-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.25)] bg-zinc-900'
                                            : !isManualMode
                                            ? 'bg-zinc-900/60 border-white/10 opacity-90 hover:border-white/20'
                                            : 'bg-zinc-900/90 border-white/10 shadow-lg hover:border-yellow-500/40'
                                    }`}
                                >
                                    {/* Top Header with Stem Badges & Ground Center Lock */}
                                    <div
                                        className="w-full px-2.5 py-2 rounded-xl border flex items-center justify-between shadow-sm mb-2.5 relative"
                                        style={{
                                            backgroundColor: group.secondaryColor
                                                ? `color-mix(in srgb, ${group.color} 18%, ${group.secondaryColor} 18%)`
                                                : `${group.color}25`,
                                            borderColor: group.secondaryColor
                                                ? `color-mix(in srgb, ${group.color} 50%, ${group.secondaryColor} 50%)`
                                                : `${group.color}60`,
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {group.stems.map((stem) => (
                                                <span
                                                    key={stem}
                                                    className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white bg-black/60 border border-white/20"
                                                >
                                                    {stem}
                                                </span>
                                            ))}
                                            <span className="text-[11px] font-black uppercase tracking-wide text-white ml-1">
                                                {group.title}
                                            </span>
                                        </div>

                                        {/* Ground Center Lock Toggle */}
                                        <button
                                            title={spatial.isCenterLocked ? 'Locked to Mono Center' : 'Spatial Orbit Active'}
                                            disabled={!isManualMode}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateGroupSpatialSettings(group, { isCenterLocked: !spatial.isCenterLocked });
                                            }}
                                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all border shrink-0 ${
                                                spatial.isCenterLocked
                                                    ? 'bg-blue-500/30 text-blue-200 border-blue-400/50'
                                                    : 'bg-black/40 text-zinc-300 border-white/10 hover:text-white'
                                            } ${!isManualMode ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                        >
                                            {spatial.isCenterLocked ? '🔒 Mono Center' : '🌐 360° Orbit'}
                                        </button>
                                    </div>

                                    {/* Motion Trajectory Pattern Selector */}
                                    <div className="space-y-0.5 mb-2.5">
                                        <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                            Trajectory Pattern
                                        </label>
                                        <div className="grid grid-cols-3 gap-1 bg-black/50 p-0.5 rounded-lg border border-white/10">
                                            {(['circle', 'front-ellipse', 'static-center'] as const).map((pat) => (
                                                <button
                                                    key={pat}
                                                    type="button"
                                                    disabled={!isManualMode}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateGroupSpatialSettings(group, {
                                                            pattern: pat,
                                                            isCenterLocked: pat === 'static-center',
                                                        });
                                                    }}
                                                    className={`py-0.5 text-[9px] font-bold rounded transition-all ${
                                                        spatial.pattern === pat
                                                            ? 'bg-yellow-500 text-black shadow-sm'
                                                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                                    } ${!isManualMode ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                                >
                                                    {pat === 'circle' ? '360° Orbit' : pat === 'front-ellipse' ? 'Front Sway' : 'Static Mono'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sliders Grid: Orbit Radius & Rotation Speed */}
                                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                                        {/* Orbit Radius / Distance */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>Distance (Radius)</span>
                                                <span className="text-yellow-400 font-mono">{spatial.radius.toFixed(1)}m</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="4.5"
                                                step="0.1"
                                                disabled={!isManualMode || spatial.isCenterLocked}
                                                value={spatial.radius}
                                                onChange={(e) => updateGroupSpatialSettings(group, { radius: parseFloat(e.target.value) })}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded disabled:opacity-40"
                                            />
                                        </div>

                                        {/* Rotation Speed (Period) */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>Orbit Speed</span>
                                                <span className="text-yellow-400 font-mono">{spatial.speedSeconds.toFixed(0)}s</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="3"
                                                max="24"
                                                step="1"
                                                disabled={!isManualMode || spatial.isCenterLocked}
                                                value={spatial.speedSeconds}
                                                onChange={(e) => updateGroupSpatialSettings(group, { speedSeconds: parseInt(e.target.value, 10) })}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded disabled:opacity-40"
                                            />
                                        </div>
                                    </div>

                                    {/* Sliders Grid: Spatial Intensity & 3D Reverb Wet */}
                                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                                        {/* Spatial Intensity / Volume */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>Intensity</span>
                                                <span className="text-yellow-400 font-mono">{((spatial.intensity ?? 1.0) * 100).toFixed(0)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.0"
                                                max="1.5"
                                                step="0.05"
                                                disabled={!isManualMode}
                                                value={spatial.intensity ?? 1.0}
                                                onChange={(e) => updateGroupSpatialSettings(group, { intensity: parseFloat(e.target.value) })}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded disabled:opacity-40"
                                            />
                                        </div>

                                        {/* 3D Reverb Surround Depth */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>3D Reverb</span>
                                                <span className="text-yellow-400 font-mono">{(spatial.reverbWet * 100).toFixed(0)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.0"
                                                max="0.40"
                                                step="0.02"
                                                disabled={!isManualMode}
                                                value={spatial.reverbWet}
                                                onChange={(e) => updateGroupSpatialSettings(group, { reverbWet: parseFloat(e.target.value) })}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded disabled:opacity-40"
                                            />
                                        </div>
                                    </div>

                                    {/* Sliders Grid: Cross-Ear Spill & Direction */}
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {/* Cross-Ear Spill / Spread */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>Cross Spill</span>
                                                <span className="text-yellow-400 font-mono">{((spatial.crossEarSpill ?? 0.35) * 100).toFixed(0)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.0"
                                                max="0.80"
                                                step="0.05"
                                                disabled={!isManualMode}
                                                value={spatial.crossEarSpill ?? 0.35}
                                                onChange={(e) => updateGroupSpatialSettings(group, { crossEarSpill: parseFloat(e.target.value) })}
                                                className="w-full h-1 accent-yellow-400 bg-white/10 rounded disabled:opacity-40"
                                            />
                                        </div>

                                        {/* Orbit Direction */}
                                        <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
                                                <span>Direction</span>
                                                <span className="text-yellow-400 font-mono">{spatial.direction === 1 ? 'CW' : 'CCW'}</span>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={!isManualMode || spatial.isCenterLocked}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateGroupSpatialSettings(group, { direction: spatial.direction === 1 ? -1 : 1 });
                                                }}
                                                className={`w-full py-0.5 text-[9px] font-bold rounded border border-white/10 transition-all ${
                                                    spatial.direction === 1 ? 'bg-white/5 text-zinc-300' : 'bg-yellow-500/20 text-yellow-300'
                                                } ${!isManualMode ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                            >
                                                {spatial.direction === 1 ? '↻ Clockwise' : '↺ Counter-CW'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── RIGHT PANEL: Global Controls & Interactive 360° Radar Canvas (35-40%, 1.15x Enlarged) ── */}
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            selectTrack(null);
                        }
                    }}
                    className="w-full lg:w-[430px] xl:w-[470px] bg-zinc-950 flex flex-col shrink-0 overflow-y-auto custom-scrollbar p-4 gap-4"
                >
                    {/* Top Half: Global Controls */}
                    <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Radio className="w-4 h-4 text-yellow-400" />
                                <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
                                    Global Soundstage
                                </span>
                            </div>
                            <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/20">
                                {globalSettings.reverbPreset.toUpperCase()}
                            </span>
                        </div>

                        {/* Master Rotation Multiplier Slider & Presets */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                <span>Master Orbit Speed</span>
                                <span className="text-yellow-400 font-mono font-extrabold">{masterSpeed.toFixed(2)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.25"
                                max="3.0"
                                step="0.05"
                                value={masterSpeed}
                                onChange={(e) => setGlobalSpatialSettings({ masterSpeedMultiplier: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                            />
                            <div className="grid grid-cols-4 gap-1.5 pt-1">
                                {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                                    <button
                                        key={spd}
                                        type="button"
                                        onClick={() => setGlobalSpatialSettings({ masterSpeedMultiplier: spd })}
                                        className={`py-1 text-xs font-bold rounded-lg border border-white/5 transition-all cursor-pointer ${
                                            Math.abs(masterSpeed - spd) < 0.05
                                                ? 'bg-yellow-500 text-black shadow-sm'
                                                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {spd}x
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Room Acoustic Preset */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-zinc-400 flex items-center justify-between">
                                <span>Room Acoustic Preset</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
                                {([
                                    { id: 'studio', label: 'Studio (Tight)' },
                                    { id: 'concert', label: 'Concert Hall' },
                                    { id: 'cathedral', label: 'Cathedral' },
                                    { id: 'cosmic', label: 'Cosmic Void' },
                                ] as const).map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setGlobalSpatialSettings({ reverbPreset: preset.id })}
                                        className={`py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                            globalSettings.reverbPreset === preset.id
                                                ? 'bg-yellow-500 text-black shadow-sm'
                                                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Soundstage Spread Slider */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                <span>Master Soundstage Width</span>
                                <span className="text-yellow-400 font-mono">{((globalSettings.masterSpread || 1.0) * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                value={globalSettings.masterSpread || 1.0}
                                onChange={(e) => setGlobalSpatialSettings({ masterSpread: parseFloat(e.target.value) })}
                                className="w-full h-1.5 accent-yellow-400 bg-white/10 rounded cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Bottom Half: 360° Real-Time Soundstage Canvas (1.15x Enlarged) */}
                    <div
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                selectTrack(null);
                            }
                        }}
                        className="flex-1 min-h-[380px] p-4 rounded-2xl bg-zinc-950 border border-white/10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden"
                    >
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 pointer-events-none z-10">
                            <Radio className="w-3 h-3 text-yellow-400 animate-pulse" />
                            <span>360° Binaural Radar • Click & Drag Nodes</span>
                        </div>
                        <div
                            onClick={(e) => {
                                if (e.target === e.currentTarget) {
                                    selectTrack(null);
                                }
                            }}
                            className="w-full h-full flex items-center justify-center relative"
                        >
                            <canvas
                                ref={radarCanvasRef}
                                onMouseDown={handleCanvasMouseDown}
                                className="w-full h-full max-w-[360px] max-h-[360px] cursor-grab active:cursor-grabbing"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
