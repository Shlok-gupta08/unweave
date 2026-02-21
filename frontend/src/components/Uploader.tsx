import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Cpu, Zap, Clock, AlertCircle } from 'lucide-react';
import axios from 'axios';
import type { SeparationJob, JobStatus } from '../types';

interface UploaderProps {
    onComplete: (data: SeparationJob) => void;
    onJobStarted?: (jobId: string) => void;
    resumeJobId?: string | null;
}

export const Uploader: React.FC<UploaderProps> = ({ onComplete, onJobStarted, resumeJobId }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [deviceUsed, setDeviceUsed] = useState('');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // Resume a job from localStorage on mount
    useEffect(() => {
        if (resumeJobId && !jobId) {
            setIsUploading(true);
            setJobId(resumeJobId);
            setStatusMessage('Reconnecting to active job...');
        }
    }, [resumeJobId, jobId]);

    // Poll for job status
    useEffect(() => {
        if (!jobId) return;

        const poll = async () => {
            try {
                const res = await axios.get<JobStatus>(`/api/status/${jobId}`);
                const data = res.data;

                setProgress(data.progress);
                setEtaSeconds(data.eta_seconds);
                setStatusMessage(data.message);
                if (data.device_used) setDeviceUsed(data.device_used);

                if (data.status === 'complete' && data.stems) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setJobId(null);

                    onComplete({
                        job_id: jobId,
                        stems: data.stems,
                        message: data.message,
                        processing_time: data.processing_time ?? undefined,
                        device_used: data.device_used ?? undefined,
                    });
                } else if (data.status === 'error') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setJobId(null);
                    setError(data.message || 'Separation failed');
                }
            } catch (err) {
                // If 404, the job no longer exists on the server (server restarted)
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setIsUploading(false);
                    setJobId(null);
                    setError('Session expired — the server was restarted. Please upload again.');
                }
                // Other errors: keep polling (temporary network blip)
            }
        };

        pollingRef.current = setInterval(poll, 1000);
        poll();

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [jobId, onComplete]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);
        setProgress(0);
        setEtaSeconds(null);
        setStatusMessage('Uploading file...');
        setDeviceUsed('');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post<{ job_id: string; message: string }>('/api/separate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newJobId = response.data.job_id;
            setJobId(newJobId);
            setStatusMessage('Processing started...');
            // Notify App so it can persist the job_id
            onJobStarted?.(newJobId);
        } catch (err) {
            console.error(err);
            setIsUploading(false);
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.error || 'Failed to upload audio.');
            } else {
                setError('Failed to upload audio.');
            }
        }
    }, [onJobStarted]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/mpeg': ['.mp3', '.mpeg', '.mpg', '.mpga', '.mpega'],
            'audio/wav': ['.wav'],
            'audio/flac': ['.flac']
        },
        maxFiles: 1,
        disabled: isUploading
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
        <div className="w-full max-w-3xl mx-auto p-1 backdrop-blur-3xl rounded-[2.5rem] bg-white/[0.02] border border-white/5 shadow-2xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div
                {...(isUploading ? {} : getRootProps())}
                className={`flex flex-col items-center justify-center p-16 sm:p-24 border border-dashed rounded-[2rem] transition-all duration-500 relative z-10 ${isDragActive ? 'border-yellow-500/50 bg-yellow-500/10 scale-[0.98]' : 'border-white/10 hover:border-yellow-500/30 hover:bg-white/[0.03]'} ${isUploading ? 'opacity-100 cursor-default border-yellow-500/30' : 'cursor-pointer'}`}
            >
                {!isUploading && <input {...getInputProps()} />}

                {isUploading ? (
                    <div className="flex flex-col items-center gap-6 w-full max-w-md">
                        {/* Progress ring */}
                        <div className="relative">
                            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50" cy="50" r="42"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.05)"
                                    strokeWidth="6"
                                />
                                <circle
                                    cx="50" cy="50" r="42"
                                    fill="none"
                                    stroke="url(#progressGradient)"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 42}`}
                                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                                    className="transition-all duration-700 ease-out"
                                />
                                <defs>
                                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#facc15" />
                                        <stop offset="100%" stopColor="#a855f7" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-black text-white tabular-nums">
                                    {progress}%
                                </span>
                            </div>
                        </div>

                        {/* Status text */}
                        <div className="text-center space-y-2">
                            <p className="text-xl font-bold text-white tracking-tight">
                                {statusMessage || 'Separating Stems...'}
                            </p>
                            <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                                <Clock className="w-4 h-4" />
                                <span>{formatETA(etaSeconds)}</span>
                            </div>
                            {deviceUsed && (
                                <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                                    {getDeviceIcon()}
                                    <span>{getDeviceLabel()}</span>
                                </div>
                            )}
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-yellow-500 via-yellow-400 to-purple-500 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(250,204,21,0.5)]"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-6">
                        <div className={`p-6 rounded-3xl transition-all duration-500 ${isDragActive ? 'bg-yellow-500 shadow-[0_0_30px_rgba(250,204,21,0.4)]' : 'bg-white/5 border border-white/10 group-hover:border-yellow-500/50 group-hover:shadow-[0_0_20px_rgba(250,204,21,0.2)]'}`}>
                            <UploadCloud className={`w-12 h-12 transition-colors duration-500 ${isDragActive ? 'text-black' : 'text-zinc-300 group-hover:text-yellow-400'}`} />
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white mb-3 tracking-tight">
                                {isDragActive ? 'Drop audio here' : 'Drop your audio file here'}
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
        </div>
    );
};
