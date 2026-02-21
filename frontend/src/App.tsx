import { useState } from 'react';
import { Uploader } from './components/Uploader';
import { Mixer } from './components/Mixer';
import type { SeparationJob } from './types';

function App() {
  const [job, setJob] = useState<SeparationJob | null>(null);

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
            {/* Links removed as per user request */}
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
              <Uploader onComplete={setJob} />
            </div>
          ) : (
            <div className="w-full animate-in fade-in slide-in-from-bottom-12 duration-700 ease-out">
              <div className="flex items-center justify-between w-full mb-8 px-2 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-8 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                  <h3 className="text-3xl font-bold tracking-tight text-white">Studio Mix</h3>
                </div>
                <button
                  onClick={() => setJob(null)}
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
