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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function parseMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
