import { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Wrench, 
  Copy, 
  Check, 
  Terminal, 
  ShieldCheck, 
  HelpCircle
} from 'lucide-react';
import { adminApi } from '../services/api';

export function DiagnosticView({ diagnostics, onRefresh }) {
  const issues = diagnostics?.issues || [];
  const [copiedId, setCopiedId] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  const handleCopyCommand = (id, command) => {
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResolve = async (id) => {
    setResolvingId(id);
    try {
      await adminApi.resolveLog(id);
      onRefresh();
    } catch (err) {
      alert(`Could not resolve issue: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-dalBlue dark:text-blue-400" />
            <span>Intelligent Problem Diagnostic &amp; Solution Engine</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated system intelligence that translates raw exceptions and timeouts into human-understandable causes and concrete solutions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
            issues.length === 0 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
              : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {issues.length === 0 ? '0 Active Issues' : `${issues.length} Active Problem(s)`}
          </span>
        </div>
      </div>

      {/* Zero State: All Systems Operational */}
      {issues.length === 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-card dark:shadow-none">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center mx-auto shadow-xs">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">All Platform Services Operational</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No critical exceptions, Redis disconnections, JKTenders captcha failures, or missing PDF binaries detected in recent system logs.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-2 sm:gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Database Healthy
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> BullMQ Scraper Ready
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> CapSolver Active
            </span>
          </div>
        </div>
      )}

      {/* Active Diagnosed Problems List */}
      {issues.length > 0 && (
        <div className="space-y-4">
          {issues.map((issue) => (
            <div 
              key={issue.id}
              className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/60 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-card dark:shadow-none space-y-4"
            >
              
              {/* Header: Title, Source & Dismiss */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700/80 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-red-100 text-chinarRed dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
                      {issue.level || 'ERROR'}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Source: <strong className="text-slate-800 dark:text-slate-200">{issue.source}</strong>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(issue.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-chinarRed shrink-0" />
                    <span>{issue.title}</span>
                  </h3>
                </div>

                <button
                  onClick={() => handleResolve(issue.id)}
                  disabled={resolvingId === issue.id}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {resolvingId === issue.id ? 'Resolving...' : 'Dismiss / Mark Fixed'}
                </button>
              </div>

              {/* Exact Problem Statement */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-chinarRed" />
                  <span>Exact Problem Identified:</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 font-medium">
                  {issue.problemDescription}
                </p>
              </div>

              {/* Actionable Steps to Solve */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-dalBlue dark:text-blue-400 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  <span>How It Can Be Solved:</span>
                </div>
                <div className="bg-slate-50/50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 space-y-2">
                  {issue.suggestedSteps?.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="w-4 h-4 rounded-full bg-dalBlue/10 text-dalBlue dark:bg-blue-950 dark:text-blue-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5 border border-dalBlue/20 dark:border-blue-800/60">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}

                  {/* Terminal Execution Snippet */}
                  {issue.commandSnippet && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-dalBlue dark:text-blue-400" /> Recommended Command:
                        </span>
                        <button
                          onClick={() => handleCopyCommand(issue.id, issue.commandSnippet)}
                          className="flex items-center gap-1 text-dalBlue dark:text-blue-400 hover:underline transition-colors cursor-pointer font-bold"
                        >
                          {copiedId === issue.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Command</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="bg-slate-900 text-slate-100 p-3 rounded-xl border border-slate-700 font-mono text-xs overflow-x-auto">
                        <code>{issue.commandSnippet}</code>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
