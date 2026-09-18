import { useState } from 'react';
import { Landmark, Key, ArrowRight, Loader2, AlertCircle, ShieldCheck, BadgeCheck } from 'lucide-react';
import { adminApi, setStoredAdminKey } from '../services/api';

export function AdminLogin({ onAuthenticated }) {
  const [keyInput, setKeyInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setError('Please enter your administrative access key.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await adminApi.verify(keyInput.trim());
      setStoredAdminKey(keyInput.trim(), rememberMe);
      onAuthenticated();
    } catch (err) {
      setError(err.message === 'UNAUTHORIZED_ADMIN' || err.status === 401 
        ? 'Invalid administrative access key. Please verify your credentials.' 
        : `Connection error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 flex items-center justify-center p-4 sm:p-6 transition-colors duration-200">
      <div className="w-full max-w-lg space-y-6">
        
        {/* Institutional Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 mx-auto">
            <div className="w-10 h-10 rounded-xl bg-dalBlue text-white flex items-center justify-center shadow-xs">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-display font-black tracking-tight text-dalBlue dark:text-white leading-none">
              Tender<span className="text-chinarRed">Hub</span>
            </span>
            <span className="text-[10px] font-semibold tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              J&amp;K
            </span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-chinarRed/10 text-chinarRed border border-chinarRed/20">
              OPERATIONS
            </span>
          </div>
          <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white pt-2">
            Operations &amp; Diagnostic Console
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Authorized administrative access for system telemetry, automated ingestion schedules, and JKTenders scraper monitors.
          </p>
        </div>

        {/* Main Authentication Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-card dark:shadow-none space-y-5">
          
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-700/60">
            <ShieldCheck className="w-4 h-4 text-dalBlue dark:text-blue-400" />
            <span>Administrator Passkey Verification</span>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-chinarRed" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Secret Admin Access Key <span className="text-chinarRed">*</span>
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Enter administrator key..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-dalBlue dark:focus:border-blue-400 focus:ring-2 focus:ring-dalBlue/20 transition-all"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono">
                Configured in backend/.env (Default: tenderhub_admin_secret_2026)
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-dalBlue dark:text-blue-500 focus:ring-dalBlue/20 accent-dalBlue cursor-pointer"
              />
              <label htmlFor="remember" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                Remember credentials on this browser
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-dalBlue hover:bg-dalBlue-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating credentials...</span>
                </>
              ) : (
                <>
                  <span>Enter Operations Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Security & Regulatory Institutional Badge */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Decoupled Platform Management • Restricted Access</span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Protected by internal token authorization and rate-limited administrative guards.
          </p>
        </div>

      </div>
    </div>
  );
}
