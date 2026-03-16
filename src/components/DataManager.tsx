import { useState, useEffect, useRef } from 'react';
import {
  Database, Download, Upload, Trash2,
  FileJson, FileText, CheckCircle2, AlertTriangle, RefreshCw,
  HardDrive, Server,
} from 'lucide-react';
import {
  exportBackupJSON, exportAllToCSV, importBackupJSON,
  clearAllData, getLastBackupMeta, useDBStats, useAPIStatus,
} from '../hooks/useDB';
import { showToast } from './Toast';

export default function DataManager() {
  const stats     = useDBStats();
  const { status, dbPath, retry } = useAPIStatus();
  const [backupMeta, setBackupMeta] = useState(getLastBackupMeta());
  const [importing, setImporting]   = useState(false);
  const [clearStep, setClearStep]   = useState<0 | 1 | 2>(0); // 0=idle, 1=confirm, 2=done
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBackupMeta(getLastBackupMeta());
  }, []);

  const handleExportJSON = async () => {
    await exportBackupJSON();
    setBackupMeta(getLastBackupMeta());
  };

  const handleExportCSV = () => exportAllToCSV();

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importBackupJSON(file);
      showToast({
        type: 'success',
        title: `Import complete — ${result.added} records restored`,
        body: `${result.skipped} duplicates skipped.`,
        duration: 6000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed.';
      showToast({ type: 'error', title: 'Import failed', body: msg, duration: 6000 });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClear = async () => {
    if (clearStep === 0) { setClearStep(1); return; }
    if (clearStep === 1) {
      await clearAllData();
      setClearStep(2);
      showToast({ type: 'error', title: 'All data cleared', body: 'Database has been wiped. Starting fresh.', duration: 6000 });
      setTimeout(() => setClearStep(0), 3000);
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-5">

      {/* ── Server / DB Status ── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-purple-400" />
            <h3 className="font-semibold text-white">Database Status</h3>
          </div>
          <button onClick={retry} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition-colors" title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>

        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${
          status === 'ok'       ? 'bg-emerald-500/10 border-emerald-500/20' :
          status === 'error'    ? 'bg-red-500/10 border-red-500/20' :
                                  'bg-white/5 border-white/10'
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full ${
            status === 'ok'    ? 'bg-emerald-400 animate-pulse' :
            status === 'error' ? 'bg-red-400' :
                                 'bg-yellow-400 animate-pulse'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              status === 'ok' ? 'text-emerald-300' : status === 'error' ? 'text-red-300' : 'text-yellow-300'
            }`}>
              {status === 'ok' ? '✅ SQLite connected' : status === 'error' ? '❌ Cannot reach server' : '⏳ Connecting…'}
            </p>
            {status === 'ok' && dbPath && (
              <p className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">{dbPath}</p>
            )}
            {status === 'error' && (
              <p className="text-[11px] text-red-400 mt-0.5">
                Make sure the backend is running: <span className="font-mono">node server/index.js</span>
              </p>
            )}
          </div>
        </div>

        {/* Record counts */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Expenses',    count: stats.expenses,    color: 'text-orange-400' },
              { label: 'India',       count: stats.remittances, color: 'text-amber-400' },
              { label: 'Investments', count: stats.investments, color: 'text-indigo-400' },
              { label: 'Configs',     count: stats.configs,     color: 'text-purple-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {stats && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <HardDrive size={12} />
            <span>DB file size: <span className="text-gray-300">{formatBytes(stats.dbSizeBytes)}</span></span>
            <span className="ml-auto text-gray-600">Total: {stats.total} records</span>
          </div>
        )}
      </div>

      {/* ── Backup & Export ── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-purple-400" />
          <h3 className="font-semibold text-white">Backup & Export</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-3 px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl transition-all group"
          >
            <FileJson size={18} className="text-purple-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Download JSON Backup</p>
              <p className="text-xs text-gray-400">Full restore backup</p>
            </div>
            <Download size={14} className="text-gray-500 ml-auto group-hover:text-purple-400 transition-colors" />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-3 px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl transition-all group"
          >
            <FileText size={18} className="text-emerald-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Export CSV</p>
              <p className="text-xs text-gray-400">Open in Excel / Sheets</p>
            </div>
            <Download size={14} className="text-gray-500 ml-auto group-hover:text-emerald-400 transition-colors" />
          </button>
        </div>

        {backupMeta && (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <CheckCircle2 size={12} />
            Last backup: {new Date(backupMeta.exportedAt).toLocaleString()}
          </div>
        )}
        {!backupMeta && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            You have never downloaded a backup. Download one now to be safe.
          </div>
        )}
      </div>

      {/* ── Import ── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Upload size={16} className="text-blue-400" />
          <h3 className="font-semibold text-white">Restore from Backup</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Select a previously exported <span className="text-white font-medium">.json</span> backup file.
          Duplicates are automatically skipped — safe to re-import multiple times.
        </p>
        <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
          importing
            ? 'border-blue-500/50 bg-blue-500/10 cursor-wait'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}>
          <Upload size={16} className="text-blue-400 shrink-0" />
          <span className="text-sm text-gray-300">{importing ? 'Importing…' : 'Choose .json backup file'}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            disabled={importing}
            onChange={handleImport}
          />
        </label>
      </div>

      {/* ── How data is stored ── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} className="text-gray-400" />
          <h3 className="font-semibold text-white">How Your Data is Stored</h3>
        </div>
        <div className="space-y-2 text-xs text-gray-400 leading-relaxed">
          <p>✅ <span className="text-white font-medium">SQLite database</span> — a real <span className="font-mono text-purple-300">expenseiq.db</span> file saved on your computer (in the project folder).</p>
          <p>✅ <span className="text-white font-medium">Survives everything</span> — browser clears, device restarts, incognito mode. Data lives on disk, not in the browser.</p>
          <p>✅ <span className="text-white font-medium">Instant persistence</span> — every entry is written to SQLite the moment you save it.</p>
          <p>✅ <span className="text-white font-medium">Works like a real website</span> — React frontend talks to an Express backend, just like production apps.</p>
          <p>⚠️ <span className="text-white font-medium">To use on another computer</span> — copy the <span className="font-mono text-purple-300">expenseiq.db</span> file to the same folder on the new machine, or use the JSON backup to restore.</p>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trash2 size={16} className="text-red-400" />
          <h3 className="font-semibold text-red-300">Danger Zone — Start Fresh</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          This permanently deletes <span className="text-red-300 font-semibold">ALL data</span> from the SQLite database —
          every expense, transfer, investment, and budget config. This cannot be undone.
          <span className="text-white font-medium"> Download a backup first!</span>
        </p>
        <button
          onClick={handleClear}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            clearStep === 2
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : clearStep === 1
              ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
              : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400'
          }`}
        >
          <Trash2 size={14} />
          {clearStep === 2 ? '✓ All data cleared' : clearStep === 1 ? '⚠ Click again to confirm — this is irreversible!' : 'Delete All Data & Start Fresh'}
        </button>
      </div>
    </div>
  );
}
