import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { isGpuAvailable, checkGpuHealth, type ProcessingMode } from '../utils/api';

const STORAGE_KEY = 'unweave_processing_mode';

type GpuStatus = 'unchecked' | 'checking' | 'online' | 'offline';

interface ProcessingModeContextValue {
    processingMode: ProcessingMode;
    setProcessingMode: (mode: ProcessingMode) => void;
    gpuAvailable: boolean;
    gpuStatus: GpuStatus;
    recheckGpuHealth: () => Promise<void>;
}

const ProcessingModeContext = createContext<ProcessingModeContextValue>({
    processingMode: 'cpu',
    setProcessingMode: () => { },
    gpuAvailable: false,
    gpuStatus: 'unchecked',
    recheckGpuHealth: async () => { },
});

export function useProcessingMode() {
    return useContext(ProcessingModeContext);
}

export function ProcessingModeProvider({ children }: { children: ReactNode }) {
    const gpuAvailable = isGpuAvailable();
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('unchecked');

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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ProcessingModeContext.Provider value={{
            processingMode,
            setProcessingMode,
            gpuAvailable,
            gpuStatus,
            recheckGpuHealth,
        }}>
            {children}
        </ProcessingModeContext.Provider>
    );
}
