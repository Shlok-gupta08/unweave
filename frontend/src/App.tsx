import { useState, useEffect, useCallback } from 'react';
import { Github, X } from 'lucide-react';
import axios from 'axios';
import { Uploader } from './components/Uploader';
import { Mixer } from './components/Mixer';
import { getBlobFromDB, saveBlobToDB, deleteBlobFromDB } from './utils/db';
import type { SeparationJob } from './types';

const STORAGE_KEY = 'unweave_session';

interface SavedSession {
  job: SeparationJob | null;
  activeJobId: string | null;
  timestamp: number;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: SavedSession = JSON.parse(raw);
    // Expire completed sessions after 1 hour
    if (session.job && !session.activeJobId) {
      const age = Date.now() - session.timestamp;
      if (age > 3600_000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(job: SeparationJob | null, activeJobId: string | null) {
  const session: SavedSession = { job, activeJobId, timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function App() {
  const [job, setJob] = useState<SeparationJob | null>(null);
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isUploadingNew, setIsUploadingNew] = useState(false);

  // Restore session on mount — checks both localStorage AND the server
  useEffect(() => {
    const restore = async () => {
      // 1. Check localStorage first
      const session = loadSession();
      if (session) {
        if (session.job && !session.activeJobId) {
          // Pre-flight check: verify the server hasn't deleted these files (e.g., 404 on first stem)
          const stemEntries = Object.entries(session.job.stems);
          const firstOriginalStem = stemEntries.find(([name]) => !name.startsWith('Merged'));
          if (firstOriginalStem) {
            try {
              await axios.head(firstOriginalStem[1]);
            } catch (err: any) {
              if (err.response?.status === 404) {
                console.warn('Server stems expired (404). Clearing stale session.');
                clearSession();
                setIsRestoring(false);
                return;
              }
            }
          }

          // Hydrate dynamic dead blob urls
          const hydratedStems = { ...session.job.stems };
          let changed = false;

          for (const [name, _] of Object.entries(hydratedStems)) {
            if (name.startsWith('Merged')) {
              try {
                const blob = await getBlobFromDB(name);
                if (blob && blob.size > 0) {
                  // Ensure explicit MIME type for reliable decoding
                  const safeBlob = new Blob([blob], { type: 'audio/mpeg' });
                  hydratedStems[name as keyof typeof hydratedStems] = URL.createObjectURL(safeBlob);
                  changed = true;
                } else {
                  console.warn('Blob not found or empty for', name);
                  delete hydratedStems[name as keyof typeof hydratedStems];
                  changed = true;
                }
              } catch (e) {
                console.warn('Could not hydrate blob from DB for', name);
                delete hydratedStems[name as keyof typeof hydratedStems];
                changed = true;
              }
            }
          }

          if (changed) {
            session.job.stems = hydratedStems;
            saveSession(session.job, null);
          }

          setJob(session.job);
          setIsRestoring(false);
          return;
        }
        if (session.activeJobId) {
          setResumeJobId(session.activeJobId);
          setIsRestoring(false);
          return;
        }
      }

      // 2. If nothing in localStorage, ask the server for active jobs
      try {
        const res = await axios.get<{ jobs: Record<string, { status: string; progress: number }> }>('/api/jobs');
        const serverJobs = res.data.jobs;
        const activeIds = Object.entries(serverJobs)
          .filter(([, j]) => j.status === 'processing' || j.status === 'uploading')
          .sort(([, a], [, b]) => b.progress - a.progress); // pick the furthest along

        if (activeIds.length > 0) {
          const [activeId] = activeIds[0];
          setResumeJobId(activeId);
          saveSession(null, activeId);
        }

        // Also check for recently completed jobs
        const completedIds = Object.entries(serverJobs)
          .filter(([, j]) => j.status === 'complete');

        if (completedIds.length > 0 && activeIds.length === 0) {
          // Fetch the full status for the completed job to get stems
          const [completedId] = completedIds[0];
          const statusRes = await axios.get(`/api/status/${completedId}`);
          if (statusRes.data.stems) {
            const restoredJob: SeparationJob = {
              job_id: completedId,
              stems: statusRes.data.stems,
              message: statusRes.data.message,
              processing_time: statusRes.data.processing_time,
              device_used: statusRes.data.device_used,
            };
            setJob(restoredJob);
            saveSession(restoredJob, null);
          }
        }
      } catch {
        // Server not reachable — that's fine, just show upload
      }

      setIsRestoring(false);
    };

    restore();
  }, []);

  const handleJobStarted = useCallback((jobId: string) => {
    saveSession(null, jobId);
  }, []);

  const handleComplete = useCallback((data: SeparationJob) => {
    setJob(data);
    setResumeJobId(null);
    saveSession(data, null);
  }, []);


  const handleAddStem = useCallback((name: string, url: string, blob?: Blob) => {
    setJob((prev: SeparationJob | null) => {
      if (!prev) return prev;

      if (blob) {
        saveBlobToDB(name, blob).catch(console.error);
      }

      const nextJob = {
        ...prev,
        stems: {
          ...prev.stems,
          [name]: url
        }
      };

      saveSession(nextJob, null);
      return nextJob;
    });
  }, []);

  const handleSessionExpired = useCallback(() => {
    setResumeJobId(null);
    clearSession();
  }, []);

  const handleClearJob = useCallback(() => {
    setJob(null);
    setResumeJobId(null);
    clearSession();
  }, []);

  const handleRemoveStem = useCallback((name: string) => {
    setJob((prev: SeparationJob | null) => {
      if (!prev) return prev;
      const nextStems = { ...prev.stems };
      delete nextStems[name as keyof typeof nextStems];

      // Clean up IndexedDB
      if (name.startsWith('Merged')) {
        deleteBlobFromDB(name).catch(console.error);
      }

      const nextJob = { ...prev, stems: nextStems };
      saveSession(nextJob, null);
      return nextJob;
    });
  }, []);

  if (isRestoring) return null;

  return (
    <div className="min-h-screen bg-black text-slate-50 font-sans selection:bg-yellow-500/30 pb-20 overflow-x-hidden">
      <header className="fixed w-full bg-black/50 border-b border-white/5 top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-1 group cursor-default">
            <div className="relative h-10 flex items-center justify-center overflow-hidden rounded-xl drop-shadow-[0_0_15px_rgba(250,204,21,0.2)] transition-all duration-500 group-hover:scale-110 group-hover:drop-shadow-[0_0_25px_rgba(255,215,0,0.5)]">
              <img src="/logo_NavBar.png" alt="Unweave Logo" className="h-full w-auto object-contain opacity-75 brightness-75 drop-shadow-md rounded-xl" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent pr-1">
              Unweave
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-zinc-400">
            <a
              href="https://github.com/Shlok-gupta08/unweave"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors duration-300"
            >
              <Github size={18} />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 relative z-10 flex flex-col items-center">
        {/* Soft Golden Spotlight */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-yellow-500/10 blur-[160px] rounded-full pointer-events-none -z-10 opacity-75" />

        <div className="text-center w-full max-w-4xl mx-auto mb-16 sm:mb-24 relative pt-28 sm:pt-40">

          {/* Giant Transparent Background Logo */}
          <div className="absolute -top-[120px] sm:-top-[220px] left-1/2 -translate-x-1/2 w-[360px] sm:w-[700px] h-[360px] sm:h-[700px] pointer-events-none -z-10 opacity-20 flex items-center justify-center animate-in fade-in duration-1000 ease-out fill-mode-both">
            <img
              src="/logo_transparent.png"
              alt="Background Watermark"
              className="w-full h-full object-contain filter drop-shadow-[0_0_100px_rgba(250,204,21,0.4)]"
            />
          </div>

          <h2 className="text-5xl sm:text-8xl lg:text-9xl font-black tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_50px_rgba(255,255,255,0.6)] animate-pulse hover:animate-none transition-all duration-700 cursor-default">
            Unweave
          </h2>
          <p className="text-xl sm:text-2xl md:text-3xl text-yellow-500 font-bold mb-6 tracking-tight drop-shadow-lg px-4">
            Visualize the layers. Isolate the sound.
          </p>
          <p className="text-base sm:text-xl text-zinc-400 font-medium leading-relaxed max-w-2xl mx-auto drop-shadow-md px-4">
            Upload any audio track and instantly isolate <span className="text-zinc-100">Vocals, Drums, Bass, Guitar,</span> and <span className="text-zinc-100">Piano</span>. Studio-grade stem separation powered by AI.
          </p>
        </div>

        <div className="w-full max-w-5xl">
          {job && !isUploadingNew ? (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 fade-out-0">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10 gap-4">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-600">Active Session</h2>
                <button
                  onClick={() => setIsUploadingNew(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                >
                  Upload New File
                </button>
              </div>
              <div className="relative group">
                <Mixer stems={job.stems} onAddStem={handleAddStem} onRemoveStem={handleRemoveStem} />
              </div>
            </div>
          ) : (
            <div className="relative w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 ease-out fill-mode-both">
              {job && isUploadingNew && (
                <button
                  onClick={() => setIsUploadingNew(false)}
                  className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-sm font-medium transition-colors flex items-center gap-2 z-50 text-zinc-300 hover:text-white"
                >
                  <X size={16} /> Cancel and Return to Session
                </button>
              )}
              <Uploader
                onComplete={(data) => {
                  handleComplete(data);
                  setIsUploadingNew(false);
                }}
                onJobStarted={handleJobStarted}
                onSessionExpired={handleSessionExpired}
                onClearJob={handleClearJob}
                resumeJobId={resumeJobId}
                hasActiveSession={!!job}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
