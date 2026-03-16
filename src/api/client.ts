// ─── Central API client — all calls go through here ─────────────────────────
// The Vite dev proxy forwards /api → http://localhost:3001
// In production, serve the backend on the same host.

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;   // YYYY-MM-DD
  month: string;  // YYYY-MM
  year: number;
  created_at: string;
}

export interface Remittance {
  id: number;
  amount: number;
  note: string;
  date: string;
  month: string;
  year: number;
  created_at: string;
}

export interface Investment {
  id: number;
  amount: number;
  note: string;
  date: string;
  month: string;
  year: number;
  created_at: string;
}

export interface MonthConfig {
  id: number;
  month: string;
  misc_budget: number;
  invest_amount: number;
  updated_at: string;
}

export interface MonthSummary {
  expenses: Expense[];
  remittances: Remittance[];
  investments: Investment[];
  config: MonthConfig | null;
}

export interface YearlySummary {
  expenses: Expense[];
  remittances: Remittance[];
  investments: Investment[];
}

export interface LifetimeTotals {
  totalSentToIndia: number;
  totalInvested: number;
  totalExpenses: number;
  remittances: Remittance[];
  investments: Investment[];
}

export interface DBStats {
  expenses: number;
  remittances: number;
  investments: number;
  configs: number;
  total: number;
  dbSizeBytes: number;
  dbPath: string;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  expenses: Expense[];
  remittances: Remittance[];
  investments: Investment[];
  configs: MonthConfig[];
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const apiHealth = () => req<{ ok: boolean; db: string; time: string }>('/health');

// ─── Expenses ────────────────────────────────────────────────────────────────

export const getExpenses     = (month?: string, year?: number) => {
  const q = month ? `?month=${month}` : year ? `?year=${year}` : '';
  return req<Expense[]>(`/expenses${q}`);
};
export const createExpense   = (data: { description: string; amount: number; category: string; date: string }) =>
  req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) });
export const updateExpense   = (id: number, data: Partial<Expense>) =>
  req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteExpense   = (id: number) =>
  req<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' });

// ─── Remittances ─────────────────────────────────────────────────────────────

export const getRemittances  = (month?: string, year?: number) => {
  const q = month ? `?month=${month}` : year ? `?year=${year}` : '';
  return req<Remittance[]>(`/remittances${q}`);
};
export const createRemittance = (data: { amount: number; note: string; date: string }) =>
  req<Remittance>('/remittances', { method: 'POST', body: JSON.stringify(data) });
export const updateRemittance = (id: number, data: Partial<Remittance>) =>
  req<Remittance>(`/remittances/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRemittance = (id: number) =>
  req<{ ok: boolean }>(`/remittances/${id}`, { method: 'DELETE' });

// ─── Investments ──────────────────────────────────────────────────────────────

export const getInvestments  = (month?: string, year?: number) => {
  const q = month ? `?month=${month}` : year ? `?year=${year}` : '';
  return req<Investment[]>(`/investments${q}`);
};
export const createInvestment = (data: { note: string; date: string }) =>
  req<Investment>('/investments', { method: 'POST', body: JSON.stringify(data) });
export const deleteInvestment = (id: number) =>
  req<{ ok: boolean }>(`/investments/${id}`, { method: 'DELETE' });

// ─── Month Config ─────────────────────────────────────────────────────────────

export const getMonthConfig  = (month: string) =>
  req<MonthConfig | null>(`/month-config/${month}`);
export const saveMonthConfig = (month: string, miscBudget: number) =>
  req<MonthConfig>('/month-config', { method: 'POST', body: JSON.stringify({ month, miscBudget }) });

// ─── Aggregates ───────────────────────────────────────────────────────────────

export const getMonthSummary = (month: string) =>
  req<MonthSummary>(`/summary/${month}`);
export const getLifetime     = () =>
  req<LifetimeTotals>('/lifetime');
export const getYearly       = (year: number) =>
  req<YearlySummary>(`/yearly/${year}`);
export const getDBStats      = () =>
  req<DBStats>('/stats');

// ─── Backup / Export ──────────────────────────────────────────────────────────

export function downloadBackupJSON() {
  // Direct browser download via link
  const a = document.createElement('a');
  a.href = `${BASE}/backup/json`;
  a.download = `expenseiq-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

export function downloadBackupCSV() {
  const a = document.createElement('a');
  a.href = `${BASE}/backup/csv`;
  a.download = `expenseiq-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

export const importBackup = (payload: unknown) =>
  req<{ ok: boolean; added: number; skipped: number }>('/backup/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ─── Clear All ────────────────────────────────────────────────────────────────

export const clearAllData = () =>
  req<{ ok: boolean; message: string }>('/data/all', { method: 'DELETE' });
