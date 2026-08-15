import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import axios from 'axios';
import { isGpuAvailable, checkGpuHealth, getBaseUrl, type ProcessingMode } from '../utils/api';

const STORAGE_KEY = 'unweave_processing_mode';

type GpuStatus = 'unchecked' | 'checking' | 'online' | 'offline';

interface ProcessingModeContextValue {
    processingMode: ProcessingMode;
    setProcessingMode: (mode: ProcessingMode) => void;
    gpuAvailable: boolean;
    gpuStatus: GpuStatus;
    recheckGpuHealth: () => Promise<void>;
    primaryDeviceType: string;
    primaryDeviceName: string;
    primaryGpuAvailable: boolean;
    primaryHealthChecked: boolean;
}

const ProcessingModeContext = createContext<ProcessingModeContextValue>({
    processingMode: 'cpu',
    setProcessingMode: () => { },
    gpuAvailable: false,
    gpuStatus: 'unchecked',
    recheckGpuHealth: async () => { },
    primaryDeviceType: 'cpu',
    primaryDeviceName: 'CPU',
    primaryGpuAvailable: false,
    primaryHealthChecked: false,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useProcessingMode() {
    return useContext(ProcessingModeContext);
}

export function ProcessingModeProvider({ children }: { children: ReactNode }) {
    const gpuAvailable = isGpuAvailable();
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('unchecked');

    // Primary/Local Backend State
    const [primaryDeviceType, setPrimaryDeviceType] = useState<string>('cpu');
    const [primaryDeviceName, setPrimaryDeviceName] = useState<string>('CPU');
    const [primaryGpuAvailable, setPrimaryGpuAvailable] = useState<boolean>(false);
    const [primaryHealthChecked, setPrimaryHealthChecked] = useState<boolean>(false);

    const [processingMode, setProcessingModeState] = useState<ProcessingMode>(() => {
        if (!gpuAvailable) return 'cpu';
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'gpu' || saved === 'cpu') return saved;
        } catch {
            // localStorage unavailable
        }
        return 'cpu';
    });

    // Fetch primary backend health/hardware info
    useEffect(() => {
        const fetchPrimaryHealth = async () => {
            try {
                const base = getBaseUrl();
                const res = await axios.get<{
                    device_type: string;
                    device_name: string;
                    gpu_available: boolean;
                }>(`${base}/api/health`);
                
                if (res.data) {
                    setPrimaryDeviceType(res.data.device_type || 'cpu');
                    setPrimaryDeviceName(res.data.device_name || 'CPU');
                    setPrimaryGpuAvailable(!!res.data.gpu_available);
                }
            } catch (err) {
                console.error('Failed to fetch primary backend health/hardware info:', err);
            } finally {
                setPrimaryHealthChecked(true);
            }
        };

        fetchPrimaryHealth();
    }, []);

    // Health-check the GPU backend
    const recheckGpuHealth = useCallback(async () => {
        if (!gpuAvailable) {
            setGpuStatus('unchecked');
            return;
        }
        setGpuStatus('checking');
        const healthy = await checkGpuHealth();
        setGpuStatus(healthy ? 'online' : 'offline');
    }, [gpuAvailable]);

    const setProcessingMode = useCallback((mode: ProcessingMode) => {
        // If GPU is not available, force CPU
        const finalMode = !gpuAvailable && mode === 'gpu' ? 'cpu' : mode;
        setProcessingModeState(finalMode);
        try {
            localStorage.setItem(STORAGE_KEY, finalMode);
        } catch {
            // localStorage unavailable
        }

        // When switching TO GPU, run a health check
        if (finalMode === 'gpu') {
            recheckGpuHealth();
        }
    }, [gpuAvailable, recheckGpuHealth]);

    // If GPU becomes unavailable (env change / rebuild), fall back to CPU
    // This is intentional: we need to sync state when external config changes
    useEffect(() => {
        if (!gpuAvailable && processingMode === 'gpu') {
            setProcessingModeState('cpu');
        }
    }, [gpuAvailable, processingMode]);

    // Check GPU health on mount if GPU mode is already selected
    useEffect(() => {
        if (gpuAvailable && processingMode === 'gpu') {
            recheckGpuHealth();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ProcessingModeContext.Provider value={{
            processingMode,
            setProcessingMode,
            gpuAvailable,
            gpuStatus,
            recheckGpuHealth,
            primaryDeviceType,
            primaryDeviceName,
            primaryGpuAvailable,
            primaryHealthChecked,
        }}>
            {children}
        </ProcessingModeContext.Provider>
    );
}
