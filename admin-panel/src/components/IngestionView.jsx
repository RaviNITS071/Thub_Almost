import { useState, useEffect, useRef } from 'react';
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
  ArrowRight,
  Terminal,
  StopCircle,
  RefreshCw,
  AlertTriangle,
  FileText,
  Building2,
  Database,
  Calendar,
  Sparkles,
  Trash2
} from 'lucide-react';
import { adminApi } from '../services/api';

export function IngestionView({ overview, syncHistory, onRefresh }) {
  const cronConfig = overview?.cronConfig || {};
  const isAutomated = Boolean(cronConfig.isAutomatedSyncEnabled);
  const scheduledSlots = cronConfig.scheduledSlots || ['09:00', '10:00', '13:00', '15:00', '18:30'];
  const pendingMissingPdfs = overview?.documents?.pendingMissingPdfs || 0;
  const jobs = syncHistory?.jobs || [];

  // Action states
  const [isTriggeringAll, setIsTriggeringAll] = useState(false);
  const [isTriggeringLatest, setIsTriggeringLatest] = useState(false);
  const [isRetryingPdfs, setIsRetryingPdfs] = useState(false);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isResettingCp, setIsResettingCp] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Limit selections
  const [allLimit, setAllLimit] = useState(50000);
  const [latestLimit, setLatestLimit] = useState(600);

  // Live telemetry & logs state
  const [liveStatus, setLiveStatus] = useState({
    isRunning: false,
    activeJob: null,
    checkpoint: null,
    logs: []
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const terminalLogsRef = useRef(null);

  // Poll live sync status
  const fetchLiveStatus = async () => {
    try {
      const data = await adminApi.getLiveSyncStatus();
      setLiveStatus(data);
    } catch (err) {
      // Quietly handle network blip
    }
  };

  useEffect(() => {
    fetchLiveStatus();
    const intervalTime = liveStatus.isRunning ? 1500 : 5000;
    const interval = setInterval(fetchLiveStatus, intervalTime);
    return () => clearInterval(interval);
  }, [liveStatus.isRunning]);

  // Elapsed timer when running
  useEffect(() => {
    let timer;
    if (liveStatus.isRunning) {
      timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [liveStatus.isRunning]);

  // Auto-scroll terminal logs to bottom
  useEffect(() => {
    if (autoScroll && terminalLogsRef.current) {
      terminalLogsRef.current.scrollTop = terminalLogsRef.current.scrollHeight;
    }
  }, [liveStatus.logs, autoScroll]);

  // 1. Trigger Full Crawl (Command 1)
  const handleTriggerAll = async (resume = false) => {
    setIsTriggeringAll(true);
    setActionSuccess('');
    setActionError('');
    try {
      const res = await adminApi.triggerManualSync({
        mode: 'ALL',
        limit: allLimit,
        reset: !resume && !liveStatus.checkpoint
      });
      setActionSuccess(res.message || 'Full active tenders crawl started in background.');
      await fetchLiveStatus();
      setTimeout(onRefresh, 2000);
    } catch (err) {
      setActionError(`Failed to start full crawl: ${err.message}`);
    } finally {
      setIsTriggeringAll(false);
    }
  };

  // 2. Trigger Daily Latest Crawl (Command 2)
  const handleTriggerLatest = async () => {
    setIsTriggeringLatest(true);
    setActionSuccess('');
    setActionError('');
    try {
      const res = await adminApi.triggerManualSync({
        mode: 'LATEST',
        limit: latestLimit
      });
      setActionSuccess(res.message || 'Daily latest tenders crawl started in background.');
      await fetchLiveStatus();
      setTimeout(onRefresh, 2000);
    } catch (err) {
      setActionError(`Failed to start latest crawl: ${err.message}`);
    } finally {
      setIsTriggeringLatest(false);
    }
  };

  // 3. Stop Active Crawl
  const handleStopActive = async () => {
    if (!confirm('Are you sure you want to stop the actively running scraper? Progress up to now will be saved in the checkpoint.')) return;
    setIsStopping(true);
    try {
      await adminApi.stopActiveSync();
      setActionSuccess('Scraper process stopped. Current checkpoint preserved.');
      await fetchLiveStatus();
      setTimeout(onRefresh, 1500);
    } catch (err) {
      setActionError(`Failed to stop crawl: ${err.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  // 4. Reset Checkpoint
  const handleResetCheckpoint = async () => {
    if (!confirm('Are you sure you want to reset the crawl checkpoint? This will cause the next Full Crawl to start from Organisation #1.')) return;
    setIsResettingCp(true);
    try {
      await adminApi.resetCrawlCheckpoint();
      setActionSuccess('Crawl checkpoint reset. Next run will start from Organisation #1.');
      await fetchLiveStatus();
    } catch (err) {
      setActionError(`Failed to reset checkpoint: ${err.message}`);
    } finally {
      setIsResettingCp(false);
    }
  };

  // 5. Retry Missing PDFs
  const handleRetryMissingPdfs = async () => {
    setIsRetryingPdfs(true);
    setActionSuccess('');
    setActionError('');
    try {
      const res = await adminApi.triggerMissingPdfRecovery();
      setActionSuccess(res.message || 'Missing PDF recovery pass dispatched.');
      setTimeout(onRefresh, 2500);
    } catch (err) {
      setActionError(`PDF retry failed: ${err.message}`);
    } finally {
      setIsRetryingPdfs(false);
    }
  };

  // 6. Toggle Automated Cron Schedule
  const handleToggleAutomated = async () => {
    setIsUpdatingSchedule(true);
    setActionSuccess('');
    setActionError('');
    try {
      const nextState = !isAutomated;
      const res = await adminApi.updateScheduleConfig(nextState);
      setActionSuccess(res.message || `Automated schedule ${nextState ? 'enabled' : 'disabled'}.`);
      onRefresh();
    } catch (err) {
      setActionError(`Schedule toggle failed: ${err.message}`);
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const checkpoint = liveStatus.checkpoint;
  const isRunning = liveStatus.isRunning;
  const activeJob = liveStatus.activeJob;

  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">

      {/* Notification Banners */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-rose-600 hover:text-rose-800 text-xs">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4 DISTINCT FETCHING CONTROL SECTIONS                                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

        {/* SECTION 1: FULL ACTIVE TENDERS CRAWL (COMMAND 1) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/80 text-dalBlue dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                COMMAND 1
              </span>
              <Building2 className="w-4 h-4 text-dalBlue dark:text-blue-400" />
            </div>

            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              All Active Tenders Crawl
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Full backfill across all departments via <em>Tenders by Organisation</em>. Idempotent with persistent resume checkpoint.
            </p>

            {/* Checkpoint Resume Badge */}
            {checkpoint && checkpoint.status === 'IN_PROGRESS' ? (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-[11px] font-mono text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESUME CHECKPOINT AVAILABLE</span>
                </div>
                <div>🏛️ Org: {checkpoint.orgName || `Index ${checkpoint.orgIndex + 1}`}</div>
                <div>📄 Page: {checkpoint.orgPageNum || 1} • {checkpoint.totalProcessed || 0} saved</div>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] font-mono text-slate-500">Target Limit:</label>
                <select 
                  value={allLimit} 
                  onChange={(e) => setAllLimit(Number(e.target.value))}
                  className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200"
                >
                  <option value={15}>15 tenders (Test)</option>
                  <option value={50}>50 tenders</option>
                  <option value={200}>200 tenders</option>
                  <option value={1000}>1,000 tenders</option>
                  <option value={50000}>All Active (Unlimited)</option>
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {checkpoint && checkpoint.status === 'IN_PROGRESS' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTriggerAll(true)}
                  disabled={isTriggeringAll || isRunning}
                  className="flex-1 py-2 px-3 rounded-xl bg-dalBlue hover:bg-dalBlue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTriggeringAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  <span>Resume Full Crawl</span>
                </button>
                <button
                  onClick={handleResetCheckpoint}
                  disabled={isResettingCp || isRunning}
                  title="Reset checkpoint to start fresh"
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-500 hover:text-rose-600 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleTriggerAll(false)}
                disabled={isTriggeringAll || isRunning}
                className="w-full py-2.5 px-4 rounded-xl bg-dalBlue hover:bg-dalBlue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isTriggeringAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting Crawl...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Full Crawl</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* SECTION 2: DAILY INCREMENTAL CRAWL (COMMAND 2) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                COMMAND 2
              </span>
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>

            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              Daily Latest Tenders
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Fetches newly published notices across departments. Halts automatically upon finding 5 consecutive already-scraped tenders.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <label className="text-[11px] font-mono text-slate-500">Max Limit:</label>
              <select 
                value={latestLimit} 
                onChange={(e) => setLatestLimit(Number(e.target.value))}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200"
              >
                <option value={100}>100 tenders</option>
                <option value={300}>300 tenders</option>
                <option value={600}>600 tenders (Daily)</option>
                <option value={1000}>1,000 tenders</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleTriggerLatest}
            disabled={isTriggeringLatest || isRunning}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isTriggeringLatest ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking Latest...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Fetch Latest Tenders</span>
              </>
            )}
          </button>
        </div>

        {/* SECTION 3: MISSING DOCUMENTS RADAR */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                DOCS RECOVERY
              </span>
              <FileQuestion className="w-4 h-4 text-saffronGold" />
            </div>

            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              {pendingMissingPdfs} Pending Document(s)
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tenders where PDF downloads were not yet available on the portal or timed out. Automatically retried every scheduled cycle.
            </p>
          </div>

          <button
            onClick={handleRetryMissingPdfs}
            disabled={isRetryingPdfs || pendingMissingPdfs === 0 || isRunning}
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
                <span>Retry Missing Docs ({pendingMissingPdfs})</span>
              </>
            )}
          </button>
        </div>

        {/* SECTION 4: AUTOMATED SCHEDULE CYCLES (CRON) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                CRON AUTOMATION
              </span>
              
              <button
                onClick={handleToggleAutomated}
                disabled={isUpdatingSchedule}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  isAutomated
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isAutomated ? (
                  <>
                    <ToggleRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>ACTIVE</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />
                    <span>PAUSED</span>
                  </>
                )}
              </button>
            </div>

            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              Automated Cycles (IST)
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Background workers trigger incremental notice crawls during portal peak publishing hours:
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {scheduledSlots.map((slot) => (
                <span 
                  key={slot}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300"
                >
                  {slot}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* LIVE INGESTION PROGRESS & LOG CONSOLE (JUST BELOW THE FETCH CONTROLS)     */}
      {/* ========================================================================= */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 text-slate-100 font-mono">
        
        {/* Console Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-dalBlue dark:text-blue-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold font-sans tracking-wide text-white">
                  Live Ingestion Telemetry &amp; Log Stream
                </h4>
                {isRunning ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    RUNNING ({formatTime(elapsedSeconds)})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    IDLE / READY
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Real-time Playwright crawler logs, captcha solving events, and document upload counters.
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isRunning && (
              <button
                onClick={handleStopActive}
                disabled={isStopping}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                {isStopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                <span>Stop Crawl</span>
              </button>
            )}

            <button
              onClick={fetchLiveStatus}
              title="Refresh live logs"
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-dalBlue focus:ring-0 cursor-pointer"
              />
              <span>Auto-Scroll</span>
            </label>
          </div>
        </div>

        {/* Live Counters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Items Processed</span>
            <span className="text-lg font-bold text-white">
              {activeJob?.itemsProcessed || (checkpoint?.totalProcessed || 0)}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">New Tenders Saved</span>
            <span className="text-lg font-bold text-emerald-400">
              +{activeJob?.newTendersFound || 0}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">PDFs Secured</span>
            <span className="text-lg font-bold text-blue-400">
              {activeJob?.pdfsDownloaded || 0}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Missing PDFs</span>
            <span className="text-lg font-bold text-amber-400">
              {activeJob?.missingPdfCount || 0}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Current Target</span>
            <span className="text-xs font-bold text-purple-300 truncate block" title={checkpoint?.orgName || 'N/A'}>
              {checkpoint?.orgName ? `[${checkpoint.orgIndex + 1}] ${checkpoint.orgName}` : (isRunning ? 'Active Ingestion' : 'Idle')}
            </span>
          </div>
        </div>

        {/* Live Terminal Log Stream Container */}
        <div 
          ref={terminalLogsRef}
          className="h-64 sm:h-72 bg-black/90 border border-slate-800/90 rounded-2xl p-4 overflow-y-auto space-y-1 text-xs font-mono scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        >
          {liveStatus.logs && liveStatus.logs.length > 0 ? (
            liveStatus.logs.map((log, index) => {
              const msg = log.message || '';
              const isSuccess = msg.includes('✅') || msg.includes('🎉');
              const isSkip = msg.includes('⏩');
              const isOrg = msg.includes('🏛️') || msg.includes('📋');
              const isWarn = log.level === 'WARN' || msg.includes('⚠️');
              const isError = log.level === 'ERROR' || msg.includes('❌');

              let colorClass = 'text-slate-300';
              if (isSuccess) colorClass = 'text-emerald-400';
              else if (isSkip) colorClass = 'text-amber-300';
              else if (isOrg) colorClass = 'text-purple-300 font-bold';
              else if (isWarn) colorClass = 'text-amber-400';
              else if (isError) colorClass = 'text-rose-400 font-bold';

              return (
                <div key={log._id || index} className={`flex items-start gap-2 leading-relaxed ${colorClass}`}>
                  <span className="text-slate-500 select-none text-[11px] shrink-0">
                    {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : '...'}
                  </span>
                  <span className="break-all">{msg}</span>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-1.5">
              <Terminal className="w-6 h-6 text-slate-600" />
              <p>Ready. Click any fetch button above to stream live crawler progress.</p>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* INGESTION EXECUTION HISTORY AUDIT TABLE                                   */}
      {/* ========================================================================= */}
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
