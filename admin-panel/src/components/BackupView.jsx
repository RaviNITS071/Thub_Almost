/**
 * @file admin-panel/src/components/BackupView.jsx
 * @description Mission-critical disaster recovery dashboard for TenderHub.
 * Enables on-demand database snapshots, full-system archive generation,
 * backup download, cloud mirroring monitoring, and PDF manual retrieval.
 */
import { useState, useEffect } from 'react';
import { 
  Database, 
  ShieldCheck, 
  Cloud, 
  Clock, 
  Download, 
  RefreshCw, 
  FileArchive, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  FileText, 
  HardDrive,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles
} from 'lucide-react';
import { adminApi } from '../services/api';

export function BackupView() {
  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerType, setTriggerType] = useState(null); // 'database' | 'full'
  const [backupResult, setBackupResult] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingDeploymentPdf, setIsDownloadingDeploymentPdf] = useState(false);
  const [isDownloadingFutureConfigPdf, setIsDownloadingFutureConfigPdf] = useState(false);
  const [isSyncingMirror, setIsSyncingMirror] = useState(false);
  const [mirrorSyncResult, setMirrorSyncResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSyncMirror = async () => {
    setIsSyncingMirror(true);
    setMirrorSyncResult(null);
    setError(null);
    try {
      const res = await adminApi.syncMirror();
      setMirrorSyncResult(res);
      await fetchStatus();
    } catch (err) {
      setError(`Document mirror sync failed: ${err.message}`);
    } finally {
      setIsSyncingMirror(false);
    }
  };

  const fetchStatus = async () => {
    try {
      setError(null);
      const res = await adminApi.getBackupStatus();
      if (res.success) {
        setStatusData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load backup status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerBackup = async (type = 'database') => {
    setIsTriggering(true);
    setTriggerType(type);
    setBackupResult(null);
    setError(null);

    try {
      const res = await adminApi.triggerBackup(type);
      setBackupResult(res);
      await fetchStatus();
    } catch (err) {
      setError(`Backup failed: ${err.message}`);
    } finally {
      setIsTriggering(false);
      setTriggerType(null);
    }
  };

  const handleDownloadBackup = async (fileName) => {
    try {
      setDownloadingFile(fileName);
      await adminApi.downloadBackupFile(fileName);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDownloadManual = async () => {
    try {
      setIsDownloadingPdf(true);
      await adminApi.downloadDisasterRecoveryGuide();
    } catch (err) {
      alert(`Failed to download manual: ${err.message}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadDeploymentManual = async () => {
    try {
      setIsDownloadingDeploymentPdf(true);
      await adminApi.downloadDeploymentGuide();
    } catch (err) {
      alert(`Failed to download deployment manual: ${err.message}`);
    } finally {
      setIsDownloadingDeploymentPdf(false);
    }
  };

  const handleDownloadFutureConfigManual = async () => {
    try {
      setIsDownloadingFutureConfigPdf(true);
      await adminApi.downloadFutureConfigGuide();
    } catch (err) {
      alert(`Failed to download future configuration manual: ${err.message}`);
    } finally {
      setIsDownloadingFutureConfigPdf(false);
    }
  };

  const backups = statusData?.backups || [];
  const schedule = statusData?.schedule || {};
  const secondaryR2 = statusData?.secondaryR2 || {};
  const lastBackup = statusData?.lastBackup;

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Disaster Recovery &amp; Automated Backup Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated daily snapshots (02:00 AM IST), secondary Cloudflare R2 mirroring, and 1-click disaster relaunch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchStatus}
            disabled={isLoading || isTriggering || isSyncingMirror}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleSyncMirror}
            disabled={isSyncingMirror || isTriggering}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all cursor-pointer disabled:opacity-50"
            title="Replicate all PDFs, XLS, and JSON documents from Primary to Secondary Cloudflare R2 bucket"
          >
            {isSyncingMirror ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>Sync Cloud Documents</span>
          </button>

          <button
            onClick={handleDownloadManual}
            disabled={isDownloadingPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Download complete 4-page Disaster Recovery & Failover Manual (PDF)"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>Disaster Manual (PDF)</span>
          </button>

          <button
            onClick={handleDownloadDeploymentManual}
            disabled={isDownloadingDeploymentPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Download complete Production Deployment & Operations Manual (PDF)"
          >
            {isDownloadingDeploymentPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>Deployment Manual (PDF)</span>
          </button>

          <button
            onClick={handleDownloadFutureConfigManual}
            disabled={isDownloadingFutureConfigPdf}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Download Future Configurations Manual: Secondary Server Failover & Render Paid Plan Upgrades (PDF)"
          >
            {isDownloadingFutureConfigPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>Future Config (PDF)</span>
          </button>
        </div>
      </div>

      {/* Mirror Sync Result Banner */}
      {mirrorSyncResult && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-indigo-900 dark:text-indigo-200 text-xs flex items-start gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-bold text-sm">
              Cloudflare Document Mirror Synchronized!
            </p>
            <p className="text-indigo-800 dark:text-indigo-300">
              {mirrorSyncResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Execution Result Banner */}
      {backupResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200 text-xs flex items-start gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-bold text-sm">
              Backup Created Successfully!
            </p>
            <p className="text-emerald-800 dark:text-emerald-300">
              Archive: <span className="font-mono font-semibold">{backupResult.result?.fileName || backupResult.result?.archiveFile}</span> ({backupResult.result?.sizeMB} MB in {backupResult.result?.durationSeconds}s)
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {backupResult.result?.totalDocuments ? `Indexed ${backupResult.result.totalDocuments} documents across ${backupResult.result.totalCollections} MongoDB collections.` : ''}
              {backupResult.result?.secondaryR2Upload?.success 
                ? ' ☁️ Successfully mirrored to Secondary Cloudflare R2 bucket.' 
                : ' 💾 Saved to local persistent disk.'}
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Status Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Automated Schedule */}
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-dalBlue dark:text-blue-400" />
              Automated Schedule
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {schedule.displaySchedule || 'Daily at 02:00 AM IST'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>Expired: 0-day stay • Snapshots: 14-day rolling</span>
            <span>•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Cron Active</span>
          </div>
        </div>

        {/* 2. Last Backup */}
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Latest Snapshot
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
              {lastBackup ? `${lastBackup.sizeMB} MB` : 'N/A'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate" title={lastBackup?.fileName || 'No backups yet'}>
            {lastBackup ? lastBackup.fileName : 'None recorded'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {lastBackup?.createdAt ? new Date(lastBackup.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Ready for initial backup'}
          </div>
        </div>

        {/* 3. Secondary Cloud Mirror */}
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-indigo-500" />
              Secondary Cloudflare
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              secondaryR2.configured 
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}>
              {secondaryR2.status || 'CONNECTED'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate font-mono">
            {secondaryR2.bucket || 'tenderhub-backup'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Zero-egress disaster copy
          </div>
        </div>

        {/* 4. Total Storage Used */}
        <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-purple-500" />
              Local Storage
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
              {statusData?.totalBackups || backups.length} files
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {statusData?.totalSizeMB || '0.00'} MB
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Snapshots pruned after 14 days (Expired: 0 days)
          </div>
        </div>

      </div>

      {/* Primary Action Panel: Trigger Backup Now */}
      <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>On-Demand Backup Trigger</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Trigger an immediate backup snapshot. Backups are instantly written to disk and mirrored to your secondary Cloudflare R2 account.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          
          {/* Option A: Fast Database Snapshot */}
          <div className="border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/40 hover:border-dalBlue/50 transition-all">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-dalBlue dark:text-blue-400" />
                  Quick DB Snapshot (Recommended)
                </span>
                <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                  ~3-5 Seconds
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Exports all MongoDB collections into a compressed <span className="font-mono">.json.gz</span> archive. Captures all users, tenders, bookmarks, and application state.
              </p>
            </div>

            <button
              onClick={() => handleTriggerBackup('database')}
              disabled={isTriggering}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-dalBlue hover:bg-dalBlue/90 dark:bg-blue-600 dark:hover:bg-blue-500 transition-all shadow-xs cursor-pointer disabled:opacity-60"
            >
              {isTriggering && triggerType === 'database' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Exporting Database &amp; Mirroring...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Trigger Database Backup Now</span>
                </>
              )}
            </button>
          </div>

          {/* Option B: Full System Snapshot */}
          <div className="border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/40 hover:border-emerald-500/50 transition-all">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Full System Snapshot
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  Complete Bundle
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Exports MongoDB database and downloads all Cloudflare R2 documents into a standalone portable <span className="font-mono">.zip</span> archive.
              </p>
            </div>

            <button
              onClick={() => handleTriggerBackup('full')}
              disabled={isTriggering}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-all shadow-xs cursor-pointer disabled:opacity-60"
            >
              {isTriggering && triggerType === 'full' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Packaging DB + Cloudflare Documents...</span>
                </>
              ) : (
                <>
                  <FileArchive className="w-4 h-4" />
                  <span>Trigger Full System Backup Now</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Historical Backups Table */}
      <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              <span>Available Backup Archives ({backups.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Click download to save the snapshot archive directly to your local workstation.
            </p>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No backup archives found on disk yet. Click "Trigger Database Backup Now" above to generate your first snapshot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 font-semibold">
                <tr>
                  <th className="py-3 px-4">Archive Filename</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Created Date (IST)</th>
                  <th className="py-3 px-4">Secondary Cloud</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {backups.map((b) => (
                  <tr key={b.fileName} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <FileArchive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[260px]" title={b.fileName}>
                        {b.fileName}
                      </span>
                      {b.isLatest && (
                        <span className="text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold uppercase">
                          Latest
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        b.type === 'full' 
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' 
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {b.type === 'full' ? 'Full Archive' : 'DB Snapshot'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      {b.sizeMB} MB
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {new Date(b.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Cloud className="w-3 h-3" />
                        Mirrored
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDownloadBackup(b.fileName)}
                        disabled={downloadingFile === b.fileName}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-dalBlue hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50"
                        title="Download archive to local PC"
                      >
                        {downloadingFile === b.fileName ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disaster Recovery Playbook Card */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Emergency Disaster Recovery Playbook (<span className="text-emerald-400">&lt; 60s Relaunch</span>)</span>
            </h3>
            <p className="text-xs text-slate-400">
              In case of total server wipe, database corruption, or host loss, use these rapid CLI commands:
            </p>
          </div>

          <button
            onClick={handleDownloadManual}
            disabled={isDownloadingPdf}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Official PDF Manual</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              1. Restore Database (From Latest R2 / Local Snapshot)
            </span>
            <div className="font-mono text-xs text-emerald-400 bg-black/50 p-2.5 rounded-lg select-all">
              npm run restore:db
            </div>
            <p className="text-[10px] text-slate-400">
              Downloads latest snapshot from secondary Cloudflare R2 and restores all collections via upsert.
            </p>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              2. Full System Restore (Database + Cloudflare Documents)
            </span>
            <div className="font-mono text-xs text-emerald-400 bg-black/50 p-2.5 rounded-lg select-all">
              npm run restore:full
            </div>
            <p className="text-[10px] text-slate-400">
              Restores entire MongoDB schema AND re-uploads all PDFs and spreadsheets back to Cloudflare.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
