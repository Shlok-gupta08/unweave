import { useState, useEffect, useRef } from 'react';
import { Github, AlertTriangle, RefreshCw, Zap, X } from 'lucide-react';
import { ProcessingModeProvider, useProcessingMode } from './context/ProcessingModeContext';
import { SongLibraryProvider } from './context/SongLibraryContext';
import { TimelineProvider } from './context/TimelineContext';
import { BottomTabBar } from './components/navigation/BottomTabBar';
import { SeparatorWorkspace } from './components/separator/SeparatorWorkspace';
import { TimelineWorkspace } from './components/timeline/TimelineWorkspace';
import { MixerConsoleWorkspace } from './components/mixer/MixerConsoleWorkspace';
import { ExportWorkspace } from './components/export/ExportWorkspace';
import type { WorkspaceTab } from './types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('separate');
  const [showGpuUnavailableModal, setShowGpuUnavailableModal] = useState(false);

  const {
    processingMode,
    setProcessingMode,
    gpuStatus,
    recheckGpuHealth,
    primaryDeviceName,
    primaryGpuAvailable,
    primaryHealthChecked,
  } = useProcessingMode();

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRafRef = useRef(false);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = true;
      requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 40);
        scrollRafRef.current = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleTurboGpuClick = () => {
    // Show user-friendly notice without breaking codebase
    setShowGpuUnavailableModal(true);
  };

  return (
    <div className="min-h-screen bg-black text-slate-50 font-sans selection:bg-yellow-500/30 pb-20 overflow-x-hidden flex flex-col justify-between">
      {/* Fixed Top Header */}
      <header className="fixed w-full bg-black/60 border-b border-white/5 top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-18 flex items-center justify-between">
          <div
            onClick={() => setActiveTab('separate')}
            className="flex items-center gap-2 group cursor-pointer"
          >
            <div className="relative h-9 sm:h-10 flex items-center justify-center overflow-hidden rounded-xl drop-shadow-[0_0_15px_rgba(250,204,21,0.2)] transition-all duration-500 group-hover:scale-105 group-hover:drop-shadow-[0_0_25px_rgba(255,215,0,0.5)]">
              <img src="/logo_NavBar.png" alt="Unweave Logo" className="h-full w-auto object-contain opacity-85 brightness-90 rounded-xl" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unweave
            </h1>
          </div>

          {/* Center Hardware / Mode Info Pill */}
          {primaryHealthChecked && (
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/5 backdrop-blur-md shadow-sm">
              <span className={`w-2 h-2 rounded-full ${primaryGpuAvailable ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse' : 'bg-zinc-500'}`} />
              <span className="text-xs text-zinc-300 font-semibold tracking-tight">
                {primaryGpuAvailable ? (
                  <>Local GPU: <span className="text-yellow-400 font-bold">{primaryDeviceName}</span></>
                ) : (
                  <>Engine: <span className="text-zinc-300">{primaryDeviceName}</span></>
                )}
              </span>
            </div>
          )}

          {/* Right Header: Processing Mode & GitHub Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 text-xs">
              <button
                onClick={() => setProcessingMode('cpu')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  processingMode === 'cpu' ? 'bg-white/15 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Standard (Local)
              </button>
              <button
                onClick={handleTurboGpuClick}
                className="px-2.5 py-1 rounded-lg font-semibold text-zinc-500 hover:text-yellow-400 transition-all cursor-pointer flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                <span>Turbo GPU</span>
              </button>
            </div>

            <a
              href="https://github.com/Shlok-gupta08/unweave"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-300"
            >
              <Github size={18} />
              <span className={`hidden md:inline transition-all duration-300 ${
                isScrolled ? 'md:max-w-0 md:opacity-0' : 'max-w-[80px] opacity-100'
              }`}>
                GitHub
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* GPU Offline Warning Banner */}
      {processingMode === 'gpu' && gpuStatus === 'offline' && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-red-950/90 border-b border-red-500/30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span className="text-red-200 font-medium">GPU backend offline. Switch to Standard (CPU) for separation.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => recheckGpuHealth()}
                className="px-2.5 py-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-[11px] font-semibold flex items-center gap-1"
              >
                <RefreshCw size={10} /> Retry
              </button>
              <button
                onClick={() => setProcessingMode('cpu')}
                className="px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20 text-[11px] font-semibold"
              >
                Use Standard (CPU)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Router */}
      <main className="flex-1 pt-16 sm:pt-18 relative z-10">
        {activeTab === 'separate' && (
          <div className="relative">
            {/* Soft Spotlight glow behind landing section */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-yellow-500/10 blur-[150px] rounded-full pointer-events-none -z-10" />

            {/* Hero Branding Section */}
            <div className="text-center w-full max-w-4xl mx-auto pt-8 sm:pt-14 pb-4 sm:pb-6 px-4">
              <h2 className="text-4xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-3 text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                Unweave
              </h2>
              <p className="text-lg sm:text-2xl text-yellow-500 font-bold mb-3 tracking-tight">
                Visualize the layers. Isolate the sound.
              </p>
              <p className="text-sm sm:text-base text-zinc-400 font-medium max-w-xl mx-auto">
                Batch upload and isolate <span className="text-zinc-100">Vocals, Drums, Bass, Guitar,</span> and <span className="text-zinc-100">Piano</span>. Arrange & mix layers seamlessly in the Timeline Studio.
              </p>
            </div>

            <SeparatorWorkspace onNavigateToEditor={() => setActiveTab('editor')} />
          </div>
        )}

        {activeTab === 'editor' && (
          <TimelineWorkspace onNavigateToExport={() => setActiveTab('export')} />
        )}

        {activeTab === 'mixer' && (
          <MixerConsoleWorkspace />
        )}

        {activeTab === 'export' && (
          <ExportWorkspace />
        )}
      </main>

      {/* Persistent Bottom DaVinci Resolve Style Workspace Navigation */}
      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Turbo GPU Unavailable Notice Dialog */}
      {showGpuUnavailableModal && (
        <div
          onClick={() => setShowGpuUnavailableModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-yellow-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-yellow-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start justify-between">
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-400">
                <Zap className="w-6 h-6" />
              </div>
              <button
                onClick={() => setShowGpuUnavailableModal(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <h3 className="text-lg font-black text-white tracking-tight">Turbo GPU Mode Offline</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                External cloud GPU acceleration is currently offline because the third-party provider is deprecated.
              </p>
              <p className="text-xs sm:text-sm text-zinc-300 mt-2 font-medium">
                Separation will continue using your fast local device ({primaryDeviceName}) with full audio fidelity.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowGpuUnavailableModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-yellow-500 text-black hover:bg-yellow-400 transition-all cursor-pointer shadow-[0_0_15px_rgba(250,204,21,0.3)]"
              >
                Understood, Continue Locally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ProcessingModeProvider>
      <SongLibraryProvider>
        <TimelineProvider>
          <AppContent />
        </TimelineProvider>
      </SongLibraryProvider>
    </ProcessingModeProvider>
  );
}

export default App;
