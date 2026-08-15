import React from 'react';
import { Sparkles, Layers, SlidersHorizontal, Download } from 'lucide-react';
import type { WorkspaceTab } from '../../types';
import { useSongLibrary } from '../../context/SongLibraryContext';
import { useTimeline } from '../../context/TimelineContext';

interface BottomTabBarProps {
    activeTab: WorkspaceTab;
    onTabChange: (tab: WorkspaceTab) => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ activeTab, onTabChange }) => {
    const { songs } = useSongLibrary();
    const { project } = useTimeline();

    const processingCount = songs.filter(s => s.status === 'processing' || s.status === 'uploading').length;
    const clipCount = project.clips.length;

    const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode; badge?: string | number }[] = [
        {
            id: 'separate',
            label: 'Separate',
            icon: <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />,
            badge: processingCount > 0 ? `${processingCount} active` : (songs.length > 0 ? songs.length : undefined),
        },
        {
            id: 'editor',
            label: 'Timeline Editor',
            icon: <Layers className="w-4 h-4 sm:w-5 sm:h-5" />,
            badge: clipCount > 0 ? `${clipCount} clips` : undefined,
        },
        {
            id: 'mixer',
            label: 'Mixer Console',
            icon: <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />,
            badge: project.tracks.length > 0 ? `${project.tracks.length} tracks` : undefined,
        },
        {
            id: 'export',
            label: 'Deliver / Export',
            icon: <Download className="w-4 h-4 sm:w-5 sm:h-5" />,
        },
    ];

    return (
        <nav
            aria-label="Workspace Navigation"
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 border-t border-white/10 backdrop-blur-xl shadow-2xl transition-all duration-300"
        >
            <div className="max-w-4xl mx-auto px-2 sm:px-4 h-14 sm:h-16 flex items-center justify-around">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                                isActive
                                    ? 'text-yellow-400 bg-white/[0.07] shadow-[0_0_20px_rgba(250,204,21,0.15)]'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                            }`}
                        >
                            {/* Glowing top line indicator */}
                            {isActive && (
                                <span className="absolute -top-1.5 sm:-top-2 left-1/2 -translate-x-1/2 w-8 sm:w-12 h-1 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
                            )}

                            <div className="relative">
                                {tab.icon}
                                {tab.id === 'separate' && processingCount > 0 && (
                                    <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                                )}
                            </div>

                            <span className="tracking-tight">{tab.label}</span>

                            {tab.badge !== undefined && (
                                <span className={`hidden md:inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                                    isActive
                                        ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/30'
                                        : 'bg-white/10 text-zinc-400'
                                }`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
