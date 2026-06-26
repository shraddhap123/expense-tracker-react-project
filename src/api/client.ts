// ─── Central API client — all calls go through here ─────────────────────────
// The Vite dev proxy forwards /api → http://localhost:3001
// In production, serve the backend on the same host.

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Expense {
  id: number;
  description: string;
  amount: number;
  original_amount: number;
  currency_code: string;
  category: string;
  date: string;   // YYYY-MM-DD
  month: string;  // YYYY-MM
  year: number;
  created_at: string;
  recurring_rule_id: number | null;
}

export interface RecurringExpenseRule {
  id: number;
  user_id: number;
  description: string;
  amount: number;
  original_amount: number;
  currency_code: string;
  category: string;
  day_of_month: number;
  start_month: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Remittance {
  id: number;
  amount: number;
  original_amount: number;
  currency_code: string;
  note: string;
  date: string;
  month: string;
  year: number;
  created_at: string;
}

export interface Investment {
  id: number;
  amount: number;
  original_amount: number;
  currency_code: string;
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
  dbPath: string | null;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  expenses: Expense[];
  remittances: Remittance[];
  investments: Investment[];
  configs: MonthConfig[];
}

export interface DriverInsight {
  category: string;
  current: number;
  previous: number;
  average: number;
  deltaFromPrevious: number;
  deltaFromAverage: number;
  shareOfCurrent: number;
}

export interface UnusualPurchaseInsight {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  reason: string;
  baselineAmount: number | null;
}

export interface RecurringIncreaseInsight {
  description: string;
  currentAmount: number;
  previousAverage: number;
  increaseAmount: number;
  increasePercent: number;
  monthsSeen: number;
}

export interface LifestyleDriftCategory {
  category: string;
  recentAverage: number;
  baselineAverage: number;
  changeAmount: number;
  changePercent: number | null;
  status: 'up' | 'down' | 'steady';
  trend: 'trend' | 'one-off';
}

export interface MonthlyAnalysis {
  month: string;
  monthLabel: string;
  previousMonth: string;
  previousMonthLabel: string;
  trailingAverageMonths: string[];
  totals: {
    currentSpent: number;
    currentExpenses: number;
    currentInvested: number;
    currentRemittances: number;
    previousSpent: number;
    trailingAverageSpent: number;
    trailingAverageExpenseOnly: number;
    budget: number;
    remainingBudget: number;
    expectedRecurringForMonth: number;
    recurringAlreadyLogged: number;
    projectedMonthEndSpend: number;
  };
  whyDifferent: {
    summary: string;
    deltaFromPrevious: number;
    deltaFromPreviousPercent: number | null;
    deltaFromAverage: number;
    deltaFromAveragePercent: number | null;
    biggestDrivers: DriverInsight[];
    unusualPurchases: UnusualPurchaseInsight[];
    recurringCostIncreases: RecurringIncreaseInsight[];
  };
  lifestyleDrift: {
    summary: string;
    categories: LifestyleDriftCategory[];
  };
  monthlyMemo: {
    headline: string;
    whatChanged: string;
    whatWentWell: string;
    watchNext: string;
    suggestedAction: string;
    llmNarrative: string | null;
    llmModel: string | null;
  };
}

export interface AffordabilityAnalysis {
  status: 'green' | 'yellow' | 'red';
  amount: number;
  label: string | null;
  budget: number;
  remainingBudget: number;
  projectedWithoutPurchase: number;
  projectedAfterPurchase: number;
  safetyBuffer: number;
  recurringGap: number;
  trailingAverageSpent: number;
  explanation: string;
  reasons: string[];
}

export interface MoneyStoryEvent {
  type: string;
  month: string;
  monthLabel: string;
  title: string;
  body: string;
  amount?: number;
  tone: 'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'gray';
  icon: 'start' | 'spike' | 'savings' | 'recurring' | 'transfer' | 'milestone';
}

export interface SubscriptionDriftItem {
  description: string;
  currentAmount: number;
  previousAverage: number;
  increaseAmount: number;
  increasePercent: number;
  monthsSeen: number;
  frequencyLabel: string;
  summary: string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const apiHealth = () => req<{ ok: boolean; db: string; time: string }>('/health');

// ─── Expenses ────────────────────────────────────────────────────────────────

export const getExpenses     = (month?: string, year?: number) => {
  const q = month ? `?month=${month}` : year ? `?year=${year}` : '';
  return req<Expense[]>(`/expenses${q}`);
};
export const createExpense   = (data: { description: string; amount: number; category: string; date: string; currencyCode?: string; originalAmount?: number }) =>
  req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) });
