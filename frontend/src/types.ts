export interface Stems {
    Vocals?: string;
    Drums?: string;
    Bass?: string;
    Guitar?: string;
    Piano?: string;
    Other?: string;
}

export interface SeparationJob {
    job_id: string;
    stems: Stems;
    message?: string;
    processing_time?: number;
    device_used?: string;
}

export interface JobStatus {
    status: 'uploading' | 'processing' | 'complete' | 'error' | 'cancelled';
    progress: number;
    eta_seconds: number | null;
    message: string;
    stems: Stems | null;
    processing_time: number | null;
    device_used: string;
}
