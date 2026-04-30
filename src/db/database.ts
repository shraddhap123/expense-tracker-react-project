import Dexie, { Table } from 'dexie';

export type ExpenseCategory =
  | 'Food & Dining'
  | 'Transport'
  | 'Shopping'
  | 'Entertainment'
  | 'Health'
  | 'Utilities'
  | 'Housing'
  | 'Misc';

export interface Expense {
  id?: number;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // ISO date string YYYY-MM-DD
  month: string; // YYYY-MM
  year: number;
  createdAt: string;
}

export interface IndiaRemittance {
  id?: number;
  amount: number;
  note: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  year: number;
  createdAt: string;
}

export interface Investment {
  id?: number;
  amount: number; // fixed at 2500
  note: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  year: number;
  createdAt: string;
}

export interface MonthConfig {
  id?: number;
  month: string; // YYYY-MM  (primary key)
  miscBudget: number; // user-defined misc budget for this month
  investAmount: number; // always 2500 but stored for reference
}

export class ExpenseDB extends Dexie {
  expenses!: Table<Expense, number>;
  remittances!: Table<IndiaRemittance, number>;
  investments!: Table<Investment, number>;
  monthConfigs!: Table<MonthConfig, number>;

  constructor() {
    super('ExpenseIQDB');
    this.version(1).stores({
      expenses: '++id, date, month, year, category',
      remittances: '++id, date, month, year',
      investments: '++id, date, month, year',
      monthConfigs: '++id, &month',
    });
  }
}

export const db = new ExpenseDB();

// ─── Helpers ────────────────────────────────────────────────────────────────

export const INVESTMENT_FIXED = 2500;

export const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', name: 'US Dollar', usdRate: 1 },
  EUR: { code: 'EUR', name: 'Euro', usdRate: 1.08 },
  GBP: { code: 'GBP', name: 'British Pound', usdRate: 1.27 },
  INR: { code: 'INR', name: 'Indian Rupee', usdRate: 0.012 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', usdRate: 0.73 },
  AUD: { code: 'AUD', name: 'Australian Dollar', usdRate: 0.65 },
  AED: { code: 'AED', name: 'UAE Dirham', usdRate: 0.27 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', usdRate: 0.74 },
} as const;

export type SupportedCurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export const CATEGORIES: ExpenseCategory[] = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Health',
  'Utilities',
  'Housing',
  'Misc',
];

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Food & Dining': '#f97316',
  Transport: '#3b82f6',
  Shopping: '#a855f7',
  Entertainment: '#ec4899',
  Health: '#10b981',
  Utilities: '#f59e0b',
  Housing: '#6366f1',
  Misc: '#64748b',
};

export const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  'Food & Dining': '🍔',
  Transport: '🚗',
  Shopping: '🛍️',
  Entertainment: '🎬',
  Health: '💊',
  Utilities: '💡',
  Housing: '🏠',
  Misc: '📦',
};

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatCurrency(n: number): string {
  const currency = getPreferredDisplayCurrency();
  return formatCurrencyInCurrency(n, currency);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function normalizeCurrencyCode(code?: string): SupportedCurrencyCode {
  const normalized = String(code ?? 'USD').trim().toUpperCase() as SupportedCurrencyCode;
  return normalized in SUPPORTED_CURRENCIES ? normalized : 'USD';
}

export function convertUsdToCurrency(usdAmount: number, currencyCode?: string): number {
  const currency = normalizeCurrencyCode(currencyCode);
  return Number((usdAmount / SUPPORTED_CURRENCIES[currency].usdRate).toFixed(2));
}

export function convertCurrencyToUsd(amount: number, currencyCode?: string): number {
  const currency = normalizeCurrencyCode(currencyCode);
  return Number((amount * SUPPORTED_CURRENCIES[currency].usdRate).toFixed(2));
}

export function formatCurrencyInCurrency(usdAmount: number, currencyCode?: string): string {
  const currency = normalizeCurrencyCode(currencyCode);
  const displayAmount = convertUsdToCurrency(usdAmount, currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'INR' ? 0 : 2,
  }).format(displayAmount);
}

export function formatOriginalCurrency(amount: number, currencyCode?: string): string {
  const currency = normalizeCurrencyCode(currencyCode);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'INR' ? 0 : 2,
  }).format(amount);
}

export function getPreferredDisplayCurrency(): SupportedCurrencyCode {
  try {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return 'USD';
    const parsed = JSON.parse(raw);
    return normalizeCurrencyCode(parsed?.preferredCurrency);
  } catch {
    return 'USD';
  }
}

export function parseMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
