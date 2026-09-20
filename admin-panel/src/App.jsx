import { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Wrench, 
  Layers, 
  FolderArchive, 
  FileText, 
  Loader2,
  Landmark,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { adminApi, getStoredAdminKey } from './services/api';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AdminLogin } from './components/AdminLogin';
import { Navbar } from './components/Navbar';
import { TelemetryView } from './components/TelemetryView';
import { DiagnosticView } from './components/DiagnosticView';
import { IngestionView } from './components/IngestionView';
import { ArchiveView } from './components/ArchiveView';
import { LogsView } from './components/LogsView';
import { BackupView } from './components/BackupView';

function AdminAppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('telemetry');
  const [telemetry, setTelemetry] = useState(null);
  const [overview, setOverview] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [syncHistory, setSyncHistory] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Validate stored credentials on load
  useEffect(() => {
    const key = getStoredAdminKey();
    if (key) {
      adminApi.verify(key)
        .then(() => setIsAuthenticated(true))
        .catch(() => setIsAuthenticated(false))
        .finally(() => setIsInitialLoading(false));
    } else {
      setIsInitialLoading(false);
    }
  }, []);

  // Fetch all dashboard data
  const refreshAllData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsRefreshing(true);

    try {
      const [tel, ov, diag, hist] = await Promise.all([
        adminApi.getTelemetry().catch(() => null),
        adminApi.getOverview().catch(() => null),
        adminApi.getDiagnostics().catch(() => null),
        adminApi.getSyncHistory({ limit: 15 }).catch(() => null),
      ]);

      if (tel) setTelemetry(tel);
      if (ov) setOverview(ov);
      if (diag) setDiagnostics(diag);
      if (hist) setSyncHistory(hist);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  // Periodic refresh
  useEffect(() => {
    if (isAuthenticated) {
      refreshAllData();
      const interval = setInterval(refreshAllData, 25000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshAllData]);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-slate-900 flex items-center justify-center text-dalBlue dark:text-blue-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  const activeIssuesCount = diagnostics?.count || 0;
  const isOperational = telemetry?.status === 'OPERATIONAL' && activeIssuesCount === 0;

  const TABS = [
    { id: 'telemetry', label: 'Telemetry & Health', icon: Activity },
    { 
      id: 'diagnostics', 
      label: 'Intelligent Diagnostics', 
      icon: Wrench,
      badge: activeIssuesCount > 0 ? activeIssuesCount : null,
      badgeColor: 'bg-chinarRed text-white'
    },
    { 
      id: 'ingestion', 
      label: 'Ingestion & Automation', 
      icon: Layers,
      badge: overview?.documents?.pendingMissingPdfs > 0 ? `${overview.documents.pendingMissingPdfs} pending` : null,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
    },
    { id: 'archive', label: 'Archive & Purge', icon: FolderArchive },
    { 
      id: 'backup', 
      label: 'Backup & Recovery', 
      icon: ShieldCheck,
      badge: '02:00 AM',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
    },
    { id: 'logs', label: 'System Logs Stream', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-paper dark:bg-slate-900 text-charcoal dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Top Navbar */}
      <Navbar
        isOperational={isOperational}
        lastUpdated={lastUpdated}
        onRefresh={refreshAllData}
        isRefreshing={isRefreshing}
        onLogout={() => setIsAuthenticated(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Navigation Tabs Bar (Styled matching frontend Profile tab bar) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-1.5 rounded-2xl shadow-xs overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-dalBlue text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dynamic Views */}
        {activeTab === 'telemetry' && (
          <TelemetryView 
            telemetry={telemetry} 
            overview={overview} 
            isRefreshing={isRefreshing} 
          />
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticView 
            diagnostics={diagnostics} 
            onRefresh={refreshAllData} 
          />
        )}

        {activeTab === 'ingestion' && (
          <IngestionView 
            overview={overview} 
            syncHistory={syncHistory} 
            onRefresh={refreshAllData} 
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveView 
            overview={overview} 
            onRefresh={refreshAllData} 
          />
        )}

        {activeTab === 'backup' && (
          <BackupView />
        )}

        {activeTab === 'logs' && (
          <LogsView />
        )}

      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-6 py-4 text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-dalBlue dark:text-white" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              TenderHub Jammu &amp; Kashmir
            </span>
            <span className="text-[11px] text-slate-400">
              • Operations &amp; Diagnostic Infrastructure
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Isolated Deployment Architecture • Port 5174
          </div>
        </div>
      </footer>

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AdminAppContent />
    </ThemeProvider>
  );
}
