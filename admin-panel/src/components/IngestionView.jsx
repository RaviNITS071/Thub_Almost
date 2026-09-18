import { useState } from 'react';
import { 
  Play, 
  Clock, 
  RotateCcw, 
  CheckCircle2, 
  ToggleLeft,
  ToggleRight,
  Loader2,
  FileQuestion,
  Layers,
  ArrowRight
} from 'lucide-react';
import { adminApi } from '../services/api';

export function IngestionView({ overview, syncHistory, onRefresh }) {
  const cronConfig = overview?.cronConfig || {};
  const isAutomated = Boolean(cronConfig.isAutomatedSyncEnabled);
  const scheduledSlots = cronConfig.scheduledSlots || ['09:00', '10:00', '13:00', '15:00', '18:30'];
  const pendingMissingPdfs = overview?.documents?.pendingMissingPdfs || 0;
  const jobs = syncHistory?.jobs || [];

  const [isTriggering, setIsTriggering] = useState(false);
  const [isRetryingPdfs, setIsRetryingPdfs] = useState(false);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const handleManualSync = async () => {
    setIsTriggering(true);
    setActionSuccess('');
    try {
      const res = await adminApi.triggerManualSync();
      setActionSuccess(res.message || 'Manual ingestion started in background worker.');
      setTimeout(onRefresh, 2500);
    } catch (err) {
      alert(`Manual trigger failed: ${err.message}`);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleRetryMissingPdfs = async () => {
    setIsRetryingPdfs(true);
    setActionSuccess('');
    try {
      const res = await adminApi.triggerMissingPdfRecovery();
      setActionSuccess(res.message || 'Missing PDF recovery pass dispatched.');
      setTimeout(onRefresh, 2500);
    } catch (err) {
      alert(`PDF retry failed: ${err.message}`);
    } finally {
      setIsRetryingPdfs(false);
    }
  };

  const handleToggleAutomated = async () => {
    setIsUpdatingSchedule(true);
    setActionSuccess('');
    try {
      const nextState = !isAutomated;
      const res = await adminApi.updateScheduleConfig(nextState);
      setActionSuccess(res.message || `Automated schedule ${nextState ? 'enabled' : 'disabled'}.`);
      onRefresh();
    } catch (err) {
      alert(`Schedule toggle failed: ${err.message}`);
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Control Panels 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* 1. Manual Ingestion Action Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dalBlue dark:text-blue-400">
              <Play className="w-4 h-4" />
              <span>Manual Ingestion Trigger</span>
            </div>
            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              Instant JKTenders Crawl
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dispatches background Playwright worker with CapSolver auto-captcha to pull latest notices by current issuing date.
            </p>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isTriggering}
            className="w-full py-2.5 px-4 rounded-xl bg-dalBlue hover:bg-dalBlue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isTriggering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Dispatching Scraper Worker...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Trigger Data Fetch Now</span>
              </>
            )}
          </button>
        </div>

        {/* 2. Automated Daily Schedule (9AM, 10AM, 1PM, 3PM, 6:30PM) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                <Clock className="w-4 h-4" />
                <span>Automated Schedule</span>
              </div>

              {/* Master Permission Toggle */}
              <button
                onClick={handleToggleAutomated}
                disabled={isUpdatingSchedule}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                  isAutomated
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isAutomated ? (
                  <>
                    <ToggleRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>ACTIVE</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-4 h-4 text-slate-400" />
                    <span>PAUSED</span>
                  </>
                )}
              </button>
            </div>

            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              Daily Automated Cycles (IST)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Admin permission switch for automated scheduled scrapes:
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {scheduledSlots.map((slot) => (
              <span 
                key={slot}
                className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-xs font-mono font-bold text-slate-800 dark:text-slate-200"
              >
                {slot}
              </span>
            ))}
          </div>
        </div>

        {/* 3. Missing PDF Recovery Radar */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-saffronGold">
              <FileQuestion className="w-4 h-4" />
              <span>Missing Documents Radar</span>
            </div>
            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              {pendingMissingPdfs} Pending Document(s)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tenders where PDF downloads were not yet open or encountered a temporary portal timeout. Automatically retried every cycle.
            </p>
          </div>

          <button
            onClick={handleRetryMissingPdfs}
            disabled={isRetryingPdfs || pendingMissingPdfs === 0}
            className="w-full py-2.5 px-4 rounded-xl bg-saffronGold hover:bg-amber-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isRetryingPdfs ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recovering Documents...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Retry Missing PDFs ({pendingMissingPdfs})</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Ingestion Run History Audit Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-3">
          <div>
            <h3 className="text-sm font-bold font-display text-slate-900 dark:text-white uppercase tracking-wider">
              Ingestion Execution History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exact number of tenders fetched, PDFs secured, and missing documents per cycle.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {jobs.length} recorded run(s)
          </span>
        </div>

        {jobs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            No historical sync records logged yet. Trigger an ingestion above.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 text-[11px] uppercase">
                  <th className="pb-3 font-semibold">Run Timestamp</th>
                  <th className="pb-3 font-semibold">Trigger Mode</th>
                  <th className="pb-3 font-semibold text-center">Status</th>
                  <th className="pb-3 font-semibold text-right">Items Crawled</th>
                  <th className="pb-3 font-semibold text-right">New Tenders</th>
                  <th className="pb-3 font-semibold text-right">PDFs Secured</th>
                  <th className="pb-3 font-semibold text-right">Missing PDFs</th>
                  <th className="pb-3 font-semibold text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {jobs.map((job) => (
                  <tr key={job._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="py-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.triggeredBy === 'ADMIN_MANUAL'
                          ? 'bg-blue-50 text-dalBlue dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : 'bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      }`}>
                        {job.triggeredBy || 'CRON_SCHEDULE'}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : job.status === 'running'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse'
                            : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800'
                      }`}>
                        {job.status?.toUpperCase() || 'COMPLETED'}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900 dark:text-white">
                      {job.itemsProcessed || (job.newTendersFound + (job.updatedTenders || 0))}
                    </td>
                    <td className="py-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                      +{job.newTendersFound || 0}
                    </td>
                    <td className="py-3 text-right text-dalBlue dark:text-blue-400 font-bold">
                      {job.pdfsDownloaded || 0}
                    </td>
                    <td className="py-3 text-right text-saffronGold font-bold">
                      {job.missingPdfCount || 0}
                    </td>
                    <td className="py-3 text-right text-slate-500 dark:text-slate-400">
                      {job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
