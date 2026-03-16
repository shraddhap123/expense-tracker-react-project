import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getMonthSummary, getLifetime, getYearly, getDBStats,
  createExpense, updateExpense, deleteExpense,
  createRemittance, updateRemittance, deleteRemittance,
  createInvestment, deleteInvestment,
  saveMonthConfig as apiSaveMonthConfig,
  downloadBackupJSON, downloadBackupCSV,
  importBackup, clearAllData as apiClearAllData,
  type MonthSummary, type LifetimeTotals, type YearlySummary,
  type Expense, type Remittance,
} from '../api/client';
import { showToast } from '../components/Toast';

export const INVESTMENT_FIXED = 2500;

// ─── Global refresh bus ───────────────────────────────────────────────────────
// Any component can call `triggerRefresh()` and all useData hooks will re-fetch.
type Listener = () => void;
const listeners = new Set<Listener>();
let _writeCount = 0;

export function triggerRefresh() {
  _writeCount++;
  listeners.forEach(fn => fn());
}

function useRefreshSignal() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);
  return tick;
}

// Flash signal for header "Saving…" indicator
type FlashListener = () => void;
const flashListeners = new Set<FlashListener>();
export function onWriteFlash(fn: FlashListener) {
  flashListeners.add(fn);
  return () => flashListeners.delete(fn);
}
function emitFlash() { flashListeners.forEach(fn => fn()); }

async function withFlash<T>(fn: () => Promise<T>): Promise<T> {
  emitFlash();
  const result = await fn();
  triggerRefresh();
  return result;
}

// ─── Month Summary ────────────────────────────────────────────────────────────

export function useMonthSummary(month: string) {
  const tick = useRefreshSignal();
  const [data, setData] = useState<MonthSummary>({
    expenses: [], remittances: [], investments: [], config: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMonthSummary(month)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, tick]);

  const totalExpenses    = data.expenses.reduce((s, e) => s + e.amount, 0);
  const totalRemittances = data.remittances.reduce((s, r) => s + r.amount, 0);
  const totalInvested    = data.investments.reduce((s, i) => s + i.amount, 0);
  const miscBudget       = data.config?.misc_budget ?? 0;
  const monthlyBudget    = miscBudget + INVESTMENT_FIXED;
  const totalSpent       = totalExpenses + totalInvested; // India excluded from budget
  const remaining        = monthlyBudget - totalSpent;

  const byCategory: Record<string, number> = {};
  data.expenses.forEach(e => {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  });

  return {
    ...data,
    loading,
    totalExpenses,
    totalRemittances,
    totalInvested,
    miscBudget,
    monthlyBudget,
    totalSpent,
    remaining,
    byCategory,
  };
}

// ─── Lifetime Totals ──────────────────────────────────────────────────────────

export function useLifetimeTotals() {
  const tick = useRefreshSignal();
  const [data, setData] = useState<LifetimeTotals>({
    totalSentToIndia: 0, totalInvested: 0, totalExpenses: 0,
    remittances: [], investments: [],
  });

  useEffect(() => {
    getLifetime().then(setData).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return data;
}

// ─── Yearly Summary ───────────────────────────────────────────────────────────

export function useYearlySummary(year: number) {
  const tick = useRefreshSignal();
  const [data, setData] = useState<YearlySummary>({ expenses: [], remittances: [], investments: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getYearly(year).then(setData).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, tick]);

  return { ...data, loading };
}

// ─── DB Stats ─────────────────────────────────────────────────────────────────

export function useDBStats() {
  const tick = useRefreshSignal();
  const [stats, setStats] = useState<{
    expenses: number; remittances: number; investments: number;
    configs: number; total: number; dbSizeBytes: number; dbPath: string;
  } | null>(null);

  useEffect(() => {
    getDBStats().then(setStats).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return stats;
}

// ─── Write counter (for DBStatus live count) ──────────────────────────────────

export function useWriteCount() {
  const tick = useRefreshSignal();
  return tick;
}

// ─── EXPENSES ────────────────────────────────────────────────────────────────

export async function addExpense(data: {
  description: string; amount: number; category: string; date: string;
}) {
  return withFlash(() => createExpense(data));
}

export async function editExpense(id: number, data: Partial<Expense>) {
  return withFlash(() => updateExpense(id, data));
}

export async function removeExpense(id: number) {
  return withFlash(() => deleteExpense(id));
}

// ─── REMITTANCES ─────────────────────────────────────────────────────────────

export async function addRemittance(data: { amount: number; note: string; date: string }) {
  return withFlash(() => createRemittance(data));
}

export async function editRemittance(id: number, data: Partial<Remittance>) {
  return withFlash(() => updateRemittance(id, data));
}

export async function removeRemittance(id: number) {
  return withFlash(() => deleteRemittance(id));
}

// ─── INVESTMENTS ──────────────────────────────────────────────────────────────

export async function addInvestment(data: { note: string; date: string }) {
  return withFlash(() => createInvestment(data));
}

export async function removeInvestment(id: number) {
  return withFlash(() => deleteInvestment(id));
}

// ─── MONTH CONFIG ─────────────────────────────────────────────────────────────

export async function saveMonthConfig(month: string, miscBudget: number) {
  return withFlash(() => apiSaveMonthConfig(month, miscBudget));
}

// ─── EXPORT / BACKUP ──────────────────────────────────────────────────────────

export async function exportBackupJSON() {
  downloadBackupJSON();
  const meta = { exportedAt: new Date().toISOString() };
  localStorage.setItem('expenseiq_last_backup', JSON.stringify(meta));
  showToast({
    type: 'download',
    title: 'Backup downloading…',
    body: 'Your full database backup (.json) is downloading. Store it somewhere safe like Google Drive.',
    duration: 6000,
  });
}

export async function exportAllToCSV() {
  downloadBackupCSV();
  showToast({
    type: 'download',
    title: 'CSV downloading…',
    body: 'All records exported as .csv — open in Excel or Google Sheets.',
    duration: 5000,
  });
}

export async function importBackupJSON(file: File): Promise<{ added: number; skipped: number }> {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload.version || !Array.isArray(payload.expenses)) {
    throw new Error('Invalid backup file. Please use a file exported from ExpenseIQ.');
  }
  const result = await importBackup(payload);
  triggerRefresh();
  return result;
}

export async function clearAllData() {
  await apiClearAllData();
  triggerRefresh();
}

// ─── Last backup meta ─────────────────────────────────────────────────────────

export function getLastBackupMeta(): { exportedAt: string } | null {
  const raw = localStorage.getItem('expenseiq_last_backup');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Write flash hook (for header indicator) ──────────────────────────────────

export function useWriteFlash(): boolean {
  const [flashing, setFlashing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onWriteFlash(() => {
      setFlashing(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlashing(false), 1500);
    });
    return () => { unsub(); };
  }, []);

  return flashing;
}

// ─── API connection status ────────────────────────────────────────────────────

export function useAPIStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [dbPath, setDbPath] = useState('');
  const tick = useRefreshSignal();

  const check = useCallback(async () => {
    try {
      const h = await fetch('/api/health');
      if (h.ok) {
        const data = await h.json();
        setDbPath(data.db ?? '');
        setStatus('ok');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { check(); }, [check, tick]);

  return { status, dbPath, retry: check };
}
