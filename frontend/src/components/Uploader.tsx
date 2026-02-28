import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Cpu, Zap, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { apiGet, apiPost, type ProcessingMode } from '../utils/api';
import type { SeparationJob, JobStatus } from '../types';

interface UploaderProps {
    onComplete: (data: SeparationJob) => void;
    onJobStarted?: (jobId: string) => void;
    onSessionExpired?: () => void;
    onClearJob?: () => void;
    resumeJobId?: string | null;
    hasActiveSession?: boolean;
    processingMode?: ProcessingMode;
}

export const Uploader: React.FC<UploaderProps> = ({ onComplete, onJobStarted, onSessionExpired, onClearJob, resumeJobId, hasActiveSession, processingMode = 'cpu' }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [deviceUsed, setDeviceUsed] = useState('');
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [cancelSuggestion, setCancelSuggestion] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // ── Combined timer state for dual-pass processing ──
    const [passNumber, setPassNumber] = useState(1);
    const prevRawProgressRef = useRef(0);
    const [combinedProgress, setCombinedProgress] = useState(0);
    const [combinedEta, setCombinedEta] = useState<number | null>(null);

    // Cleanup polling and abort on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            abortControllerRef.current?.abort();
        };
    }, []);

    // Resume a job from localStorage on mount
    // Using refs to batch state updates outside the effect
    const pendingResumeRef = useRef(false);
    if (resumeJobId && !jobId && !pendingResumeRef.current) {
        pendingResumeRef.current = true;
        setIsUploading(true);
        setJobId(resumeJobId);
        setStatusMessage('Reconnecting to active job...');
    }
    if (!resumeJobId && pendingResumeRef.current) {
        pendingResumeRef.current = false;
    }

    // Poll for job status
    useEffect(() => {
        if (!jobId) return;

        const poll = async () => {
            try {
                const res = await apiGet<JobStatus>(`/status/${jobId}`, processingMode);
                const data = res.data;

                const rawProgress = data.progress;
                const rawEta = data.eta_seconds;

                // ── Detect dual-pass processing ──
                // If raw progress drops significantly, we've entered pass 2
                if (prevRawProgressRef.current > 50 && rawProgress < 20 && passNumber === 1) {
                    setPassNumber(2);
                }
                prevRawProgressRef.current = rawProgress;

                // ── Compute combined progress & ETA ──
                if (passNumber === 1) {
                    // First pass: scale to 0–50% of total
                    setCombinedProgress(Math.round(rawProgress / 2));
                    // Double the ETA to account for the second pass
                    setCombinedEta(rawEta !== null ? Math.round(rawEta * 2) : null);
                } else {
                    // Second pass: scale to 50–100% of total 
                    setCombinedProgress(Math.round(50 + rawProgress / 2));
                    setCombinedEta(rawEta);
                }

                setStatusMessage(data.message);
                if (data.device_used) setDeviceUsed(data.device_used);

                if (data.status === 'complete' && data.stems) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setIsCancelling(false);
                    setJobId(null);
                    setPassNumber(1);
                    prevRawProgressRef.current = 0;

                    onComplete({
                        job_id: jobId,
                        stems: data.stems,
                        message: data.message,
                        processing_time: data.processing_time ?? undefined,
                        device_used: data.device_used ?? undefined,
                    });
                } else if (data.status === 'error' || data.status === 'cancelled') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setIsCancelling(false);
                    setJobId(null);
                    setPassNumber(1);
                    prevRawProgressRef.current = 0;
                    if (data.status === 'error') {
                        setError(data.message || 'Separation failed');
                    }
                    if (data.status === 'cancelled') {
                        setCancelSuggestion('Processing cancelled. Try Standard (CPU) Mode for more consistent results.');
                        onClearJob?.();
                    }
                }
            } catch (err) {
                // If the request was aborted by us, don't treat it as an error
                if (axios.isCancel(err) || (err instanceof DOMException && err.name === 'AbortError')) {
                    return;
                }
                // GPU-specific: network error during polling means the GPU backend went down
                if (axios.isAxiosError(err) && !err.response && processingMode === 'gpu') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setIsCancelling(false);
                    setJobId(null);
                    setPassNumber(1);
                    prevRawProgressRef.current = 0;
                    setError('GPU backend became unreachable during processing. Please switch to Standard (CPU) Mode.');
                    onClearJob?.();
                    return;
                }
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setIsCancelling(false);
                    setJobId(null);
                    setPassNumber(1);
                    prevRawProgressRef.current = 0;

                    if (resumeJobId && onClearJob) {
                        onClearJob();
                    } else {
                        setError('Session expired — the server was restarted. Please upload again.');
                        onSessionExpired?.();
                    }
                }
            }
        };

        pollingRef.current = setInterval(poll, 1000);
        poll();

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId, processingMode, onComplete]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;
        setSelectedFile(file);
        setError(null);
    }, []);

    const startProcessing = async () => {
        if (!selectedFile) return;

        // Reset state
        setIsUploading(true);
        setError(null);
        setCancelSuggestion(null);
        setStatusMessage('Uploading file...');
        setDeviceUsed('');
        setPassNumber(1);
        setCombinedProgress(0);
        setCombinedEta(null);
        prevRawProgressRef.current = 0;

        // Create a new AbortController for this request
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await apiPost<{ job_id: string; message: string }>(
                '/separate/',
                formData,
                processingMode,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    signal: controller.signal,
                }
            );
            const newJobId = response.data.job_id;
            setJobId(newJobId);
            setStatusMessage('Processing started...');
            onJobStarted?.(newJobId);
        } catch (err) {
            // If aborted by user, don't show error
            if (axios.isCancel(err) || (err instanceof DOMException && err.name === 'AbortError')) {
                setIsUploading(false);
                setIsCancelling(false);
                setCancelSuggestion('Processing cancelled. Try Standard (CPU) Mode for more consistent results.');
                return;
            }
            console.error(err);
            setIsUploading(false);
            setIsCancelling(false);
            if (axios.isAxiosError(err)) {
                // GPU-specific: network error means the GPU backend is unreachable
                if (processingMode === 'gpu' && !err.response) {
                    setError('GPU backend is unreachable. Please switch to Standard (CPU) Mode or try again later.');
                } else {
                    setError(err.response?.data?.error || 'Failed to upload audio.');
                }
            } else {
                setError('Failed to upload audio.');
            }
        }
    };

    const handleProcessAudio = async () => {
        if (!selectedFile) return;

        if (hasActiveSession) {
            setShowConfirmDialog(true);
            return;
        }

        startProcessing();
    };

    const handleConfirmReplace = () => {
        setShowConfirmDialog(false);
        onClearJob?.();
        startProcessing();
    };

    const handleCancel = async () => {
        setIsCancelling(true);
        setStatusMessage('Cancelling...');

        // Immediately abort any in-flight HTTP request
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;

        // Also tell the server to cancel the job
        if (jobId) {
            try {
                await apiPost(`/cancel/${jobId}`, undefined, processingMode);
            } catch (err) {
                console.error('Failed to cancel job on server:', err);
            }
        }

        // Reset UI immediately — don't wait for the next poll
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsUploading(false);
        setIsCancelling(false);
        setJobId(null);
        setPassNumber(1);
        setCombinedProgress(0);
        setCombinedEta(null);
        prevRawProgressRef.current = 0;
        setCancelSuggestion('Processing cancelled. Try Standard (CPU) Mode for more consistent results.');
        onClearJob?.();
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/mpeg': ['.mp3', '.mpeg', '.mpg', '.mpga', '.mpega'],
            'audio/wav': ['.wav'],
            'audio/flac': ['.flac']
        },
        maxFiles: 1,
        multiple: false,
        disabled: isUploading || !!selectedFile
    });

    const formatETA = (seconds: number | null): string => {
        if (seconds === null || seconds === undefined) return 'Calculating...';
        if (seconds <= 0) return 'Almost done...';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins > 0) return `~${mins}m ${secs}s remaining`;
        return `~${secs}s remaining`;
    };

    const getDeviceIcon = () => {
        if (deviceUsed === 'cpu') return <Cpu className="w-4 h-4" />;
        return <Zap className="w-4 h-4" />;
    };

    const getDeviceLabel = () => {
        switch (deviceUsed) {
            case 'cuda': return 'NVIDIA GPU';
            case 'mps': return 'Apple Silicon';
            case 'directml': return 'AMD GPU';
            case 'cpu': return 'CPU';
            default: return 'Processing';
        }
    };

    return (
        <>
            <div className="w-full max-w-3xl mx-auto p-1 backdrop-blur-3xl rounded-[2.5rem] bg-white/[0.02] border border-white/5 shadow-2xl overflow-hidden relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-yellow-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div
                    {...(isUploading || selectedFile ? {} : getRootProps())}
                    className={`flex flex-col items-center justify-center p-8 sm:p-24 border border-dashed rounded-[2rem] transition-all duration-500 relative z-10 ${isDragActive ? 'border-yellow-500/50 bg-yellow-500/10 scale-[0.98]' : (selectedFile || isUploading ? 'border-white/5 bg-white/[0.02]' : 'border-white/10 hover:border-yellow-500/30 hover:bg-white/[0.03]')} ${isUploading || selectedFile ? 'opacity-100 cursor-default border-yellow-500/30' : 'cursor-pointer'}`}
                >
                    {!isUploading && !selectedFile && <input {...getInputProps()} />}

                    {isUploading ? (
                        <div className="flex flex-col items-center gap-6 w-full max-w-md">
                            <div className="relative">
                                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="url(#progressGradient)" strokeWidth="6" strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 42}`}
                                        strokeDashoffset={`${2 * Math.PI * 42 * (1 - combinedProgress / 100)}`}
                                        className="transition-all duration-700 ease-out"
                                    />
                                    <defs>
                                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#facc15" />
                                            <stop offset="100%" stopColor="#eab308" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-2xl font-black text-white tabular-nums">{combinedProgress}%</span>
                                </div>
                            </div>

                            <div className="text-center space-y-2">
                                <p className="text-xl font-bold text-white tracking-tight">{statusMessage || 'Separating Stems...'}</p>
                                {passNumber > 1 && (
                                    <p className="text-xs text-yellow-500/70 font-medium">Pass 2 of 2 — Fine separation</p>
                                )}
                                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                                    <Clock className="w-4 h-4" />
                                    <span>{formatETA(combinedEta)}</span>
                                </div>
                                {deviceUsed && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                                        {getDeviceIcon()}
                                        <span>{getDeviceLabel()}</span>
                                    </div>
                                )}
                            </div>

                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-600 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(250,204,21,0.5)]"
                                    style={{ width: `${combinedProgress}%` }}
                                />
                            </div>

                            <button
                                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                disabled={isCancelling}
                                className="mt-4 px-6 py-2 text-sm font-semibold rounded-full border border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCancelling ? 'Cancelling...' : 'Cancel Processing'}
                            </button>
                        </div>
                    ) : selectedFile ? (
                        <div className="flex flex-col items-center gap-6 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="p-6 rounded-3xl bg-yellow-500/10 border border-yellow-500/30 shadow-[0_0_30px_rgba(250,204,21,0.2)]">
                                <UploadCloud className="w-12 h-12 text-yellow-500" />
                            </div>
                            <div className="text-center w-full">
                                <p className="text-xl font-bold text-white mb-2 tracking-tight truncate px-4">{selectedFile.name}</p>
                                <p className="text-sm text-zinc-400 mb-8 font-medium">
                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready to mix
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                                        className="w-full sm:w-auto px-6 py-3 text-sm font-semibold rounded-xl border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-all shadow-lg"
                                    >
                                        Change File
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleProcessAudio(); }}
                                        className="w-full sm:w-auto px-6 py-3 text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 rounded-xl transition-all shadow-[0_0_20px_rgba(250,204,21,0.3)] hover:shadow-[0_0_30px_rgba(250,204,21,0.5)]"
                                    >
                                        Process Audio
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
                            <div className={`p-6 rounded-3xl transition-all duration-500 ${isDragActive ? 'bg-yellow-500 shadow-[0_0_30px_rgba(250,204,21,0.4)]' : 'bg-white/5 border border-white/10 group-hover:border-yellow-500/50 group-hover:shadow-[0_0_20px_rgba(250,204,21,0.2)]'}`}>
                                <UploadCloud className={`w-12 h-12 transition-colors duration-500 ${isDragActive ? 'text-black' : 'text-zinc-300 group-hover:text-yellow-400'}`} />
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-white mb-3 tracking-tight">
                                    {isDragActive ? 'Drop audio here to replace' : 'Drop your audio file here'}
                                </p>
                                <p className="text-base text-zinc-400 font-medium">
                                    or click to browse (MP3, MPEG, WAV, FLAC)
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                {error && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] p-4 bg-red-950/80 border border-red-500/50 rounded-2xl text-red-200 text-sm font-medium text-center backdrop-blur-md shadow-2xl z-20 flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}
                {cancelSuggestion && !error && !isUploading && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] p-4 bg-zinc-900/90 border border-yellow-500/20 rounded-2xl text-zinc-300 text-sm font-medium text-center backdrop-blur-md shadow-2xl z-20 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <Cpu className="w-4 h-4 shrink-0 text-yellow-500" />
                        <span>{cancelSuggestion}</span>
                        <button
                            onClick={() => setCancelSuggestion(null)}
                            className="ml-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Custom Confirm Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md mx-4 p-6 rounded-3xl bg-zinc-900/95 border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-start gap-4 mb-5">
                            <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 shrink-0">
                                <AlertTriangle className="w-6 h-6 text-yellow-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Replace current session?</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Any unsaved edits, merged tracks, or markers from the current session will be permanently lost.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmReplace}
                                className="px-5 py-2.5 text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 rounded-xl transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
