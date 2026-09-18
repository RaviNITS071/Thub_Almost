import { useState, useEffect } from 'react';
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  FileText
} from 'lucide-react';
import { adminApi } from '../services/api';

export function LogsView() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = { page, limit: 25 };
      if (levelFilter !== 'ALL') params.level = levelFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const data = await adminApi.getLogs(params);
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, levelFilter, sourceFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getLevelBadge = (lvl) => {
    switch (lvl) {
      case 'ERROR':
      case 'FATAL':
        return 'bg-red-50 text-red-700 dark:bg-red-950/80 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'WARN':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-blue-50 text-dalBlue dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Search & Filters Strip */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search system logs..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400"
          />
        </form>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
          >
            <option value="ALL">All Levels</option>
            <option value="ERROR">ERROR / FATAL</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 cursor-pointer"
          >
            <option value="ALL">All Sources</option>
            <option value="WORKER_SCRAPER">WORKER_SCRAPER</option>
            <option value="CRON">CRON</option>
            <option value="API">API</option>
            <option value="DATABASE">DATABASE</option>
            <option value="REDIS">REDIS</option>
          </select>

          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin text-dalBlue dark:text-blue-400' : ''}`} />
          </button>
        </div>

      </div>

      {/* Logs Table / List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
          <span>Found <strong className="text-slate-900 dark:text-white">{total}</strong> persistent system log entries</span>
          <span>Page {page} of {totalPages}</span>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center text-xs font-mono text-slate-400">
            {isLoading ? 'Loading system logs...' : 'No log entries match the selected filters.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log._id;
              return (
                <div key={log._id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors space-y-2 text-xs font-mono">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getLevelBadge(log.level)}`}>
                        {log.level}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {log.source}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                      className="text-[11px] font-semibold text-dalBlue dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Trace' : 'View Trace / Details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Message */}
                  <div className="text-slate-800 dark:text-slate-200 break-words font-sans">
                    {log.message}
                  </div>

                  {/* Expanded Trace / Metadata */}
                  {isExpanded && (
                    <div className="mt-3 p-3.5 rounded-xl bg-slate-900 text-slate-100 border border-slate-700 space-y-3 animate-in fade-in">
                      {log.stack && (
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Stack Trace</div>
                          <pre className="text-[11px] text-red-300 whitespace-pre-wrap overflow-x-auto font-mono max-h-48 overflow-y-auto">
                            {log.stack}
                          </pre>
                        </div>
                      )}

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Metadata Payload</div>
                          <pre className="text-[11px] text-slate-300 whitespace-pre-wrap overflow-x-auto font-mono">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Strip */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
