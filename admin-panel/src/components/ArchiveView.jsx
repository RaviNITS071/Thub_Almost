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

  const [isPurgingExpired, setIsPurgingExpired] = useState(false);
  const [expiredPurgeResult, setExpiredPurgeResult] = useState(null);

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

  const handlePurgeExpiredTendersNow = async () => {
    if (!window.confirm(`Are you sure you want to purge all expired tenders (both JSON and documents) immediately across MongoDB, Primary R2, and the Backup Server? This enforces zero retention delay (no 14-day stay in the backup server).`)) {
      return;
    }

    setIsPurgingExpired(true);
    setExpiredPurgeResult(null);

    try {
      const res = await adminApi.purgeExpiredTenders();
      setExpiredPurgeResult(res);
      onRefresh();
    } catch (err) {
      alert(`Expired purge failed: ${err.message}`);
    } finally {
      setIsPurgingExpired(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
          <FolderArchive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <span>Archive &amp; Expired Data Retention Cleaner</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Lifecycle management: Enforces 0-day retention on expired tenders across Primary and Backup servers, plus 30-day archive pruning.
        </p>
      </div>

      {/* Purge Result Alerts */}
      {purgeResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            {purgeResult.message} (Purged prior to {new Date(purgeResult.cutoffDate).toLocaleDateString()})
          </span>
        </div>
      )}

      {expiredPurgeResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">{expiredPurgeResult.message}</p>
            <p className="font-mono text-[11px] opacity-80">
              MongoDB: {expiredPurgeResult.result?.purgedCount || 0} | Primary R2: {expiredPurgeResult.result?.primaryFilesDeleted || 0} files | Backup Server: {expiredPurgeResult.result?.backupFilesDeleted || 0} files
            </p>
          </div>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* 1. Automated Purge Policy Status */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dalBlue dark:text-blue-400">
            <Clock className="w-4 h-4" />
            <span>Automated Cron Rule (02:00 AM IST)</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-black text-slate-900 dark:text-white">03:00 AM</span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Nightly (IST)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every night at 03:00 AM, the scheduler triggers a synchronized flush:
            </p>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
              <li><strong>Expired Tenders:</strong> Purged immediately from MongoDB, Primary R2 &amp; Secondary Backup R2 (both JSON and documents, 0-day retention).</li>
              <li><strong>30-Day Archive:</strong> Purges records with status <code className="text-purple-600 dark:text-purple-400 font-mono font-bold">ARCHIVED</code> older than 30 days.</li>
            </ul>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 text-xs font-mono text-slate-500 dark:text-slate-400 space-y-1.5">
            <div>Expired Tender Retention: <strong className="text-emerald-600 dark:text-emerald-400">0 Days (Immediate Primary &amp; Backup Deletion)</strong></div>
            <div>Archive Retention Policy: <strong className="text-slate-800 dark:text-slate-200">30 Calendar Days</strong></div>
            <div>Last Automated Flush: <strong className="text-slate-800 dark:text-slate-200">{cronConfig.lastPurgedAt ? new Date(cronConfig.lastPurgedAt).toLocaleString() : 'Pending Next Cycle'}</strong></div>
          </div>
        </div>

        {/* 2. Immediate Expired Tenders Flush (Primary + Backup Server) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-chinarRed">
              <ShieldAlert className="w-4 h-4" />
              <span>Flush Expired Tenders (Primary &amp; Backup)</span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Immediately flushes and removes all expired tenders (both <code className="font-mono text-purple-600 dark:text-purple-400">tender.json</code> and documents like PDFs/Excel) from MongoDB Atlas, Primary Cloudflare R2, and the Backup Server.
            </p>

            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-2.5 text-xs text-red-700 dark:text-red-300 font-mono flex items-center justify-between">
              <span>Expired (Date &amp; Time Passed):</span>
              <strong className="text-sm font-bold text-chinarRed">{tenders.expired || 0} tender(s)</strong>
            </div>
          </div>

          <button
            onClick={handlePurgeExpiredTendersNow}
            disabled={isPurgingExpired}
            className="w-full py-2.5 px-4 rounded-xl bg-chinarRed hover:bg-chinarRed-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPurgingExpired ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Flushing Primary &amp; Backup Server...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Flush Expired Tenders Now</span>
              </>
            )}
          </button>
        </div>

        {/* 3. 30-Day Archive Purge Trigger Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between md:col-span-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              <FolderArchive className="w-4 h-4" />
              <span>30-Day Archived Tenders Cleanup</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-display font-black text-purple-600 dark:text-purple-400">
                {expiredCount}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                archived tenders eligible for &gt;30-day deletion (out of {archivedTotal} total archived records)
              </span>
            </div>
          </div>

          <button
            onClick={handlePurgeNow}
            disabled={isPurging || expiredCount === 0}
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPurging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing Archive Purge...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Purge Archived Tenders Older Than 30 Days</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
