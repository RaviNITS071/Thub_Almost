import { Landmark, RefreshCw, LogOut, Sun, Moon, Clock, ShieldCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { clearStoredAdminKey } from '../services/api';

export function Navbar({ isOperational, lastUpdated, onRefresh, isRefreshing, onLogout }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Institutional Brand Identity */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-dalBlue text-white flex items-center justify-center shadow-xs shrink-0">
            <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-display font-black tracking-tight text-dalBlue dark:text-white leading-none">
                Tender<span className="text-chinarRed">Hub</span>
              </span>
              <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                J&amp;K
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.2 rounded-full bg-chinarRed/10 text-chinarRed dark:bg-chinarRed/20 dark:text-orange-400 border border-chinarRed/20">
                ADMIN OPS
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium tracking-normal mt-0.5 hidden sm:block">
              Operations &amp; Diagnostic Console • Port 5174
            </span>
          </div>
        </div>

        {/* Live Status Pill & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            <span className={`w-2 h-2 rounded-full ${isOperational ? 'bg-emerald-500 animate-subtle-pulse' : 'bg-amber-500'}`} />
            <span className="hidden sm:inline">{isOperational ? 'Services Online' : 'System Alert'}</span>
          </div>

          {/* Sync Time */}
          {lastUpdated && (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date(lastUpdated).toLocaleTimeString()}</span>
            </div>
          )}

          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            title="Refresh telemetry & diagnostic data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-dalBlue dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {/* Logout */}
          <button
            onClick={() => {
              clearStoredAdminKey();
              onLogout();
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300 transition-all cursor-pointer shadow-xs"
            title="End administrative session"
          >
            <LogOut className="w-3.5 h-3.5 text-chinarRed" />
            <span className="hidden sm:inline">Logout</span>
          </button>

        </div>

      </div>
    </header>
  );
}