export const updateExpense   = (id: number, data: Partial<Expense>) =>
  req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteExpense   = (id: number) =>
  req<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' });

// ─── Recurring Expenses ──────────────────────────────────────────────────────

export const getRecurringExpenseRules = () =>
  req<RecurringExpenseRule[]>('/recurring-expenses');
export const createRecurringExpenseRule = (data: {
  description: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  startMonth: string;
  currencyCode?: string;
  originalAmount?: number;
}) => req<RecurringExpenseRule>('/recurring-expenses', { method: 'POST', body: JSON.stringify(data) });
export const updateRecurringExpenseRule = (id: number, data: Partial<{
  description: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  startMonth: string;
  active: boolean;
  currencyCode: string;
  originalAmount: number;
}>) => req<RecurringExpenseRule>(`/recurring-expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRecurringExpenseRule = (id: number) =>
  req<{ ok: boolean }>(`/recurring-expenses/${id}`, { method: 'DELETE' });

// ─── Remittances ─────────────────────────────────────────────────────────────

export const getRemittances  = (month?: string, year?: number) => {
  const q = month ? `?month=${month}` : year ? `?year=${year}` : '';
  return req<Remittance[]>(`/remittances${q}`);
};
export const createRemittance = (data: { amount: number; note: string; date: string; currencyCode?: string; originalAmount?: number }) =>
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
export const createInvestment = (data: { note: string; date: string; amount?: number }) =>
  req<Investment>('/investments', { method: 'POST', body: JSON.stringify(data) });
export const deleteInvestment = (id: number) =>
  req<{ ok: boolean }>(`/investments/${id}`, { method: 'DELETE' });

// ─── Month Config ─────────────────────────────────────────────────────────────

export const getMonthConfig  = (month: string) =>
  req<MonthConfig | null>(`/month-config/${month}`);
export const saveMonthConfig = (month: string, miscBudget: number, investAmount?: number) =>
  req<MonthConfig>('/month-config', { method: 'POST', body: JSON.stringify({ month, miscBudget, investAmount }) });

// ─── Aggregates ───────────────────────────────────────────────────────────────

export const getMonthSummary = (month: string) =>
  req<MonthSummary>(`/summary/${month}`);
export const getLifetime     = () =>
  req<LifetimeTotals>('/lifetime');
export const getYearly       = (year: number) =>
  req<YearlySummary>(`/yearly/${year}`);
export const getDBStats      = () =>
  req<DBStats>('/stats');
export const getMonthlyAnalysis = (month: string) =>
  req<MonthlyAnalysis>(`/analysis/month/${month}`);
export const getAffordabilityAnalysis = (data: { month: string; amount: number; label?: string }) =>
  req<AffordabilityAnalysis>('/analysis/affordability', { method: 'POST', body: JSON.stringify(data) });
export const getMoneyStoryTimeline = () =>
  req<MoneyStoryEvent[]>('/analysis/story-timeline');
export const getSubscriptionDrift = () =>
  req<SubscriptionDriftItem[]>('/analysis/subscription-drift');

// ─── Backup / Export ──────────────────────────────────────────────────────────

async function downloadAuthenticatedFile(path: string, fallbackFilename: string) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const contentDisposition = res.headers.get('content-disposition');
  const filename = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackFilename;

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }, 500);
}

export function downloadBackupJSON() {
  return downloadAuthenticatedFile(
    '/backup/json',
    `expenseiq-backup-${new Date().toISOString().split('T')[0]}.json`,
  );
}

export function downloadBackupCSV() {
  return downloadAuthenticatedFile(
    '/backup/csv',
    `expenseiq-export-${new Date().toISOString().split('T')[0]}.csv`,
  );
}

export const importBackup = (payload: unknown) =>
  req<{ ok: boolean; added: number; skipped: number }>('/backup/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ─── Clear All ────────────────────────────────────────────────────────────────

export const clearAllData = () =>
  req<{ ok: boolean; message: string }>('/data/all', { method: 'DELETE' });
