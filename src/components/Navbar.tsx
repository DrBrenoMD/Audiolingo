import React from 'react';
import {
  Headphones,
  Mic,
  PenTool,
  Layers,
  TrendingUp,
  Upload,
  Flame,
  Sparkles,
  BookOpen,
  FolderOpen,
} from 'lucide-react';

export type NavTab = 'player' | 'media' | 'speaking' | 'listening' | 'writing' | 'srs' | 'dashboard';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  dueCardsCount: number;
  streak: number;
  onOpenUpload: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  dueCardsCount,
  streak,
  onOpenUpload,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div
          onClick={() => onTabChange('player')}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-950/50">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center group-hover:bg-transparent transition-colors">
              <Headphones className="w-5 h-5 text-indigo-400 group-hover:text-white transition-colors" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight flex items-center gap-1">
              <span className="text-white">Echo</span>
              <span className="text-indigo-400">Lingo</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Audiolivros & IA</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => onTabChange('player')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'player'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Player</span>
          </button>

          <button
            onClick={() => onTabChange('media')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'media'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span>Mídias & Livros</span>
          </button>

          <button
            onClick={() => onTabChange('speaking')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'speaking'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Mic className="w-4 h-4 text-emerald-400" />
            <span>Speaking Lab</span>
          </button>

          <button
            onClick={() => onTabChange('listening')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'listening'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Headphones className="w-4 h-4 text-indigo-400" />
            <span>Listening</span>
          </button>

          <button
            onClick={() => onTabChange('writing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'writing'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <PenTool className="w-4 h-4 text-purple-400" />
            <span>Escrita IA</span>
          </button>

          <button
            onClick={() => onTabChange('srs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition relative ${
              activeTab === 'srs'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Baralho SRS</span>
            {dueCardsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white">
                {dueCardsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span>Progresso</span>
          </button>
        </nav>

        {/* Right CTA & Streak */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-amber-400">
            <Flame className="w-4 h-4" />
            <span>{streak || 5} d</span>
          </div>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-950/50 active:scale-95 shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload Audiolivro</span>
          </button>
        </div>
      </div>

      {/* Mobile Submenu Bar */}
      <div className="md:hidden flex items-center justify-around px-2 py-2 border-t border-slate-800/80 bg-slate-900/80 text-[11px] font-medium overflow-x-auto">
        <button
          onClick={() => onTabChange('player')}
          className={`px-2 py-1 rounded ${activeTab === 'player' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Player
        </button>
        <button
          onClick={() => onTabChange('media')}
          className={`px-2 py-1 rounded ${activeTab === 'media' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Mídias
        </button>
        <button
          onClick={() => onTabChange('speaking')}
          className={`px-2 py-1 rounded ${activeTab === 'speaking' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Speaking
        </button>
        <button
          onClick={() => onTabChange('listening')}
          className={`px-2 py-1 rounded ${activeTab === 'listening' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Listening
        </button>
        <button
          onClick={() => onTabChange('writing')}
          className={`px-2 py-1 rounded ${activeTab === 'writing' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Escrita
        </button>
        <button
          onClick={() => onTabChange('srs')}
          className={`px-2 py-1 rounded ${activeTab === 'srs' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          SRS ({dueCardsCount})
        </button>
        <button
          onClick={() => onTabChange('dashboard')}
          className={`px-2 py-1 rounded ${activeTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          Progresso
        </button>
      </div>
    </header>
  );
};
