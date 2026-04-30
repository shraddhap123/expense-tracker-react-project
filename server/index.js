import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import authRoutes from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { canGenerateCoachNarrative, generateCoachNarrative } from './lib/aiNarrator.js';
import { buildAffordabilityCheck, buildMonthlyAnalysis, shiftMonth } from './lib/moneyCoach.js';
import { normalizeCurrencyCode, normalizeMoneyInput } from './lib/currency.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

// ── DB file lives in project root so it persists forever ─────────────────────
const DB_PATH = path.join(__dirname, '..', 'expenseiq.db');
const db = new Database(DB_PATH);

// ── WAL mode = much faster writes, safe concurrent reads ─────────────────────
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    original_amount REAL NOT NULL DEFAULT 0,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    category    TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    month       TEXT    NOT NULL,
    year        INTEGER NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS remittances (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     REAL NOT NULL,
    original_amount REAL NOT NULL DEFAULT 0,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    note       TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    month      TEXT NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     REAL NOT NULL DEFAULT 2500,
    original_amount REAL NOT NULL DEFAULT 2500,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    note       TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    month      TEXT NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS month_configs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    month         TEXT    NOT NULL,
    misc_budget   REAL    NOT NULL DEFAULT 0,
    invest_amount REAL    NOT NULL DEFAULT 2500,
    user_id       INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(month, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_month  ON expenses(month);
  CREATE INDEX IF NOT EXISTS idx_expenses_year   ON expenses(year);
  CREATE INDEX IF NOT EXISTS idx_remit_month     ON remittances(month);
  CREATE INDEX IF NOT EXISTS idx_remit_year      ON remittances(year);
  CREATE INDEX IF NOT EXISTS idx_invest_month    ON investments(month);
  CREATE INDEX IF NOT EXISTS idx_invest_year     ON investments(year);

  -- Auth tables
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT    NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    display_name TEXT    NOT NULL,
    preferred_currency TEXT NOT NULL DEFAULT 'USD',
    role         TEXT    NOT NULL DEFAULT 'owner' CHECK(role IN ('owner', 'viewer')),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT    NOT NULL UNIQUE,
    expires_at   TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT    NOT NULL UNIQUE,
    expires_at   TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recurring_expense_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description   TEXT    NOT NULL,
    amount        REAL    NOT NULL,
    original_amount REAL  NOT NULL DEFAULT 0,
    currency_code TEXT    NOT NULL DEFAULT 'USD',
    category      TEXT    NOT NULL,
    day_of_month  INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
    start_month   TEXT    NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recurring_expense_skips (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recurring_rule_id  INTEGER NOT NULL REFERENCES recurring_expense_rules(id) ON DELETE CASCADE,
    month              TEXT    NOT NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, recurring_rule_id, month)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id),
    action       TEXT    NOT NULL,
    resource_type TEXT   NOT NULL,
    resource_id  INTEGER,
    details      TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_recurring_expense_rules_user ON recurring_expense_rules(user_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_expense_rules_active ON recurring_expense_rules(user_id, active, start_month);
  CREATE INDEX IF NOT EXISTS idx_recurring_expense_skips_user ON recurring_expense_skips(user_id, recurring_rule_id, month);
`);

console.log(`✅ SQLite DB ready at: ${DB_PATH}`);

// ── Migration: Add user_id to existing tables (if not exists) ─────────────────
function getTableSql(table) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql ?? '';
}

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

if (!hasColumn('expenses', 'user_id')) {
  db.exec('ALTER TABLE expenses ADD COLUMN user_id INTEGER DEFAULT 1');
}
if (!hasColumn('expenses', 'original_amount')) {
  db.exec('ALTER TABLE expenses ADD COLUMN original_amount REAL DEFAULT 0');
  db.exec("UPDATE expenses SET original_amount = amount WHERE original_amount = 0");
}
if (!hasColumn('expenses', 'currency_code')) {
  db.exec("ALTER TABLE expenses ADD COLUMN currency_code TEXT DEFAULT 'USD'");
}
if (!hasColumn('expenses', 'recurring_rule_id')) {
  db.exec('ALTER TABLE expenses ADD COLUMN recurring_rule_id INTEGER REFERENCES recurring_expense_rules(id) ON DELETE SET NULL');
}
if (!hasColumn('remittances', 'user_id')) {
  db.exec('ALTER TABLE remittances ADD COLUMN user_id INTEGER DEFAULT 1');
}
if (!hasColumn('remittances', 'original_amount')) {
  db.exec('ALTER TABLE remittances ADD COLUMN original_amount REAL DEFAULT 0');
  db.exec("UPDATE remittances SET original_amount = amount WHERE original_amount = 0");
}
if (!hasColumn('remittances', 'currency_code')) {
  db.exec("ALTER TABLE remittances ADD COLUMN currency_code TEXT DEFAULT 'USD'");
}
if (!hasColumn('investments', 'user_id')) {
  db.exec('ALTER TABLE investments ADD COLUMN user_id INTEGER DEFAULT 1');
}
if (!hasColumn('investments', 'original_amount')) {
  db.exec('ALTER TABLE investments ADD COLUMN original_amount REAL DEFAULT 2500');
  db.exec("UPDATE investments SET original_amount = amount WHERE original_amount = 2500");
}
if (!hasColumn('investments', 'currency_code')) {
  db.exec("ALTER TABLE investments ADD COLUMN currency_code TEXT DEFAULT 'USD'");
}
if (!hasColumn('users', 'preferred_currency')) {
  db.exec("ALTER TABLE users ADD COLUMN preferred_currency TEXT DEFAULT 'USD'");
}
if (!hasColumn('recurring_expense_rules', 'original_amount')) {
  db.exec('ALTER TABLE recurring_expense_rules ADD COLUMN original_amount REAL DEFAULT 0');
  db.exec("UPDATE recurring_expense_rules SET original_amount = amount WHERE original_amount = 0");
}
if (!hasColumn('recurring_expense_rules', 'currency_code')) {
  db.exec("ALTER TABLE recurring_expense_rules ADD COLUMN currency_code TEXT DEFAULT 'USD'");
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_expenses_user_month ON expenses(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_remittances_user_month ON remittances(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_investments_user_month ON investments(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_expenses_recurring_rule ON expenses(recurring_rule_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_rule_month
    ON expenses(user_id, recurring_rule_id, month)
    WHERE recurring_rule_id IS NOT NULL;
`);

function ensureMonthConfigsSchema() {
  const monthConfigsSql = getTableSql('month_configs');
  const hasUserId = hasColumn('month_configs', 'user_id');
  const hasCompositeUnique = /UNIQUE\s*\(\s*month\s*,\s*user_id\s*\)/i.test(monthConfigsSql);
  const usesLegacyUniqueMonth = /\bmonth\b\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(monthConfigsSql);

  if (hasUserId && hasCompositeUnique && !usesLegacyUniqueMonth) {
    return;
  }

  db.exec(`
    ALTER TABLE month_configs RENAME TO month_configs_legacy;

    CREATE TABLE month_configs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      month         TEXT    NOT NULL,
      misc_budget   REAL    NOT NULL DEFAULT 0,
      invest_amount REAL    NOT NULL DEFAULT 2500,
      user_id       INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month, user_id)
    );

    INSERT INTO month_configs (id, month, misc_budget, invest_amount, user_id, updated_at)
    SELECT
      id,
      month,
      COALESCE(misc_budget, 0),
      COALESCE(invest_amount, 2500),
      COALESCE(user_id, 1),
      COALESCE(updated_at, datetime('now'))
    FROM month_configs_legacy;

    DROP TABLE month_configs_legacy;

    CREATE INDEX IF NOT EXISTS idx_month_configs_user_month ON month_configs(user_id, month);
  `);
}

ensureMonthConfigsSchema();

// ── Migration: Create default owner if no users exist ─────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  const bootstrapEmail = process.env.BOOTSTRAP_USER_EMAIL?.trim().toLowerCase()
    || process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.BOOTSTRAP_USER_PASSWORD || process.env.BOOTSTRAP_OWNER_PASSWORD;
  const bootstrapName = process.env.BOOTSTRAP_USER_NAME?.trim()
    || process.env.BOOTSTRAP_OWNER_NAME?.trim()
    || 'Owner';

  if (bootstrapEmail && bootstrapPassword) {
    const passwordHash = bcrypt.hashSync(bootstrapPassword, 10);
    db.prepare(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run(bootstrapEmail, passwordHash, bootstrapName, 'owner');
    console.log(`🔐 Bootstrapped account for ${bootstrapEmail}`);
  } else if (!IS_PRODUCTION) {
    const defaultPassword = bcrypt.hashSync('changeme123', 10);
    db.prepare(
      "INSERT INTO users (email, password_hash, display_name, role) VALUES ('owner@expenseiq.local', ?, 'Owner', 'owner')"
    ).run(defaultPassword);
    console.log('🔐 Created default local account: owner@expenseiq.local / changeme123');
    console.log('⚠️  Please change the password after first login!');
  } else {
    console.warn('⚠️  No account found. Create the first account through /api/auth/register.');
  }
}

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();

// Attach db to req for middleware access
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: IS_PRODUCTION ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  } : false,
}));
app.use(cors({
  origin(origin, callback) {
    if (!allowedOrigins || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Auth routes
app.use('/api/auth', authRoutes);

// ── Helper ────────────────────────────────────────────────────────────────────
function toMonthKey(dateStr) {
  return dateStr.slice(0, 7); // "2025-01-15" → "2025-01"
}
function toYear(dateStr) {
  return parseInt(dateStr.slice(0, 4), 10);
}
function compareMonthKeys(left, right) {
  return left.localeCompare(right);
}
function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}
function isFutureMonth(month) {
  return compareMonthKeys(month, currentMonthKey()) > 0;
}
function daysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}
function dateForMonthDay(month, dayOfMonth) {
  const safeDay = Math.min(Math.max(dayOfMonth, 1), daysInMonth(month));
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}
function listMonthsInRange(startMonth, endMonth) {
  const months = [];
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const cursor = new Date(startYear, startMonthNumber - 1, 1);
  const end = new Date(endYear, endMonthNumber - 1, 1);

  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
function ensureRecurringExpensesForRange(userId, startMonth, endMonth) {
  if (!startMonth || !endMonth || compareMonthKeys(startMonth, endMonth) > 0) {
    return;
  }

  const cappedEndMonth = compareMonthKeys(endMonth, currentMonthKey()) > 0 ? currentMonthKey() : endMonth;
  if (compareMonthKeys(startMonth, cappedEndMonth) > 0) {
    return;
  }

  const rules = db.prepare(`
    SELECT id, description, amount, category, day_of_month, start_month
    FROM recurring_expense_rules
    WHERE user_id = ? AND active = 1 AND start_month <= ?
    ORDER BY start_month, id
  `).all(userId, cappedEndMonth);

  if (rules.length === 0) {
    return;
  }

  const months = listMonthsInRange(startMonth, cappedEndMonth);
  const hasExpense = db.prepare(
    'SELECT 1 FROM expenses WHERE user_id = ? AND recurring_rule_id = ? AND month = ?'
  );
  const hasSkip = db.prepare(
    'SELECT 1 FROM recurring_expense_skips WHERE user_id = ? AND recurring_rule_id = ? AND month = ?'
  );
  const insertExpense = db.prepare(`
    INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, user_id, recurring_rule_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const month of months) {
      for (const rule of rules) {
        if (compareMonthKeys(rule.start_month, month) > 0) {
          continue;
        }
        if (hasSkip.get(userId, rule.id, month) || hasExpense.get(userId, rule.id, month)) {
          continue;
        }

        const date = dateForMonthDay(month, rule.day_of_month);
        insertExpense.run(
          rule.description,
          rule.amount,
          rule.original_amount || rule.amount,
          normalizeCurrencyCode(rule.currency_code),
          rule.category,
          date,
          month,
          toYear(date),
          userId,
          rule.id
        );
      }
    }
  })();
}
function ensureRecurringExpensesForMonth(userId, month) {
  ensureRecurringExpensesForRange(userId, month, month);
}
function ensureRecurringExpensesThroughCurrentMonth(userId) {
  const earliestRule = db.prepare(
    'SELECT start_month FROM recurring_expense_rules WHERE user_id = ? AND active = 1 ORDER BY start_month LIMIT 1'
  ).get(userId);

  if (!earliestRule?.start_month) {
    return;
  }

  ensureRecurringExpensesForRange(userId, earliestRule.start_month, currentMonthKey());
}
function ensureRecurringExpensesForYear(userId, year) {
  const current = currentMonthKey();
  const currentYear = Number(current.slice(0, 4));
  if (year > currentYear) {
    return;
  }

  const endMonth = year < currentYear ? `${year}-12` : current;
  ensureRecurringExpensesForRange(userId, `${year}-01`, endMonth);
}
function getMonthSummaryData(userId, month) {
  ensureRecurringExpensesForMonth(userId, month);
  const expenses = db.prepare('SELECT * FROM expenses WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  const remittances = db.prepare('SELECT * FROM remittances WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  const config = db.prepare('SELECT * FROM month_configs WHERE month = ? AND user_id = ?').get(month, userId) ?? null;
  return {
    month,
    expenses,
    remittances,
    investments,
    config,
  };
}
function getExpectedRecurringForMonth(userId, month) {
  return db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM recurring_expense_rules
    WHERE user_id = ? AND active = 1 AND start_month <= ?
  `).get(userId, month).total;
}
function buildSubscriptionDriftRows(userId) {
  ensureRecurringExpensesThroughCurrentMonth(userId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY month, date').all(userId);
  const groups = new Map();

  for (const expense of expenses) {
    const normalized = String(expense.description ?? '')
      .toLowerCase()
      .replace(/\d+/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) continue;

    const existing = groups.get(normalized) ?? [];
    existing.push(expense);
    groups.set(normalized, existing);
  }

  return [...groups.values()]
    .map((rows) => {
      const months = [...new Set(rows.map((row) => row.month))];
      if (months.length < 3) return null;

      const sortedRows = [...rows].sort((left, right) => left.month.localeCompare(right.month));
      const previousRows = sortedRows.slice(0, -1);
      const latestMonth = sortedRows[sortedRows.length - 1].month;
      const latestRows = sortedRows.filter((row) => row.month === latestMonth);
      const currentAmount = latestRows.reduce((sum, row) => sum + row.amount, 0) / latestRows.length;
      const previousAverage = previousRows.reduce((sum, row) => sum + row.amount, 0) / previousRows.length;
      const increaseAmount = currentAmount - previousAverage;
      if (previousAverage <= 0 || increaseAmount < 5 || currentAmount < previousAverage * 1.08) return null;

      return {
        description: sortedRows[sortedRows.length - 1].description,
        currentAmount,
        previousAverage,
        increaseAmount,
        increasePercent: (increaseAmount / previousAverage) * 100,
        monthsSeen: months.length,
        frequencyLabel: rows.some((row) => row.recurring_rule_id) ? 'Saved recurring rule' : 'Detected from repeated charges',
        summary: `${sortedRows[sortedRows.length - 1].description} is now averaging $${currentAmount.toFixed(0)} after sitting closer to $${previousAverage.toFixed(0)} before.`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.increaseAmount - left.increaseAmount)
    .slice(0, 8);
}
function buildMoneyStoryTimeline(userId) {
  ensureRecurringExpensesThroughCurrentMonth(userId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY month, date').all(userId);
  const remittances = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY month, date').all(userId);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY month, date').all(userId);
  const configs = db.prepare('SELECT * FROM month_configs WHERE user_id = ? ORDER BY month').all(userId);
  const monthly = new Map();
  const ensureMonth = (month) => {
    if (!monthly.has(month)) {
      monthly.set(month, { expenses: 0, india: 0, invest: 0, categories: {}, config: null });
    }
    return monthly.get(month);
  };

  expenses.forEach((row) => {
    const bucket = ensureMonth(row.month);
    bucket.expenses += row.amount;
    bucket.categories[row.category] = (bucket.categories[row.category] ?? 0) + row.amount;
  });
  remittances.forEach((row) => { ensureMonth(row.month).india += row.amount; });
  investments.forEach((row) => { ensureMonth(row.month).invest += row.amount; });
  configs.forEach((row) => { ensureMonth(row.month).config = row; });

  const months = [...monthly.entries()].map(([month, data]) => ({
    month,
    monthLabel: new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    total: data.expenses + data.invest,
    expenses: data.expenses,
    india: data.india,
    invest: data.invest,
    categories: data.categories,
    config: data.config,
  })).sort((left, right) => left.month.localeCompare(right.month));

  const events = [];
  if (months.length > 0) {
    events.push({
      type: 'tracking-started',
      month: months[0].month,
      monthLabel: months[0].monthLabel,
      title: 'Your money story started',
      body: `This is the first month with tracked activity in ExpenseIQ.`,
      tone: 'blue',
      icon: 'start',
    });
  }

  const highestSpend = [...months].sort((left, right) => right.total - left.total)[0];
  if (highestSpend && highestSpend.total > 0) {
    events.push({
      type: 'highest-spend',
      month: highestSpend.month,
      monthLabel: highestSpend.monthLabel,
      title: 'Biggest spending month',
      body: `${highestSpend.monthLabel} was your heaviest month so far across misc expenses and investments.`,
      amount: highestSpend.total,
      tone: 'purple',
      icon: 'spike',
    });
  }

  const bestBudgetMonth = months
    .filter((entry) => entry.config)
    .map((entry) => ({ ...entry, remaining: (entry.config.misc_budget + entry.config.invest_amount) - entry.total }))
    .filter((entry) => entry.remaining > 0)
    .sort((left, right) => right.remaining - left.remaining)[0];
  if (bestBudgetMonth) {
    events.push({
      type: 'best-budget',
      month: bestBudgetMonth.month,
      monthLabel: bestBudgetMonth.monthLabel,
      title: 'Best cushion month',
      body: `You finished ${bestBudgetMonth.monthLabel} with the most room left in your plan.`,
      amount: bestBudgetMonth.remaining,
      tone: 'emerald',
      icon: 'savings',
    });
  }

  const topCategorySpike = months
    .flatMap((entry) => Object.entries(entry.categories).map(([category, amount]) => ({ month: entry.month, monthLabel: entry.monthLabel, category, amount })))
    .sort((left, right) => right.amount - left.amount)[0];
  if (topCategorySpike) {
    events.push({
      type: 'category-spike',
      month: topCategorySpike.month,
      monthLabel: topCategorySpike.monthLabel,
      title: `Biggest ${topCategorySpike.category} month`,
      body: `${topCategorySpike.category} peaked here more than any other month so far.`,
      amount: topCategorySpike.amount,
      tone: 'amber',
      icon: 'spike',
    });
  }

  const firstRecurring = expenses.find((row) => row.recurring_rule_id) ?? buildSubscriptionDriftRows(userId)[0];
  if (firstRecurring) {
    const recurringMonth = firstRecurring.month ?? months[0]?.month;
    const recurringLabel = recurringMonth ? new Date(`${recurringMonth}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : '';
    events.push({
      type: 'recurring-detected',
      month: recurringMonth,
      monthLabel: recurringLabel,
      title: 'Recurring rhythm showed up',
      body: `${firstRecurring.description} became part of the repeating pattern in your account history.`,
      amount: firstRecurring.amount ?? firstRecurring.currentAmount,
      tone: 'blue',
      icon: 'recurring',
    });
  }

  if (remittances.length > 0) {
    const firstTransfer = remittances[0];
    events.push({
      type: 'first-transfer',
      month: firstTransfer.month,
      monthLabel: new Date(`${firstTransfer.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      title: 'First India transfer logged',
      body: `You started tracking remittances here, which makes your total outflow story more complete.`,
      amount: firstTransfer.amount,
      tone: 'rose',
      icon: 'transfer',
    });
  }

  if (investments.length > 0) {
    const firstInvestment = investments[0];
    events.push({
      type: 'first-investment',
      month: firstInvestment.month,
      monthLabel: new Date(`${firstInvestment.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      title: 'Investment habit began',
      body: `This is the first month with a tracked investment entry in your account history.`,
      amount: firstInvestment.amount,
      tone: 'emerald',
      icon: 'milestone',
    });
  }

  return events
    .filter((event) => event.month)
    .sort((left, right) => right.month.localeCompare(left.month));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/expenses', authMiddleware, (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  let rows;
  if (month) {
    ensureRecurringExpensesForMonth(userId, month);
    rows = db.prepare('SELECT * FROM expenses WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  } else if (year) {
    ensureRecurringExpensesForYear(userId, Number(year));
    rows = db.prepare('SELECT * FROM expenses WHERE user_id = ? AND year = ? ORDER BY date DESC').all(userId, Number(year));
  } else {
    ensureRecurringExpensesThroughCurrentMonth(userId);
    rows = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC').all(userId);
  }
  res.json(rows);
});

app.post('/api/expenses', authMiddleware, (req, res) => {
  const { description, amount, originalAmount, currencyCode, category, date } = req.body;
  if (!description || !(amount ?? originalAmount) || !category || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const money = normalizeMoneyInput(originalAmount ?? amount, currencyCode);
  const stmt = db.prepare(
    'INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(description, money.amountUsd, money.originalAmount, money.currencyCode, category, date, toMonthKey(date), toYear(date), req.user.id);
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/expenses/:id', authMiddleware, (req, res) => {
  const { description, amount, originalAmount, currencyCode, category, date } = req.body;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newDate   = date        ?? existing.date;
  const newDesc   = description ?? existing.description;
  const newCat    = category    ?? existing.category;
  const newMoney  = req.body.amount !== undefined || req.body.originalAmount !== undefined || req.body.currencyCode !== undefined
    ? normalizeMoneyInput(originalAmount ?? amount ?? existing.original_amount ?? existing.amount, currencyCode ?? existing.currency_code)
    : {
        amountUsd: existing.amount,
        originalAmount: existing.original_amount ?? existing.amount,
        currencyCode: normalizeCurrencyCode(existing.currency_code),
      };

  db.prepare(
    'UPDATE expenses SET description=?, amount=?, original_amount=?, currency_code=?, category=?, date=?, month=?, year=? WHERE id=?'
  ).run(newDesc, newMoney.amountUsd, newMoney.originalAmount, newMoney.currencyCode, newCat, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id));

  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(req.params.id)));
});

app.delete('/api/expenses/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (existing.recurring_rule_id) {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO recurring_expense_skips (user_id, recurring_rule_id, month)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, recurring_rule_id, month) DO NOTHING
      `).run(req.user.id, existing.recurring_rule_id, existing.month);
      db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
    })();
  } else {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING EXPENSE RULES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/recurring-expenses', authMiddleware, (req, res) => {
  const rules = db.prepare(`
    SELECT *
    FROM recurring_expense_rules
    WHERE user_id = ?
    ORDER BY active DESC, created_at DESC
  `).all(req.user.id);

  res.json(rules);
});

app.post('/api/recurring-expenses', authMiddleware, (req, res) => {
  const { description, amount, originalAmount, currencyCode, category, dayOfMonth, startMonth } = req.body;
  const normalizedDescription = description?.trim();
  const normalizedCategory = category?.trim();
  const parsedDay = Number(dayOfMonth);
  const money = normalizeMoneyInput(originalAmount ?? amount, currencyCode);

  if (!normalizedDescription || !normalizedCategory || !startMonth) {
    return res.status(400).json({ error: 'Description, category, day, and start month are required' });
  }
  if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
    return res.status(400).json({ error: 'Day of month must be between 1 and 31' });
  }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) {
    return res.status(400).json({ error: 'Start month must be in YYYY-MM format' });
  }

  const info = db.prepare(`
    INSERT INTO recurring_expense_rules (user_id, description, amount, original_amount, currency_code, category, day_of_month, start_month)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, normalizedDescription, money.amountUsd, money.originalAmount, money.currencyCode, normalizedCategory, parsedDay, startMonth);

  ensureRecurringExpensesForMonth(req.user.id, startMonth);

  res.status(201).json(
    db.prepare('SELECT * FROM recurring_expense_rules WHERE id = ?').get(info.lastInsertRowid)
  );
});

app.put('/api/recurring-expenses/:id', authMiddleware, (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM recurring_expense_rules WHERE id = ? AND user_id = ?'
  ).get(Number(req.params.id), req.user.id);

  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  const description = req.body.description?.trim() ?? existing.description;
  const category = req.body.category?.trim() ?? existing.category;
  const dayOfMonth = req.body.dayOfMonth === undefined ? existing.day_of_month : Number(req.body.dayOfMonth);
  const startMonth = req.body.startMonth ?? existing.start_month;
  const active = req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0);
  const money = req.body.amount === undefined && req.body.originalAmount === undefined && req.body.currencyCode === undefined
    ? {
        amountUsd: existing.amount,
        originalAmount: existing.original_amount ?? existing.amount,
        currencyCode: normalizeCurrencyCode(existing.currency_code),
      }
    : normalizeMoneyInput(req.body.originalAmount ?? req.body.amount ?? existing.original_amount ?? existing.amount, req.body.currencyCode ?? existing.currency_code);

  if (!description || !category || !startMonth) {
    return res.status(400).json({ error: 'Description, category, and start month are required' });
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return res.status(400).json({ error: 'Day of month must be between 1 and 31' });
  }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) {
    return res.status(400).json({ error: 'Start month must be in YYYY-MM format' });
  }

  db.prepare(`
    UPDATE recurring_expense_rules
    SET description = ?, amount = ?, original_amount = ?, currency_code = ?, category = ?, day_of_month = ?, start_month = ?, active = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(description, money.amountUsd, money.originalAmount, money.currencyCode, category, dayOfMonth, startMonth, active, existing.id, req.user.id);

  if (active) {
    ensureRecurringExpensesForMonth(req.user.id, startMonth);
  }

  res.json(
    db.prepare('SELECT * FROM recurring_expense_rules WHERE id = ?').get(existing.id)
  );
});

app.delete('/api/recurring-expenses/:id', authMiddleware, (req, res) => {
  const existing = db.prepare(
    'SELECT id FROM recurring_expense_rules WHERE id = ? AND user_id = ?'
  ).get(Number(req.params.id), req.user.id);

  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM recurring_expense_skips WHERE user_id = ? AND recurring_rule_id = ?').run(req.user.id, existing.id);
    db.prepare('UPDATE expenses SET recurring_rule_id = NULL WHERE user_id = ? AND recurring_rule_id = ?').run(req.user.id, existing.id);
    db.prepare('DELETE FROM recurring_expense_rules WHERE id = ? AND user_id = ?').run(existing.id, req.user.id);
  })();

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// REMITTANCES (India transfers)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/remittances', authMiddleware, (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  let rows;
  if (month) {
    rows = db.prepare('SELECT * FROM remittances WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  } else if (year) {
    rows = db.prepare('SELECT * FROM remittances WHERE user_id = ? AND year = ? ORDER BY date DESC').all(userId, Number(year));
  } else {
    rows = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY date DESC').all(userId);
  }
  res.json(rows);
});

app.post('/api/remittances', authMiddleware, (req, res) => {
  const { amount, originalAmount, currencyCode, note, date } = req.body;
  if (!(amount ?? originalAmount) || !date) return res.status(400).json({ error: 'Missing required fields' });
  const money = normalizeMoneyInput(originalAmount ?? amount, currencyCode);
  const stmt = db.prepare(
    'INSERT INTO remittances (amount, original_amount, currency_code, note, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(money.amountUsd, money.originalAmount, money.currencyCode, note ?? '', date, toMonthKey(date), toYear(date), req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM remittances WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/remittances/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM remittances WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { amount, originalAmount, currencyCode, note, date } = req.body;
  const newDate = date   ?? existing.date;
  const newNote = note   ?? existing.note;
  const newMoney = req.body.amount !== undefined || req.body.originalAmount !== undefined || req.body.currencyCode !== undefined
    ? normalizeMoneyInput(originalAmount ?? amount ?? existing.original_amount ?? existing.amount, currencyCode ?? existing.currency_code)
    : {
        amountUsd: existing.amount,
        originalAmount: existing.original_amount ?? existing.amount,
        currencyCode: normalizeCurrencyCode(existing.currency_code),
      };
  db.prepare('UPDATE remittances SET amount=?, original_amount=?, currency_code=?, note=?, date=?, month=?, year=? WHERE id=?')
    .run(newMoney.amountUsd, newMoney.originalAmount, newMoney.currencyCode, newNote, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id));
  res.json(db.prepare('SELECT * FROM remittances WHERE id = ?').get(Number(req.params.id)));
});

app.delete('/api/remittances/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM remittances WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM remittances WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTMENTS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/investments', authMiddleware, (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  let rows;
  if (month) {
    rows = db.prepare('SELECT * FROM investments WHERE user_id = ? AND month = ? ORDER BY date DESC').all(userId, month);
  } else if (year) {
    rows = db.prepare('SELECT * FROM investments WHERE user_id = ? AND year = ? ORDER BY date DESC').all(userId, Number(year));
  } else {
    rows = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY date DESC').all(userId);
  }
  res.json(rows);
});

app.post('/api/investments', authMiddleware, (req, res) => {
  const { note, date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const stmt = db.prepare(
    'INSERT INTO investments (amount, original_amount, currency_code, note, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(2500, 2500, 'USD', note ?? '', date, toMonthKey(date), toYear(date), req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM investments WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/investments/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM investments WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM investments WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTH CONFIG (budget per month)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/month-config/:month', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM month_configs WHERE month = ? AND user_id = ?').get(req.params.month, req.user.id);
  res.json(row ?? null);
});

app.post('/api/month-config', authMiddleware, (req, res) => {
  const { month, miscBudget } = req.body;
  if (!month || miscBudget === undefined) return res.status(400).json({ error: 'Missing fields' });
  db.prepare(`
    INSERT INTO month_configs (month, misc_budget, invest_amount, user_id, updated_at)
    VALUES (?, ?, 2500, ?, datetime('now'))
    ON CONFLICT(month, user_id) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at
  `).run(month, miscBudget, req.user.id);
  res.json(db.prepare('SELECT * FROM month_configs WHERE month = ? AND user_id = ?').get(month, req.user.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY (aggregate for a month — one API call)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/summary/:month', authMiddleware, (req, res) => {
  const { month } = req.params;
  const userId = req.user.id;
  res.json(getMonthSummaryData(userId, month));
});

// ─────────────────────────────────────────────────────────────────────────────
// MONEY COACH ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/analysis/month/:month', authMiddleware, async (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
  }

  try {
    const userId = req.user.id;
    const previousMonth = shiftMonth(month, -1);
    const trailingMonths = [shiftMonth(month, -1), shiftMonth(month, -2), shiftMonth(month, -3)];
    const sixMonthWindow = [shiftMonth(month, -5), shiftMonth(month, -4), shiftMonth(month, -3), shiftMonth(month, -2), shiftMonth(month, -1), month];

    const currentSummary = getMonthSummaryData(userId, month);
    const previousSummary = getMonthSummaryData(userId, previousMonth);
    const trailingSummaries = trailingMonths.map((entry) => getMonthSummaryData(userId, entry));
    const sixMonthSummaries = sixMonthWindow.map((entry) => getMonthSummaryData(userId, entry));
    const expectedRecurringForMonth = getExpectedRecurringForMonth(userId, month);

    const analysis = buildMonthlyAnalysis({
      month,
      currentSummary,
      previousSummary,
      trailingSummaries,
      sixMonthSummaries,
      expectedRecurringForMonth,
      now: new Date(),
    });

    if (!canGenerateCoachNarrative()) {
      return res.json({
        ...analysis,
        monthlyMemo: {
          ...analysis.monthlyMemo,
          llmNarrative: null,
          llmModel: null,
        },
      });
    }

    try {
      const narrative = await generateCoachNarrative({
        month: analysis.monthLabel,
        totals: analysis.totals,
        whyDifferent: {
          summary: analysis.whyDifferent.summary,
          biggestDrivers: analysis.whyDifferent.biggestDrivers.slice(0, 3),
          unusualPurchases: analysis.whyDifferent.unusualPurchases.slice(0, 2),
          recurringCostIncreases: analysis.whyDifferent.recurringCostIncreases.slice(0, 2),
        },
        lifestyleDrift: {
          summary: analysis.lifestyleDrift.summary,
          categories: analysis.lifestyleDrift.categories.slice(0, 3),
        },
        monthlyMemo: analysis.monthlyMemo,
      });

      return res.json({
        ...analysis,
        monthlyMemo: {
          ...analysis.monthlyMemo,
          llmNarrative: narrative.text,
          llmModel: narrative.model,
        },
      });
    } catch (llmErr) {
      console.error('Money coach narrative error:', llmErr);
      return res.json({
        ...analysis,
        monthlyMemo: {
          ...analysis.monthlyMemo,
          llmNarrative: null,
          llmModel: null,
        },
      });
    }
  } catch (err) {
    console.error('Monthly analysis error:', err);
    return res.status(500).json({ error: 'Could not build monthly analysis' });
  }
});

app.post('/api/analysis/affordability', authMiddleware, (req, res) => {
  const { month, amount, label } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  try {
    const userId = req.user.id;
    const currentSummary = getMonthSummaryData(userId, month);
    const trailingMonths = [shiftMonth(month, -1), shiftMonth(month, -2), shiftMonth(month, -3)];
    const trailingSummaries = trailingMonths.map((entry) => getMonthSummaryData(userId, entry));
    const expectedRecurringForMonth = getExpectedRecurringForMonth(userId, month);

    const result = buildAffordabilityCheck({
      month,
      amount: parsedAmount,
      label,
      currentSummary,
      trailingSummaries,
      expectedRecurringForMonth,
      now: new Date(),
    });

    res.json(result);
  } catch (err) {
    console.error('Affordability analysis error:', err);
    res.status(500).json({ error: 'Could not evaluate affordability' });
  }
});

app.get('/api/analysis/story-timeline', authMiddleware, (req, res) => {
  try {
    res.json(buildMoneyStoryTimeline(req.user.id));
  } catch (err) {
    console.error('Money story timeline error:', err);
    res.status(500).json({ error: 'Could not build story timeline' });
  }
});

app.get('/api/analysis/subscription-drift', authMiddleware, (req, res) => {
  try {
    res.json(buildSubscriptionDriftRows(req.user.id));
  } catch (err) {
    console.error('Subscription drift error:', err);
    res.status(500).json({ error: 'Could not build subscription drift analysis' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFETIME TOTALS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/lifetime', authMiddleware, (req, res) => {
  const userId = req.user.id;
  ensureRecurringExpensesThroughCurrentMonth(userId);
  const totalSentToIndia = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM remittances WHERE user_id = ?').get(userId).total;
  const totalInvested    = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM investments WHERE user_id = ?').get(userId).total;
  const totalExpenses    = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id = ?').get(userId).total;
  const remittances      = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY date DESC').all(userId);
  const investments      = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY date DESC').all(userId);
  res.json({ totalSentToIndia, totalInvested, totalExpenses, remittances, investments });
});

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY DATA
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/yearly/:year', authMiddleware, (req, res) => {
  const year = Number(req.params.year);
  const userId = req.user.id;
  ensureRecurringExpensesForYear(userId, year);
  const expenses    = db.prepare('SELECT * FROM expenses WHERE user_id = ? AND year = ? ORDER BY date').all(userId, year);
  const remittances = db.prepare('SELECT * FROM remittances WHERE user_id = ? AND year = ? ORDER BY date').all(userId, year);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? AND year = ? ORDER BY date').all(userId, year);
  res.json({ expenses, remittances, investments });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB STATS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/stats', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const expenses    = db.prepare('SELECT COUNT(*) as c FROM expenses WHERE user_id = ?').get(userId).c;
  const remittances = db.prepare('SELECT COUNT(*) as c FROM remittances WHERE user_id = ?').get(userId).c;
  const investments = db.prepare('SELECT COUNT(*) as c FROM investments WHERE user_id = ?').get(userId).c;
  const configs     = db.prepare('SELECT COUNT(*) as c FROM month_configs WHERE user_id = ?').get(userId).c;
  const dbSizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  res.json({
    expenses, remittances, investments, configs,
    total: expenses + remittances + investments,
    dbSizeBytes,
    dbPath: IS_PRODUCTION ? null : DB_PATH,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKUP / EXPORT
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/backup/json', authMiddleware, (req, res) => {
  const userId = req.user.id;
  ensureRecurringExpensesThroughCurrentMonth(userId);
  const expenses    = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date').all(userId);
  const remittances = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY date').all(userId);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY date').all(userId);
  const configs     = db.prepare('SELECT * FROM month_configs WHERE user_id = ?').all(userId);
  const payload = { version: 2, exportedAt: new Date().toISOString(), userId, expenses, remittances, investments, configs };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="expenseiq-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(payload);
});

app.get('/api/backup/csv', authMiddleware, (req, res) => {
  const userId = req.user.id;
  ensureRecurringExpensesThroughCurrentMonth(userId);
  const expenses    = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date').all(userId);
  const remittances = db.prepare('SELECT * FROM remittances WHERE user_id = ? ORDER BY date').all(userId);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY date').all(userId);

  const escape = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = ['Type,Date,Amount,Category,Description,Note,Month,Year'];

  expenses.forEach(e =>
    rows.push(['Expense', e.date, e.amount, escape(e.category), escape(e.description), '', e.month, e.year].join(','))
  );
  remittances.forEach(r =>
    rows.push(['India Remittance', r.date, r.amount, '', '', escape(r.note), r.month, r.year].join(','))
  );
  investments.forEach(i =>
    rows.push(['Investment', i.date, i.amount, '', '', escape(i.note), i.month, i.year].join(','))
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="expenseiq-export-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(rows.join('\n'));
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT (restore from backup)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/backup/import', authMiddleware, (req, res) => {
  const payload = req.body;
  if (!payload.version || !Array.isArray(payload.expenses)) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  let added = 0; let skipped = 0;
  const userId = req.user.id;

  const importMany = db.transaction(() => {
    const existingExpDates = new Set(
      db.prepare('SELECT created_at FROM expenses WHERE user_id = ?').all(userId).map(r => r.created_at)
    );
    for (const e of payload.expenses ?? []) {
      if (e.created_at && existingExpDates.has(e.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).run(e.description, e.amount, e.original_amount ?? e.amount, e.currency_code ?? 'USD', e.category, e.date, e.month ?? toMonthKey(e.date), e.year ?? toYear(e.date), e.created_at ?? new Date().toISOString(), userId);
      added++;
    }

    const existingRemDates = new Set(
      db.prepare('SELECT created_at FROM remittances WHERE user_id = ?').all(userId).map(r => r.created_at)
    );
    for (const r of payload.remittances ?? []) {
      if (r.created_at && existingRemDates.has(r.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO remittances (amount, original_amount, currency_code, note, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(r.amount, r.original_amount ?? r.amount, r.currency_code ?? 'USD', r.note ?? '', r.date, r.month ?? toMonthKey(r.date), r.year ?? toYear(r.date), r.created_at ?? new Date().toISOString(), userId);
      added++;
    }

    const existingInvDates = new Set(
      db.prepare('SELECT created_at FROM investments WHERE user_id = ?').all(userId).map(r => r.created_at)
    );
    for (const i of payload.investments ?? []) {
      if (i.created_at && existingInvDates.has(i.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO investments (amount, original_amount, currency_code, note, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(i.amount ?? 2500, i.original_amount ?? i.amount ?? 2500, i.currency_code ?? 'USD', i.note ?? '', i.date, i.month ?? toMonthKey(i.date), i.year ?? toYear(i.date), i.created_at ?? new Date().toISOString(), userId);
      added++;
    }

    for (const cfg of payload.configs ?? payload.monthConfigs ?? []) {
      db.prepare(`
        INSERT INTO month_configs (month, misc_budget, invest_amount, user_id, updated_at)
        VALUES (?, ?, 2500, ?, datetime('now'))
        ON CONFLICT(month, user_id) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at
      `).run(cfg.month, cfg.misc_budget ?? cfg.miscBudget ?? 0, userId);
    }
  });

  importMany();
  res.json({ ok: true, added, skipped });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR ALL DATA (Start Fresh)
// ─────────────────────────────────────────────────────────────────────────────

app.delete('/api/data/all', authMiddleware, (req, res) => {
  const userId = req.user.id;
  db.transaction(() => {
    db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM remittances WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM investments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM month_configs WHERE user_id = ?').run(userId);
  })();
  res.json({ ok: true, message: 'All data cleared. Starting fresh.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: IS_PRODUCTION ? 'configured' : DB_PATH, time: new Date().toISOString() });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR, {
    index: false,
    maxAge: IS_PRODUCTION ? '1h' : 0,
  }));

  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(DIST_INDEX);
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status || 500;
  res.status(status).json({
    error: status >= 500 && IS_PRODUCTION
      ? 'Internal server error'
      : err.message || 'Internal server error',
  });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 ExpenseIQ API server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`📦 Database: ${DB_PATH}`);
  if (fs.existsSync(DIST_INDEX)) {
    console.log(`🌐 Serving frontend from: ${DIST_DIR}`);
  }
});
