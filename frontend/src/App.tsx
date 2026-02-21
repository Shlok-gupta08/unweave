import { useState, useEffect, useCallback } from 'react';
import { Github } from 'lucide-react';
import axios from 'axios';
import { Uploader } from './components/Uploader';
import { Mixer } from './components/Mixer';
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

  // Restore session on mount — checks both localStorage AND the server
  useEffect(() => {
    const restore = async () => {
      // 1. Check localStorage first
      const session = loadSession();
      if (session) {
        if (session.job && !session.activeJobId) {
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

  const handleReset = useCallback(() => {
    setJob(null);
    setResumeJobId(null);
    clearSession();
  }, []);

  if (isRestoring) return null;

  return (
    <div className="min-h-screen bg-black text-slate-50 font-sans selection:bg-yellow-500/30 pb-20 overflow-x-hidden">
      <header className="fixed w-full bg-black/50 border-b border-white/5 top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
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

      <main className="max-w-7xl mx-auto px-6 pt-32 relative z-10 flex flex-col items-center">
        {/* Ambient Glows */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-yellow-500/5 blur-[150px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-40 left-1/2 -translate-x-[60%] w-[600px] h-[400px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="text-center w-full max-w-4xl mx-auto mb-24 relative pt-40">

          {/* Giant Transparent Background Logo */}
          {!job && (
            <div className="absolute -top-[220px] left-1/2 -translate-x-1/2 w-[700px] h-[700px] pointer-events-none -z-10 opacity-20 flex items-center justify-center animate-in fade-in duration-1000 ease-out fill-mode-both">
              <img
                src="/logo_transparent.png"
                alt="Background Watermark"
                className="w-full h-full object-contain filter drop-shadow-[0_0_100px_rgba(250,204,21,0.4)]"
              />
            </div>
          )}

          <h2 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:drop-shadow-[0_0_50px_rgba(255,255,255,0.6)] animate-pulse hover:animate-none transition-all duration-700 cursor-default">
            Unweave
          </h2>
          <p className="text-2xl sm:text-3xl text-yellow-500 font-bold mb-6 tracking-tight drop-shadow-lg">
            Visualize the layers. Isolate the sound.
          </p>
          <p className="text-lg sm:text-xl text-zinc-400 font-medium leading-relaxed max-w-2xl mx-auto drop-shadow-md">
            Upload any audio track and instantly isolate <span className="text-zinc-100">Vocals, Drums, Bass, Guitar,</span> and <span className="text-zinc-100">Piano</span>. Studio-grade stem separation powered by AI.
          </p>
        </div>

        <div className="w-full max-w-5xl">
          {!job ? (
            <div className="relative w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 ease-out fill-mode-both">
              <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/10 via-purple-500/10 to-transparent rounded-[2rem] blur-xl opacity-50" />
              <Uploader
                onComplete={handleComplete}
                onJobStarted={handleJobStarted}
                resumeJobId={resumeJobId}
              />
            </div>
          ) : (
            <div className="w-full animate-in fade-in slide-in-from-bottom-12 duration-700 ease-out">
              <div className="flex items-center justify-between w-full mb-8 px-2 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                  <h3 className="text-3xl font-bold tracking-tight text-white">Studio Mix</h3>
                  {job.processing_time && (
                    <span className="text-sm text-zinc-500 font-medium ml-2">
                      Processed in {job.processing_time}s
                      {job.device_used && ` on ${job.device_used.toUpperCase()}`}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 text-sm font-bold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-zinc-300 hover:text-white shadow-lg backdrop-blur-md"
                >
                  Upload New File
                </button>
              </div>
              <Mixer stems={job.stems} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
