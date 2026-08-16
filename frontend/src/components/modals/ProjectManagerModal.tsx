import React, { useState, useEffect } from 'react';
import {
    Folder, Plus, Save, Trash2, X, Clock, Disc, ArrowRight,
    RefreshCw, Check
} from 'lucide-react';
import { projectStorage } from '../../services/projectStorage';
import { useTimeline } from '../../context/TimelineContext';
import { useSongLibrary } from '../../context/SongLibraryContext';
import type { AutoSaveMeta } from '../../types';

interface ProjectManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: 'manage' | 'save-as' | 'open';
}

type ProjectMetaItem = AutoSaveMeta & { id: string; createdAt: number };

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
    isOpen,
    onClose,
    initialMode = 'manage',
}) => {
    const { project, restoreProjectState, clearTimeline } = useTimeline();
    const { songs, restoreSongsState } = useSongLibrary();

    const [mode, setMode] = useState<'manage' | 'save-as' | 'open'>(initialMode);
    const [savedProjects, setSavedProjects] = useState<ProjectMetaItem[]>([]);
    const [projectNameInput, setProjectNameInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const loadProjectsList = async () => {
        const list = await projectStorage.listCustomProjects();
        setSavedProjects(list);
    };

    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            loadProjectsList();
            setProjectNameInput(`Studio Project ${new Date().toLocaleDateString()}`);
            setSaveSuccess(false);
        }
    }, [isOpen, initialMode]);

    if (!isOpen) return null;

    const handleSaveAs = async () => {
        if (!projectNameInput.trim()) return;
        setIsSaving(true);
        try {
            await projectStorage.saveCustomProject(projectNameInput.trim(), project, songs);
            setSaveSuccess(true);
            await loadProjectsList();
            setTimeout(() => {
                setSaveSuccess(false);
                setMode('manage');
            }, 1000);
        } catch (err) {
            console.error('Failed to save custom project', err);
            alert('Failed to save project');
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenProject = async (id: string) => {
        try {
            const data = await projectStorage.loadCustomProject(id);
            if (data) {
                if (data.songs && data.songs.length > 0) {
                    await restoreSongsState(data.songs);
                }
                if (data.timelineProject) {
                    await restoreProjectState(data.timelineProject);
                }
                onClose();
            }
        } catch (err) {
            console.error('Failed to open project', err);
            alert('Failed to open project');
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to permanently delete this project?')) {
            await projectStorage.deleteCustomProject(id);
            await loadProjectsList();
        }
    };

    const handleNewProject = () => {
        if (confirm('Start a new project? Any unsaved changes in current timeline will be cleared.')) {
            clearTimeline();
            onClose();
        }
    };

    const handleFreshStart = async () => {
        if (confirm('Perform a Complete Fresh Start? This will purge legacy caches, autosaves, and reset to a clean slate.')) {
            await projectStorage.resetAllAppState();
            clearTimeline();
            window.location.reload();
        }
    };

    const formatTimeAgo = (timestamp: number): string => {
        if (!timestamp) return 'Earlier';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="bg-zinc-950 border border-white/15 rounded-3xl w-full max-w-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] p-6 sm:p-8 relative space-y-6 animate-in zoom-in-95 duration-200 overflow-hidden"
            >
                {/* Background Ambient Glow */}
                <div className="absolute -top-20 -right-20 w-52 h-52 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                            <Folder className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">Project Management</h3>
                            <p className="text-xs text-zinc-400">Save, load, and manage custom multi-track studio projects</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Navigation Pills */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl p-1">
                        <button
                            onClick={() => setMode('manage')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mode === 'manage' ? 'bg-yellow-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Saved Projects ({savedProjects.length})
                        </button>
                        <button
                            onClick={() => setMode('save-as')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                mode === 'save-as' ? 'bg-yellow-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Save As...
                        </button>
                    </div>

                    <button
                        onClick={handleNewProject}
                        className="px-3 py-1.5 rounded-xl border border-white/10 hover:border-yellow-500/40 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-200 hover:text-yellow-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Project</span>
                    </button>
                </div>

                {/* Mode: Save As */}
                {mode === 'save-as' && (
                    <div className="space-y-4 py-2 animate-in fade-in duration-200">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Project Name</label>
                            <input
                                type="text"
                                value={projectNameInput}
                                onChange={(e) => setProjectNameInput(e.target.value)}
                                placeholder="Enter project name..."
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveAs()}
                                className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-yellow-500/50"
                            />
                        </div>

                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl text-xs text-zinc-400 flex items-center justify-between">
                            <span>Includes {project.tracks.length} Tracks & {project.clips.length} Clips</span>
                            <span className="text-yellow-400 font-mono font-bold">Lossless State</span>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setMode('manage')}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAs}
                                disabled={isSaving || !projectNameInput.trim()}
                                className="px-5 py-2.5 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 font-bold text-xs flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(250,204,21,0.25)] disabled:opacity-50"
                            >
                                {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Project'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Mode: Manage / Open Projects */}
                {mode === 'manage' && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                        {savedProjects.length === 0 ? (
                            <div className="text-center py-10 px-4 rounded-2xl border border-white/5 bg-white/[0.02] space-y-2">
                                <Folder className="w-8 h-8 text-zinc-600 mx-auto" />
                                <p className="text-xs font-bold text-zinc-400">No saved custom projects yet.</p>
                                <p className="text-[11px] text-zinc-500">Save your current arrangement with 'Save As' to access it anytime.</p>
                            </div>
                        ) : (
                            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {savedProjects.map((p) => (
                                    <div
                                        key={p.id}
                                        onClick={() => handleOpenProject(p.id)}
                                        className="p-3.5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-yellow-500/40 rounded-2xl transition-all flex items-center justify-between cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-yellow-400 shrink-0">
                                                <Disc className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-yellow-300 transition-colors">
                                                    {p.songName}
                                                </h4>
                                                <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                                                    <span>{p.trackCount} Tracks</span>
                                                    <span>•</span>
                                                    <span>{p.stemCount} Stems</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {formatTimeAgo(p.lastSaved)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                title="Delete Saved Project"
                                                onClick={(e) => handleDeleteProject(p.id, e)}
                                                className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-400 group-hover:bg-yellow-500 group-hover:text-black transition-all">
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer Clean Slate Action */}
                        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-zinc-500">Need a fresh start?</span>
                            <button
                                onClick={handleFreshStart}
                                className="text-[11px] font-bold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                                <RefreshCw className="w-3 h-3" />
                                <span>Purge Cache & Reset App</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
