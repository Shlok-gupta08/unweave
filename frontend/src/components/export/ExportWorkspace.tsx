import React, { useState, useRef } from 'react';
import { Download, CheckCircle2, Play, Pause, Sparkles } from 'lucide-react';
import { useTimeline } from '../../context/TimelineContext';
import { renderTimelineMixdown, audioBufferToMP3Blob, audioBufferToWavBlob } from '../../utils/audioUtils';

export const ExportWorkspace: React.FC = () => {
    const { project } = useTimeline();

    const [target, setTarget] = useState<'master' | 'loop'>('master');
    const [format, setFormat] = useState<'wav' | 'mp3'>('wav');
    const [bitrate, setBitrate] = useState<128 | 192 | 320>(320);
    const [sampleRate, setSampleRate] = useState<44100 | 48000>(44100);
    const [normalize, setNormalize] = useState(true);
    const [filename, setFilename] = useState(`unweave_mixdown_${new Date().toISOString().slice(0, 10)}`);

    const [isRendering, setIsRendering] = useState(false);
    const [renderProgress, setRenderProgress] = useState(0);
    const [renderStatus, setRenderStatus] = useState('');
    const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    const activeClipsCount = project.clips.length;
    const maxClipEnd = activeClipsCount > 0 ? Math.max(...project.clips.map(c => c.startTime + c.duration)) : 0;
    const durationToExport = target === 'loop' && project.loopStart !== null && project.loopEnd !== null
        ? project.loopEnd - project.loopStart
        : maxClipEnd;

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const handleStartExport = async () => {
        if (project.clips.length === 0) {
            alert('Your timeline is empty. Add some audio clips before exporting!');
            return;
        }

        setIsRendering(true);
        setRenderProgress(15);
        setRenderStatus('Initializing offline audio rendering graph...');

        try {
            const rangeStart = target === 'loop' && project.loopStart !== null ? project.loopStart : 0;
            const rangeEnd = target === 'loop' && project.loopEnd !== null ? project.loopEnd : undefined;

            setRenderProgress(35);
            setRenderStatus('Summing tracks, EQ, pan, and volume faders...');

            const renderedBuffer = await renderTimelineMixdown(project, {
                rangeStart,
                rangeEnd,
                sampleRate,
                normalize,
            });

            setRenderProgress(70);
            setRenderStatus(format === 'wav' ? 'Packaging 16-bit PCM WAV headers...' : `Encoding MP3 at ${bitrate} kbps...`);

            let outputBlob: Blob;
            if (format === 'wav') {
                outputBlob = audioBufferToWavBlob(renderedBuffer);
            } else {
                outputBlob = await audioBufferToMP3Blob(renderedBuffer, bitrate);
            }

            setRenderProgress(100);
            setRenderStatus('Mixdown complete! Downloading...');

            const blobUrl = URL.createObjectURL(outputBlob);
            setRenderedBlobUrl(blobUrl);

            // Auto-trigger download
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${filename}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error('Export failed', err);
            alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsRendering(false);
        }
    };

    const togglePreview = () => {
        if (!renderedBlobUrl) return;

        if (isPlayingPreview && previewAudioRef.current) {
            previewAudioRef.current.pause();
            setIsPlayingPreview(false);
            return;
        }

        const audio = new Audio(renderedBlobUrl);
        audio.onended = () => setIsPlayingPreview(false);
        audio.play().catch(console.error);
        previewAudioRef.current = audio;
        setIsPlayingPreview(true);
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="text-center max-w-2xl mx-auto space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Deliver / Mixdown Studio</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">Export & Master Your Mix</h2>
                <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                    Render your multi-track timeline arrangement into pristine lossless WAV or high-bitrate MP3.
                </p>
            </div>

            {/* Export Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Export Settings Form */}
                <div className="lg:col-span-7 bg-zinc-950/80 border border-white/10 rounded-3xl p-5 sm:p-7 backdrop-blur-xl shadow-2xl space-y-6">
                    {/* Filename Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">File Name</label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-yellow-500/50"
                        />
                    </div>

                    {/* Format Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Audio Format</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setFormat('wav')}
                                className={`p-4 rounded-2xl border text-left transition-all ${
                                    format === 'wav'
                                        ? 'border-yellow-400 bg-yellow-500/10 shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                                        : 'border-white/5 bg-white/[0.02] hover:border-white/15'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-black text-sm text-white">WAV (PCM)</span>
                                    {format === 'wav' && <CheckCircle2 className="w-4 h-4 text-yellow-400" />}
                                </div>
                                <p className="text-[11px] text-zinc-400">16-bit uncompressed lossless studio master</p>
                            </button>

                            <button
                                onClick={() => setFormat('mp3')}
                                className={`p-4 rounded-2xl border text-left transition-all ${
                                    format === 'mp3'
                                        ? 'border-yellow-400 bg-yellow-500/10 shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                                        : 'border-white/5 bg-white/[0.02] hover:border-white/15'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-black text-sm text-white">MP3</span>
                                    {format === 'mp3' && <CheckCircle2 className="w-4 h-4 text-yellow-400" />}
                                </div>
                                <p className="text-[11px] text-zinc-400">Compressed for easy sharing and streaming</p>
                            </button>
                        </div>
                    </div>

                    {/* MP3 Bitrate Options (if MP3 selected) */}
                    {format === 'mp3' && (
                        <div className="space-y-2 animate-in fade-in duration-300">
                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">MP3 Bitrate</label>
                            <div className="grid grid-cols-3 gap-2">
                                {([128, 192, 320] as const).map((b) => (
                                    <button
                                        key={b}
                                        onClick={() => setBitrate(b)}
                                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                            bitrate === b
                                                ? 'border-yellow-400 bg-yellow-500/20 text-yellow-300'
                                                : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {b} kbps {b === 320 && '(Best)'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Export Range */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Export Range</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setTarget('master')}
                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                                    target === 'master'
                                        ? 'border-yellow-400 bg-yellow-500/10 text-white'
                                        : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white'
                                }`}
                            >
                                Full Timeline ({formatDuration(maxClipEnd)})
                            </button>

                            <button
                                onClick={() => setTarget('loop')}
                                disabled={project.loopStart === null || project.loopEnd === null}
                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                    target === 'loop'
                                        ? 'border-yellow-400 bg-yellow-500/10 text-white'
                                        : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white'
                                }`}
                            >
                                In/Out Loop Region
                            </button>
                        </div>
                    </div>

                    {/* Quality Toggles */}
                    <div className="pt-2 border-t border-white/5 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Sample Rate</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([44100, 48000] as const).map((sr) => (
                                    <button
                                        key={sr}
                                        onClick={() => setSampleRate(sr)}
                                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                                            sampleRate === sr
                                                ? 'border-yellow-400 bg-yellow-500/20 text-yellow-300'
                                                : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {sr === 44100 ? '44.1 kHz (CD Quality)' : '48.0 kHz (Studio / Video)'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-center justify-between cursor-pointer">
                            <div>
                                <span className="text-xs font-bold text-zinc-200">Peak Normalization</span>
                                <p className="text-[10px] text-zinc-500">Normalizes mix peak to -0.1 dBFS to prevent clipping</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={normalize}
                                onChange={(e) => setNormalize(e.target.checked)}
                                className="w-4 h-4 accent-yellow-400 rounded cursor-pointer"
                            />
                        </label>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleStartExport}
                        disabled={isRendering || project.clips.length === 0}
                        className="w-full py-4 rounded-2xl bg-yellow-500 text-black hover:bg-yellow-400 active:scale-[0.99] font-black text-sm sm:text-base tracking-tight transition-all shadow-[0_0_25px_rgba(250,204,21,0.3)] hover:shadow-[0_0_35px_rgba(250,204,21,0.5)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className="w-5 h-5" />
                        <span>{isRendering ? 'Rendering Mixdown...' : 'Render & Download Mixdown'}</span>
                    </button>
                </div>

                {/* Right: Project Summary & Preview */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Project Overview Card */}
                    <div className="bg-zinc-950/80 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Summary</h3>

                        <div className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                <span className="text-zinc-400">Total Duration</span>
                                <span className="font-bold text-white font-mono">{formatDuration(durationToExport)}</span>
                            </div>

                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                <span className="text-zinc-400">Active Tracks</span>
                                <span className="font-bold text-white">{project.tracks.length} tracks</span>
                            </div>

                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                <span className="text-zinc-400">Timeline Clips</span>
                                <span className="font-bold text-white">{project.clips.length} clips</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-zinc-400">Sample Rate</span>
                                <span className="font-bold text-white font-mono">{sampleRate} Hz</span>
                            </div>
                        </div>

                        {/* Tracks Visual Swatch */}
                        <div className="pt-2">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Track Inclusions</span>
                            <div className="flex flex-wrap gap-1.5">
                                {project.tracks.map((t) => (
                                    <span
                                        key={t.id}
                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5"
                                        style={{ backgroundColor: `${t.color}20`, color: t.color, border: `1px solid ${t.color}40` }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                                        {t.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Rendering Progress Card */}
                    {isRendering && (
                        <div className="bg-zinc-950/90 border border-yellow-500/30 rounded-3xl p-5 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-yellow-400">Offline Rendering</span>
                                <span className="text-xs font-mono font-black text-white">{renderProgress}%</span>
                            </div>

                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                                <div
                                    className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(250,204,21,0.6)]"
                                    style={{ width: `${renderProgress}%` }}
                                />
                            </div>

                            <p className="text-[11px] text-zinc-400 text-center font-medium">
                                {renderStatus}
                            </p>
                        </div>
                    )}

                    {/* Rendered Preview Player */}
                    {renderedBlobUrl && !isRendering && (
                        <div className="bg-zinc-950/80 border border-green-500/30 rounded-3xl p-5 backdrop-blur-xl shadow-xl animate-in fade-in duration-500 space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                <span className="text-xs font-bold text-green-300">Export Ready & Downloaded</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-2xl">
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-xs font-bold text-white truncate">{filename}.{format}</h4>
                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">{format} • {formatDuration(durationToExport)}</span>
                                </div>

                                <button
                                    onClick={togglePreview}
                                    className="p-2.5 rounded-xl bg-white text-black hover:bg-yellow-400 transition-colors cursor-pointer"
                                >
                                    {isPlayingPreview ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black translate-x-0.5" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
