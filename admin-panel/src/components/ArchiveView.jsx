import { useState } from 'react';
import { FolderArchive, Trash2, Clock, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { adminApi } from '../services/api';

export function ArchiveView({ overview, onRefresh }) {
  const tenders = overview?.tenders || {};
  const cronConfig = overview?.cronConfig || {};
  const expiredCount = tenders.expiredArchivedEligibleForPurge || 0;
  const archivedTotal = tenders.archived || 0;

  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);

  const handlePurgeNow = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete all archived tenders expired more than 30 days ago? This action cannot be undone.`)) {
      return;
    }

    setIsPurging(true);
    setPurgeResult(null);

    try {
      const res = await adminApi.purgeExpiredArchive();
      setPurgeResult(res);
      onRefresh();
    } catch (err) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
          <FolderArchive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <span>Archive &amp; 30-Day Data Retention Cleaner</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Automatic lifecycle management: continuously purges archived tenders whose closing/expiry date exceeded 30 days.
        </p>
      </div>

      {/* Purge Result Alert */}
      {purgeResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            {purgeResult.message} (Purged prior to {new Date(purgeResult.cutoffDate).toLocaleDateString()})
          </span>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* 1. Automated Purge Policy Status */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dalBlue dark:text-blue-400">
            <Clock className="w-4 h-4" />
            <span>Automated Cron Rule</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-black text-slate-900 dark:text-white">02:00 AM</span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Every Night (IST)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              The scheduler executes a nightly sweep against MongoDB. Any document with status <code className="text-purple-600 dark:text-purple-400 font-mono font-bold">ARCHIVED</code> and closing date older than 30 days is permanently deleted to prevent storage bloat.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 text-xs font-mono text-slate-500 dark:text-slate-400 space-y-1.5">
            <div>Retention Policy: <strong className="text-slate-800 dark:text-slate-200">30 Calendar Days</strong></div>
            <div>Last Automated Purge: <strong className="text-slate-800 dark:text-slate-200">{cronConfig.lastPurgedAt ? new Date(cronConfig.lastPurgedAt).toLocaleString() : 'Pending Next Cycle'}</strong></div>
            <div>Last Purged Batch Size: <strong className="text-emerald-600 dark:text-emerald-400">{cronConfig.lastPurgedCount || 0} records</strong></div>
          </div>
        </div>

        {/* 2. Manual Purge Trigger Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chinarRed">
              <ShieldAlert className="w-4 h-4" />
              <span>Immediate Purge Action</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-black text-chinarRed">
                {expiredCount}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                expired archived tenders eligible for immediate deletion
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total archived documents currently in database: <strong className="text-slate-800 dark:text-slate-200 font-mono">{archivedTotal}</strong>
            </p>
          </div>

          <button
            onClick={handlePurgeNow}
            disabled={isPurging || expiredCount === 0}
            className="w-full py-2.5 px-4 rounded-xl bg-chinarRed hover:bg-chinarRed-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPurging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing Purge...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Purge Expired (&gt; 30 Days) Tenders Now</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
