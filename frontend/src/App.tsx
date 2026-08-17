import { useState, useEffect, useRef } from 'react';
import { Github, AlertTriangle, RefreshCw, Zap, X } from 'lucide-react';
import { ProcessingModeProvider, useProcessingMode } from './context/ProcessingModeContext';
import { SongLibraryProvider, useSongLibrary } from './context/SongLibraryContext';
import { TimelineProvider, useTimeline } from './context/TimelineContext';
import { BottomTabBar } from './components/navigation/BottomTabBar';
import { SeparatorWorkspace } from './components/separator/SeparatorWorkspace';
import { TimelineWorkspace } from './components/timeline/TimelineWorkspace';
import { MixerConsoleWorkspace } from './components/mixer/MixerConsoleWorkspace';
import { Spatial8DMixerWorkspace } from './components/spatial/Spatial8DMixerWorkspace';
import { ExportWorkspace } from './components/export/ExportWorkspace';
import { ProjectRecoveryModal } from './components/modals/ProjectRecoveryModal';
import { ProjectManagerModal } from './components/modals/ProjectManagerModal';
import { EngineSetupModal } from './components/modals/EngineSetupModal';
import { projectStorage } from './services/projectStorage';
import { audioEngine } from './services/audioEngine';
import type { WorkspaceTab, AutoSaveInfo, EngineState } from './types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('separate');
  const [showGpuUnavailableModal, setShowGpuUnavailableModal] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState<AutoSaveInfo | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [isGlobalProjectModalOpen, setIsGlobalProjectModalOpen] = useState(false);
  const [globalProjectModalMode, setGlobalProjectModalMode] = useState<'manage' | 'save-as' | 'open'>('manage');
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [showEngineModal, setShowEngineModal] = useState(false);

  const {
    processingMode,
    setProcessingMode,
    gpuStatus,
    recheckGpuHealth,
    primaryDeviceName,
    primaryGpuAvailable,
    primaryHealthChecked,
  } = useProcessingMode();

  const { restoreSongsState } = useSongLibrary();
  const { restoreProjectState, clearTimeline } = useTimeline();

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRafRef = useRef(false);
  const hasCheckedAutoSaveRef = useRef(false);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.electronAPI?.isDesktop);

  // Monitor desktop AI engine state and first-launch setup
  useEffect(() => {
    if (isDesktop && window.electronAPI?.getEngineStatus) {
      window.electronAPI.getEngineStatus().then((state) => {
        setEngineState(state);
        if (state.status === 'needs-setup' || state.status === 'installing' || state.status === 'error') {
          setShowEngineModal(true);
        }
      }).catch(() => {});

      if (window.electronAPI.onEngineStatus) {
        const unsub = window.electronAPI.onEngineStatus((state) => {
          setEngineState(state);
          if (state.status === 'needs-setup' || state.status === 'installing' || state.status === 'error') {
            setShowEngineModal(true);
          } else if (state.status === 'ready') {
            setTimeout(() => {
              setShowEngineModal(false);
              recheckGpuHealth().catch(() => {});
            }, 1200);
          }
        });
        return unsub;
      }
    }
  }, [isDesktop, recheckGpuHealth]);

  // Check for auto-saved project session strictly ONCE on initial cold start
  useEffect(() => {
    if (hasCheckedAutoSaveRef.current) return;
    hasCheckedAutoSaveRef.current = true;

    async function checkColdStartAutoSave() {
      try {
        const info = await projectStorage.getAutoSaveInfo();
        if (info.exists && info.meta) {
          if ((info.meta.songCount ?? 0) > 0 || info.meta.trackCount > 0 || info.meta.stemCount > 0) {
            setRecoveryInfo(info);
            setShowRecoveryModal(true);
          }
        }
      } catch (err) {
        console.warn('AutoSave check failed', err);
      }
    }
    checkColdStartAutoSave();
  }, []);

  const handleRestoreSession = async () => {
    try {
      const session = await projectStorage.loadAutoSaveSession();
      if (session) {
        if (session.songs && session.songs.length > 0) {
          await restoreSongsState(session.songs);
        }
        if (session.timelineProject) {
          await restoreProjectState(session.timelineProject);
          if (session.timelineProject.tracks.length > 0) {
            setActiveTab('editor');
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore autosaved session', err);
    } finally {
      setShowRecoveryModal(false);
      setRecoveryInfo(null);
    }
  };

  const handleDiscardSession = async () => {
    try {
      await projectStorage.clearAutoSaveSession();
      await projectStorage.resetAllAppState();
      restoreSongsState([]);
      clearTimeline();
    } catch (err) {
      console.warn('Failed to clear autosaved session', err);
    } finally {
      setShowRecoveryModal(false);
      setRecoveryInfo(null);
    }
  };

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

  // Listen to native macOS desktop menu actions
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onMenuAction) {
      const unsubscribe = window.electronAPI.onMenuAction((action, payload) => {
        if (action === 'navigate' && typeof payload === 'string') {
          const targetTab = payload === 'timeline' ? 'editor' : (payload as WorkspaceTab);
          setActiveTab(targetTab);
        } else if (action === 'import-audio') {
          setActiveTab('separate');
          setTimeout(() => {
            const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
            if (fileInput) {
              fileInput.click();
            }
          }, 80);
        } else if (action === 'export-mixdown' || action === 'export-all-stems') {
          setActiveTab('export');
        } else if (action === 'new-project') {
          setGlobalProjectModalMode('manage');
          setIsGlobalProjectModalOpen(true);
        } else if (action === 'save-project-as') {
          setGlobalProjectModalMode('save-as');
          setIsGlobalProjectModalOpen(true);
        } else if (action === 'open-project-manager') {
          setGlobalProjectModalMode('manage');
          setIsGlobalProjectModalOpen(true);
        } else if (action === 'open-engine-setup') {
          setShowEngineModal(true);
        }
      });
      return unsubscribe;
    }
  }, []);

  const handleTurboGpuClick = () => {
    // Show user-friendly notice without breaking codebase
    setShowGpuUnavailableModal(true);
  };

  // Switch between Standard Stereo (Timeline/Mixer) and 360° 8D Audio (Spatial Tab)
  useEffect(() => {
    audioEngine.setPlaybackMode(activeTab === 'spatial' ? '8d' : 'stereo');
  }, [activeTab]);

  return (
    <div className={`min-h-screen bg-black text-slate-50 font-sans selection:bg-yellow-500/30 overflow-x-hidden flex flex-col justify-between ${
      activeTab === 'separate' || activeTab === 'export' ? 'pb-16' : 'pb-14'
    }`}>
      {/* Fixed Top Header */}
      <header
        className="fixed w-full bg-black/60 border-b border-white/5 top-0 z-50 backdrop-blur-xl"
        style={isDesktop ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}
      >
        <div className={`w-full ${isDesktop ? 'pl-24 sm:pl-28 pr-4 sm:pr-8' : 'px-4 sm:px-8'} h-14 sm:h-16 flex items-center justify-between`}>
          <div
            onClick={() => setActiveTab('separate')}
            className="flex items-center gap-2.5 group cursor-pointer"
            style={isDesktop ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
          >
            <div className="relative h-10 sm:h-12 flex items-center justify-center overflow-hidden rounded-xl drop-shadow-[0_0_15px_rgba(250,204,21,0.25)] transition-all duration-300 group-hover:scale-105">
              <img src="./logo_NavBar.png" alt="Unweave Logo" className="h-full w-auto object-contain rounded-xl" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tighter bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unweave
            </h1>
          </div>

          {/* Center Hardware / Mode Info Pill */}
          {primaryHealthChecked && (
            <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/5 backdrop-blur-md shadow-sm">
              <span className={`w-2 h-2 rounded-full ${primaryGpuAvailable ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse' : 'bg-zinc-500'}`} />
              <span className="text-[11px] text-zinc-300 font-semibold tracking-tight">
                {primaryGpuAvailable ? (
                  <>Local GPU: <span className="text-yellow-400 font-bold">{primaryDeviceName}</span></>
                ) : (
                  <>Engine: <span className="text-zinc-300">{primaryDeviceName}</span></>
                )}
              </span>
            </div>
          )}

          {/* Right Header: Processing Mode & GitHub Link */}
          <div
            className="flex items-center gap-2.5"
            style={isDesktop ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
          >
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 text-xs">
              <button
                onClick={() => setProcessingMode('cpu')}
                className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  processingMode === 'cpu' ? 'bg-white/15 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {primaryGpuAvailable ? 'Local (GPU)' : 'Local (Standard)'}
              </button>
              <button
                onClick={handleTurboGpuClick}
                className="px-2.5 py-0.5 rounded-lg text-xs font-semibold text-zinc-500 hover:text-yellow-400 transition-all cursor-pointer flex items-center gap-1"
              >
                <Zap className="w-2.5 h-2.5" />
                <span>Turbo Cloud</span>
              </button>
            </div>

            <a
              href="https://github.com/Shlok-gupta08/unweave"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors duration-300"
            >
              <Github size={16} />
              <span className={`hidden md:inline transition-all duration-300 ${
                isScrolled ? 'md:max-w-0 md:opacity-0' : 'max-w-[70px] opacity-100'
              }`}>
                GitHub
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* GPU Offline Warning Banner */}
      {processingMode === 'gpu' && gpuStatus === 'offline' && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-red-950/90 border-b border-red-500/30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span className="text-red-200 font-medium">Turbo Cloud GPU offline. Switch to Local Engine for separation.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => recheckGpuHealth()}
                className="px-2 py-0.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-[11px] font-semibold flex items-center gap-1"
              >
                <RefreshCw size={10} /> Retry
              </button>
              <button
                onClick={() => setProcessingMode('cpu')}
                className="px-2 py-0.5 rounded-lg bg-white/10 text-white hover:bg-white/20 text-[11px] font-semibold"
              >
                Use Local Engine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Router */}
      <main className="flex-1 pt-14 sm:pt-16 relative z-10">
        {activeTab === 'separate' && (
          <div className="relative">
            {/* Soft Spotlight glow behind landing section */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-yellow-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

            {/* Hero Branding Section - Compact Studio Sizing */}
            <div className="text-center w-full max-w-3xl mx-auto pt-4 sm:pt-8 pb-2 sm:pb-3 px-4">
              <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Unweave
              </h2>
              <p className="text-base sm:text-xl text-yellow-500 font-bold mb-2 tracking-tight">
                Visualize the layers. Isolate the sound.
              </p>
              <p className="text-xs sm:text-sm text-zinc-400 font-medium max-w-lg mx-auto">
                Batch upload and isolate <span className="text-zinc-100 font-semibold">Vocals, Drums, Bass, Guitar, Piano & Other</span>.
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

        {activeTab === 'spatial' && (
          <Spatial8DMixerWorkspace />
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

      {/* Project Auto-Save Startup Recovery Modal */}
      {showRecoveryModal && recoveryInfo && (
        <ProjectRecoveryModal
          info={recoveryInfo}
          onRestore={handleRestoreSession}
          onDiscard={handleDiscardSession}
        />
      )}

      {/* Global Project Manager Modal */}
      <ProjectManagerModal
        isOpen={isGlobalProjectModalOpen}
        onClose={() => setIsGlobalProjectModalOpen(false)}
        initialMode={globalProjectModalMode}
      />

      {/* Desktop AI Engine First-Launch Setup / Maintenance Modal */}
      {showEngineModal && engineState && (
        <EngineSetupModal
          engineState={engineState}
          onStartInstall={() => window.electronAPI?.startEngineInstall?.()}
          onRepair={() => window.electronAPI?.repairEngine?.()}
          onClose={() => setShowEngineModal(false)}
        />
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
