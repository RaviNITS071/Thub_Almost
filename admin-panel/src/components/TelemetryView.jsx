import { 
  Zap, 
  Database, 
  Layers, 
  HardDrive, 
  Server, 
  FileText, 
  CheckCircle2, 
  Clock, 
  FolderArchive,
  Activity,
  Cpu
} from 'lucide-react';

export function TelemetryView({ telemetry, overview, isRefreshing }) {
  const latency = telemetry?.latency || {};
  const services = telemetry?.services || {};
  const resources = telemetry?.systemResources || {};
  const tenders = overview?.tenders || {};
  const documents = overview?.documents || {};

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="space-y-6">

      {/* 1. Infrastructure Latency & Health Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        
        {/* MongoDB Atlas Latency */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">MongoDB Atlas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800/60">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white">
              {latency.mongoDbMs >= 0 ? `${latency.mongoDbMs}` : '--'}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">ms latency</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
            <span>{services.database?.status || 'CONNECTED'}</span>
          </div>
        </div>

        {/* Redis Cache Latency */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Redis Cache &amp; Lock</span>
            <div className="w-8 h-8 rounded-xl bg-dalBlue/10 text-dalBlue dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center border border-dalBlue/20 dark:border-blue-800/60">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white">
              {latency.redisMs >= 0 ? `${latency.redisMs}` : '--'}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">ms latency</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-dalBlue dark:text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-subtle-pulse" />
            <span>{services.redisCache?.status || 'HEALTHY'}</span>
          </div>
        </div>

        {/* BullMQ Worker Queue */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">BullMQ Scraper Queue</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center border border-purple-200 dark:border-purple-800/60">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white">
              {services.queue?.active || 0}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">active jobs</span>
          </div>
          <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Waiting: <strong className="text-slate-800 dark:text-slate-200">{services.queue?.waiting || 0}</strong></span>
            <span>Failed: <strong className={services.queue?.failed > 0 ? 'text-chinarRed' : 'text-slate-600 dark:text-slate-400'}>{services.queue?.failed || 0}</strong></span>
          </div>
        </div>

        {/* Node Process Memory RSS */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Node Process RAM</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-saffronGold dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800/60">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900 dark:text-white">
              {resources.processMemoryMb || '--'}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">MB (Heap {resources.heapUsedMb || '--'} MB)</span>
          </div>
          <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Process Uptime: <span className="text-slate-800 dark:text-slate-200 font-semibold">{formatUptime(resources.processUptimeSec)}</span>
          </div>
        </div>

      </div>

      {/* 2. Platform Inventory Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Total Indexed Tenders</div>
          <div className="text-2xl font-display font-black text-slate-900 dark:text-white mt-1.5">
            {tenders.total?.toLocaleString() || '0'}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{tenders.active?.toLocaleString() || '0'} actively bidding</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">PDF Documents Secured</div>
          <div className="text-2xl font-display font-black text-dalBlue dark:text-blue-400 mt-1.5">
            {documents.completedPdfs?.toLocaleString() || '0'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            Secured in Cloudflare R2
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Pending Missing PDFs</div>
          <div className="text-2xl font-display font-black text-chinarRed mt-1.5">
            {documents.pendingMissingPdfs?.toLocaleString() || '0'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
            Queued for auto-recovery
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Archived Tenders</div>
          <div className="text-2xl font-display font-black text-purple-700 dark:text-purple-400 mt-1.5">
            {tenders.archived?.toLocaleString() || '0'}
          </div>
          <div className="text-[11px] text-chinarRed mt-1 font-mono font-semibold">
            {tenders.expiredArchivedEligibleForPurge || 0} expired &gt; 30d
          </div>
        </div>

      </div>

      {/* 3. Host Specifications & Operating Standards */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-dalBlue dark:text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Host Environment &amp; Network Health
            </span>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Node.js Production Runtime
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">CPU Allocation</span>
            <span className="text-slate-900 dark:text-white font-bold">{resources.cpuCores || '--'} Cores</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Host System Memory</span>
            <span className="text-slate-900 dark:text-white font-bold">
              {resources.freeSystemMemoryMb ? Math.round(resources.freeSystemMemoryMb / 1024) : '--'} GB free / {resources.totalSystemMemoryMb ? Math.round(resources.totalSystemMemoryMb / 1024) : '--'} GB total
            </span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Host Uptime</span>
            <span className="text-slate-900 dark:text-white font-bold">{formatUptime(resources.systemUptimeSec)}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Network Performance</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{latency.overallRating || 'OPTIMAL'}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
