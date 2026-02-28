import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

// ── Runtime Config ──
// In production, window.__UNWEAVE_CONFIG__ is generated at container start
// by docker-entrypoint.sh. In development, it may not exist.
interface UnweaveConfig {
  gpuAvailable: boolean;
}

declare global {
  interface Window {
    __UNWEAVE_CONFIG__?: UnweaveConfig;
  }
}

export type ProcessingMode = 'cpu' | 'gpu';

/**
 * Returns true if a GPU backend is configured.
 * - In production: reads from runtime-config.js (generated at container start)
 * - In development: reads from VITE_GPU_BACKEND_URL env var
 */
export function isGpuAvailable(): boolean {
  // Runtime config takes priority (production containers)
  if (window.__UNWEAVE_CONFIG__?.gpuAvailable) {
    return true;
  }
  // Fallback to Vite build-time env var (local development)
  const devGpuUrl = import.meta.env.VITE_GPU_BACKEND_URL || '';
  return devGpuUrl.trim().length > 0;
}

/**
 * Returns the API prefix path for the given processing mode.
 *
 * In production (nginx):
 *   CPU → /api/   (proxied to BACKEND_URL)
 *   GPU → /gpu-api/ (proxied to GPU_BACKEND_URL)
 *
 * In development (Vite proxy):
 *   CPU → /api/   (proxied via vite.config.ts)
 *   GPU → /gpu-api/ (proxied via vite.config.ts)
 */
export function getApiPrefix(mode: ProcessingMode): string {
  if (mode === 'gpu' && isGpuAvailable()) {
    return '/gpu-api';
  }
  return '/api';
}

/**
 * Makes a GET request to the correct backend based on the processing mode.
 */
export async function apiGet<T>(
  path: string,
  mode: ProcessingMode,
  config?: AxiosRequestConfig
): Promise<AxiosResponse<T>> {
  const prefix = getApiPrefix(mode);
  return axios.get<T>(`${prefix}${path}`, config);
}

/**
 * Makes a POST request to the correct backend based on the processing mode.
 */
export async function apiPost<T>(
  path: string,
  data?: unknown,
  mode: ProcessingMode = 'cpu',
  config?: AxiosRequestConfig
): Promise<AxiosResponse<T>> {
  const prefix = getApiPrefix(mode);
  return axios.post<T>(`${prefix}${path}`, data, config);
}

/**
 * Checks if the GPU backend is reachable.
 * Returns true if healthy, false if down/unreachable.
 * Uses a short timeout so it doesn't block the UI.
 * Hits the root endpoint (/) as a lightweight health probe.
 */
export async function checkGpuHealth(): Promise<boolean> {
  try {
    await axios.get('/gpu-api/health', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes a HEAD request (used for stem health-checks).
 * These always use the same backend that originally processed the audio.
 */
export async function apiHead(
  url: string,
  config?: AxiosRequestConfig
): Promise<AxiosResponse> {
  return axios.head(url, config);
}
