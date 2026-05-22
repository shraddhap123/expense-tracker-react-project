import express from 'express';
import { createClient } from '@libsql/client';
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
const DB_PATH = path.join(__dirname, '..', 'expenseiq.db');
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : null;

// ── Turso / libsql client ────────────────────────────────────────────────────
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${DB_PATH}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function toMonthKey(dateStr) { return dateStr.slice(0, 7); }
function toYear(dateStr)     { return parseInt(dateStr.slice(0, 4), 10); }
function compareMonthKeys(left, right) { return left.localeCompare(right); }
function currentMonthKey()   { return new Date().toISOString().slice(0, 7); }
function isFutureMonth(month) { return compareMonthKeys(month, currentMonthKey()) > 0; }
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

async function hasColumn(table, column) {
  const result = await client.execute({ sql: `PRAGMA table_info(${table})`, args: [] });
  return result.rows.some((c) => c.name === column);
}

// ── Schema init ───────────────────────────────────────────────────────────────
async function initializeDatabase() {
  await client.executeMultiple(`
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
    CREATE TABLE IF NOT EXISTS expenses (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      description     TEXT    NOT NULL,
      amount          REAL    NOT NULL,
      original_amount REAL    NOT NULL DEFAULT 0,
      currency_code   TEXT    NOT NULL DEFAULT 'USD',
      category        TEXT    NOT NULL,
      date            TEXT    NOT NULL,
      month           TEXT    NOT NULL,
      year            INTEGER NOT NULL,
      user_id         INTEGER NOT NULL DEFAULT 1,
      recurring_rule_id INTEGER,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS remittances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      amount          REAL    NOT NULL,
      original_amount REAL    NOT NULL DEFAULT 0,
      currency_code   TEXT    NOT NULL DEFAULT 'USD',
      note            TEXT    NOT NULL DEFAULT '',
      date            TEXT    NOT NULL,
      month           TEXT    NOT NULL,
      year            INTEGER NOT NULL,
      user_id         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS investments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      amount          REAL    NOT NULL DEFAULT 2500,
      original_amount REAL    NOT NULL DEFAULT 2500,
      currency_code   TEXT    NOT NULL DEFAULT 'USD',
      note            TEXT    NOT NULL DEFAULT '',
      date            TEXT    NOT NULL,
      month           TEXT    NOT NULL,
      year            INTEGER NOT NULL,
      user_id         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS month_configs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      month         TEXT    NOT NULL,
      misc_budget   REAL    NOT NULL DEFAULT 0,
      invest_amount REAL    NOT NULL DEFAULT 2500,
      user_id       INTEGER NOT NULL DEFAULT 1,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month, user_id)
    );
    CREATE TABLE IF NOT EXISTS recurring_expense_rules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      description     TEXT    NOT NULL,
      amount          REAL    NOT NULL,
      original_amount REAL    NOT NULL DEFAULT 0,
      currency_code   TEXT    NOT NULL DEFAULT 'USD',
      category        TEXT    NOT NULL,
      day_of_month    INTEGER NOT NULL,
      start_month     TEXT    NOT NULL,
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recurring_expense_skips (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      recurring_rule_id INTEGER NOT NULL,
      month             TEXT    NOT NULL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, recurring_rule_id, month)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER,
      action        TEXT    NOT NULL,
      resource_type TEXT    NOT NULL,
      resource_id   INTEGER,
      details       TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_month           ON expenses(month);
    CREATE INDEX IF NOT EXISTS idx_expenses_year            ON expenses(year);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_month      ON expenses(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_expenses_recurring_rule  ON expenses(recurring_rule_id);
    CREATE INDEX IF NOT EXISTS idx_remit_month              ON remittances(month);
    CREATE INDEX IF NOT EXISTS idx_remit_year               ON remittances(year);
    CREATE INDEX IF NOT EXISTS idx_remittances_user_month   ON remittances(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_invest_month             ON investments(month);
    CREATE INDEX IF NOT EXISTS idx_invest_year              ON investments(year);
    CREATE INDEX IF NOT EXISTS idx_investments_user_month   ON investments(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_month_configs_user_month ON month_configs(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_sessions_token           ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user            ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_user      ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_rules_user     ON recurring_expense_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_skips_user     ON recurring_expense_skips(user_id, recurring_rule_id, month);
  `);

  // Bootstrap default user if none exist
  const userCount = ((await client.execute({ sql: 'SELECT COUNT(*) as count FROM users', args: [] })).rows[0]?.count) ?? 0;
  if (Number(userCount) === 0) {
    const bootstrapEmail = process.env.BOOTSTRAP_USER_EMAIL?.trim().toLowerCase()
      || process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.BOOTSTRAP_USER_PASSWORD || process.env.BOOTSTRAP_OWNER_PASSWORD;
    const bootstrapName = process.env.BOOTSTRAP_USER_NAME?.trim() || process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'Owner';

    if (bootstrapEmail && bootstrapPassword) {
      const passwordHash = bcrypt.hashSync(bootstrapPassword, 10);
      await client.execute({
        sql: 'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
        args: [bootstrapEmail, passwordHash, bootstrapName, 'owner'],
      });
      console.log(`🔐 Bootstrapped account for ${bootstrapEmail}`);
    } else if (!IS_PRODUCTION) {
      const defaultPassword = bcrypt.hashSync('changeme123', 10);
      await client.execute({
        sql: "INSERT INTO users (email, password_hash, display_name, role) VALUES ('owner@expenseiq.local', ?, 'Owner', 'owner')",
        args: [defaultPassword],
      });
      console.log('🔐 Created default local account: owner@expenseiq.local / changeme123');
    } else {
      console.warn('⚠️  No account found. Create the first account through /api/auth/register.');
    }
  }

  console.log('✅ Database ready');
}

// ── Recurring expense helpers ─────────────────────────────────────────────────

async function ensureRecurringExpensesForRange(userId, startMonth, endMonth) {
  if (!startMonth || !endMonth || compareMonthKeys(startMonth, endMonth) > 0) return;

  const cappedEndMonth = compareMonthKeys(endMonth, currentMonthKey()) > 0 ? currentMonthKey() : endMonth;
  if (compareMonthKeys(startMonth, cappedEndMonth) > 0) return;

  const rules = (await client.execute({
    sql: `SELECT id, description, amount, original_amount, currency_code, category, day_of_month, start_month
          FROM recurring_expense_rules
          WHERE user_id = ? AND active = 1 AND start_month <= ?
          ORDER BY start_month, id`,
    args: [userId, cappedEndMonth],
  })).rows;

  if (rules.length === 0) return;

  const months = listMonthsInRange(startMonth, cappedEndMonth);
  const inserts = [];

  for (const month of months) {
    for (const rule of rules) {
      if (compareMonthKeys(rule.start_month, month) > 0) continue;

      const hasSkip = (await client.execute({
        sql: 'SELECT 1 FROM recurring_expense_skips WHERE user_id = ? AND recurring_rule_id = ? AND month = ?',
        args: [userId, rule.id, month],
      })).rows[0] ?? null;
      if (hasSkip) continue;

      const hasExpense = (await client.execute({
        sql: 'SELECT 1 FROM expenses WHERE user_id = ? AND recurring_rule_id = ? AND month = ?',
        args: [userId, rule.id, month],
      })).rows[0] ?? null;
      if (hasExpense) continue;

      const date = dateForMonthDay(month, rule.day_of_month);
      inserts.push({
        sql: `INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, user_id, recurring_rule_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          rule.description, rule.amount, rule.original_amount || rule.amount,
          normalizeCurrencyCode(rule.currency_code), rule.category,
          date, month, toYear(date), userId, rule.id,
        ],
      });
    }
  }

  if (inserts.length > 0) {
    await client.batch(inserts, 'write');
  }
}

async function ensureRecurringExpensesForMonth(userId, month) {
  return ensureRecurringExpensesForRange(userId, month, month);
}

async function ensureRecurringExpensesThroughCurrentMonth(userId) {
  const earliestRule = (await client.execute({
    sql: 'SELECT start_month FROM recurring_expense_rules WHERE user_id = ? AND active = 1 ORDER BY start_month LIMIT 1',
    args: [userId],
  })).rows[0] ?? null;
  if (!earliestRule?.start_month) return;
  await ensureRecurringExpensesForRange(userId, earliestRule.start_month, currentMonthKey());
}

async function ensureRecurringExpensesForYear(userId, year) {
  const current = currentMonthKey();
  const currentYear = Number(current.slice(0, 4));
  if (year > currentYear) return;
  const endMonth = year < currentYear ? `${year}-12` : current;
  await ensureRecurringExpensesForRange(userId, `${year}-01`, endMonth);
}

async function getMonthSummaryData(userId, month) {
  await ensureRecurringExpensesForMonth(userId, month);
  const [expenses, remittances, investments, configResult] = await Promise.all([
    client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] }),
    client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] }),
    client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] }),
    client.execute({ sql: 'SELECT * FROM month_configs WHERE month = ? AND user_id = ?', args: [month, userId] }),
  ]);
  return {
    month,
    expenses: expenses.rows,
    remittances: remittances.rows,
    investments: investments.rows,
    config: configResult.rows[0] ?? null,
  };
}

async function getExpectedRecurringForMonth(userId, month) {
  const result = await client.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS total FROM recurring_expense_rules WHERE user_id = ? AND active = 1 AND start_month <= ?`,
    args: [userId, month],
  });
  return Number(result.rows[0]?.total ?? 0);
}

async function buildSubscriptionDriftRows(userId) {
  await ensureRecurringExpensesThroughCurrentMonth(userId);
  const expenses = (await client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY month, date', args: [userId] })).rows;
  const groups = new Map();

  for (const expense of expenses) {
    const normalized = String(expense.description ?? '').toLowerCase().replace(/\d+/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const existing = groups.get(normalized) ?? [];
    existing.push(expense);
    groups.set(normalized, existing);
  }

  return [...groups.values()]
    .map((rows) => {
      const months = [...new Set(rows.map((row) => row.month))];
      if (months.length < 3) return null;
      const sortedRows = [...rows].sort((a, b) => a.month.localeCompare(b.month));
      const previousRows = sortedRows.slice(0, -1);
      const latestMonth = sortedRows[sortedRows.length - 1].month;
      const latestRows = sortedRows.filter((row) => row.month === latestMonth);
      const currentAmount = latestRows.reduce((sum, row) => sum + row.amount, 0) / latestRows.length;
      const previousAverage = previousRows.reduce((sum, row) => sum + row.amount, 0) / previousRows.length;
      const increaseAmount = currentAmount - previousAverage;
      if (previousAverage <= 0 || increaseAmount < 5 || currentAmount < previousAverage * 1.08) return null;
      return {
        description: sortedRows[sortedRows.length - 1].description,
        currentAmount, previousAverage, increaseAmount,
        increasePercent: (increaseAmount / previousAverage) * 100,
        monthsSeen: months.length,
        frequencyLabel: rows.some((row) => row.recurring_rule_id) ? 'Saved recurring rule' : 'Detected from repeated charges',
        summary: `${sortedRows[sortedRows.length - 1].description} is now averaging $${currentAmount.toFixed(0)} after sitting closer to $${previousAverage.toFixed(0)} before.`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.increaseAmount - a.increaseAmount)
    .slice(0, 8);
}

async function buildMoneyStoryTimeline(userId) {
  await ensureRecurringExpensesThroughCurrentMonth(userId);
  const [expensesResult, remittancesResult, investmentsResult, configsResult] = await Promise.all([
    client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY month, date', args: [userId] }),
    client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? ORDER BY month, date', args: [userId] }),
    client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY month, date', args: [userId] }),
    client.execute({ sql: 'SELECT * FROM month_configs WHERE user_id = ? ORDER BY month', args: [userId] }),
  ]);

  const expenses = expensesResult.rows;
  const remittances = remittancesResult.rows;
  const investments = investmentsResult.rows;
  const configs = configsResult.rows;

  const monthly = new Map();
  const ensureMonth = (month) => {
    if (!monthly.has(month)) monthly.set(month, { expenses: 0, india: 0, invest: 0, categories: {}, config: null });
    return monthly.get(month);
  };

  expenses.forEach((row) => { const b = ensureMonth(row.month); b.expenses += row.amount; b.categories[row.category] = (b.categories[row.category] ?? 0) + row.amount; });
  remittances.forEach((row) => { ensureMonth(row.month).india += row.amount; });
  investments.forEach((row) => { ensureMonth(row.month).invest += row.amount; });
  configs.forEach((row) => { ensureMonth(row.month).config = row; });

  const months = [...monthly.entries()].map(([month, data]) => ({
    month,
    monthLabel: new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    total: data.expenses + data.invest,
    expenses: data.expenses, india: data.india, invest: data.invest,
    categories: data.categories, config: data.config,
  })).sort((a, b) => a.month.localeCompare(b.month));

  const events = [];
  if (months.length > 0) {
    events.push({ type: 'tracking-started', month: months[0].month, monthLabel: months[0].monthLabel, title: 'Your money story started', body: 'This is the first month with tracked activity in ExpenseIQ.', tone: 'blue', icon: 'start' });
  }
  const highestSpend = [...months].sort((a, b) => b.total - a.total)[0];
  if (highestSpend?.total > 0) {
    events.push({ type: 'highest-spend', month: highestSpend.month, monthLabel: highestSpend.monthLabel, title: 'Biggest spending month', body: `${highestSpend.monthLabel} was your heaviest month so far.`, amount: highestSpend.total, tone: 'purple', icon: 'spike' });
  }
  const bestBudgetMonth = months.filter((e) => e.config).map((e) => ({ ...e, remaining: (e.config.misc_budget + e.config.invest_amount) - e.total })).filter((e) => e.remaining > 0).sort((a, b) => b.remaining - a.remaining)[0];
  if (bestBudgetMonth) {
    events.push({ type: 'best-budget', month: bestBudgetMonth.month, monthLabel: bestBudgetMonth.monthLabel, title: 'Best cushion month', body: `You finished ${bestBudgetMonth.monthLabel} with the most room left in your plan.`, amount: bestBudgetMonth.remaining, tone: 'emerald', icon: 'savings' });
  }
  const topCategorySpike = months.flatMap((e) => Object.entries(e.categories).map(([cat, amt]) => ({ month: e.month, monthLabel: e.monthLabel, category: cat, amount: amt }))).sort((a, b) => b.amount - a.amount)[0];
  if (topCategorySpike) {
    events.push({ type: 'category-spike', month: topCategorySpike.month, monthLabel: topCategorySpike.monthLabel, title: `Biggest ${topCategorySpike.category} month`, body: `${topCategorySpike.category} peaked here more than any other month.`, amount: topCategorySpike.amount, tone: 'amber', icon: 'spike' });
  }
  const firstRecurring = expenses.find((row) => row.recurring_rule_id);
  if (firstRecurring) {
    events.push({ type: 'recurring-detected', month: firstRecurring.month, monthLabel: new Date(`${firstRecurring.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }), title: 'Recurring rhythm showed up', body: `${firstRecurring.description} became part of the repeating pattern.`, amount: firstRecurring.amount, tone: 'blue', icon: 'recurring' });
  }
  if (remittances.length > 0) {
    const r = remittances[0];
    events.push({ type: 'first-transfer', month: r.month, monthLabel: new Date(`${r.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }), title: 'First India transfer logged', body: 'You started tracking remittances here.', amount: r.amount, tone: 'rose', icon: 'transfer' });
  }
  if (investments.length > 0) {
    const i = investments[0];
    events.push({ type: 'first-investment', month: i.month, monthLabel: new Date(`${i.month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }), title: 'Investment habit began', body: 'This is the first month with a tracked investment entry.', amount: i.amount, tone: 'emerald', icon: 'milestone' });
  }

  return events.filter((e) => e.month).sort((a, b) => b.month.localeCompare(a.month));
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

app.use((req, _res, next) => { req.db = client; next(); });

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
    if (!allowedOrigins || !origin || allowedOrigins.includes(origin)) { callback(null, true); return; }
    callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);

// ── EXPENSES ──────────────────────────────────────────────────────────────────

app.get('/api/expenses', authMiddleware, async (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  try {
    let rows;
    if (month) {
      await ensureRecurringExpensesForMonth(userId, month);
      rows = (await client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] })).rows;
    } else if (year) {
      await ensureRecurringExpensesForYear(userId, Number(year));
      rows = (await client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? AND year = ? ORDER BY date DESC', args: [userId, Number(year)] })).rows;
    } else {
      await ensureRecurringExpensesThroughCurrentMonth(userId);
      rows = (await client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC', args: [userId] })).rows;
    }
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch expenses' }); }
});

app.post('/api/expenses', authMiddleware, async (req, res) => {
  const { description, amount, originalAmount, currencyCode, category, date } = req.body;
  if (!description || !(amount ?? originalAmount) || !category || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const money = normalizeMoneyInput(originalAmount ?? amount, currencyCode);
    const result = await client.execute({
      sql: 'INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [description, money.amountUsd, money.originalAmount, money.currencyCode, category, date, toMonthKey(date), toYear(date), req.user.id],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create expense' }); }
});

app.put('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { description, amount, originalAmount, currencyCode, category, date } = req.body;
    const newDate = date ?? existing.date;
    const newDesc = description ?? existing.description;
    const newCat  = category ?? existing.category;
    const newMoney = req.body.amount !== undefined || req.body.originalAmount !== undefined || req.body.currencyCode !== undefined
      ? normalizeMoneyInput(originalAmount ?? amount ?? existing.original_amount ?? existing.amount, currencyCode ?? existing.currency_code)
      : { amountUsd: existing.amount, originalAmount: existing.original_amount ?? existing.amount, currencyCode: normalizeCurrencyCode(existing.currency_code) };

    await client.execute({
      sql: 'UPDATE expenses SET description=?, amount=?, original_amount=?, currency_code=?, category=?, date=?, month=?, year=? WHERE id=?',
      args: [newDesc, newMoney.amountUsd, newMoney.originalAmount, newMoney.currencyCode, newCat, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id)],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM expenses WHERE id = ?', args: [Number(req.params.id)] })).rows[0];
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update expense' }); }
});

app.delete('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (existing.recurring_rule_id) {
      await client.batch([
        { sql: 'INSERT OR IGNORE INTO recurring_expense_skips (user_id, recurring_rule_id, month) VALUES (?, ?, ?)', args: [req.user.id, existing.recurring_rule_id, existing.month] },
        { sql: 'DELETE FROM expenses WHERE id = ?', args: [Number(req.params.id)] },
      ], 'write');
    } else {
      await client.execute({ sql: 'DELETE FROM expenses WHERE id = ?', args: [Number(req.params.id)] });
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete expense' }); }
});

// ── RECURRING EXPENSES ────────────────────────────────────────────────────────

app.get('/api/recurring-expenses', authMiddleware, async (req, res) => {
  try {
    const rules = (await client.execute({ sql: 'SELECT * FROM recurring_expense_rules WHERE user_id = ? ORDER BY active DESC, created_at DESC', args: [req.user.id] })).rows;
    res.json(rules);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch recurring expenses' }); }
});

app.post('/api/recurring-expenses', authMiddleware, async (req, res) => {
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

  try {
    const result = await client.execute({
      sql: 'INSERT INTO recurring_expense_rules (user_id, description, amount, original_amount, currency_code, category, day_of_month, start_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [req.user.id, normalizedDescription, money.amountUsd, money.originalAmount, money.currencyCode, normalizedCategory, parsedDay, startMonth],
    });
    await ensureRecurringExpensesForMonth(req.user.id, startMonth);
    const row = (await client.execute({ sql: 'SELECT * FROM recurring_expense_rules WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create recurring expense' }); }
});

app.put('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM recurring_expense_rules WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const description = req.body.description?.trim() ?? existing.description;
    const category = req.body.category?.trim() ?? existing.category;
    const dayOfMonth = req.body.dayOfMonth === undefined ? existing.day_of_month : Number(req.body.dayOfMonth);
    const startMonth = req.body.startMonth ?? existing.start_month;
    const active = req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0);
    const money = (req.body.amount === undefined && req.body.originalAmount === undefined && req.body.currencyCode === undefined)
      ? { amountUsd: existing.amount, originalAmount: existing.original_amount ?? existing.amount, currencyCode: normalizeCurrencyCode(existing.currency_code) }
      : normalizeMoneyInput(req.body.originalAmount ?? req.body.amount ?? existing.original_amount ?? existing.amount, req.body.currencyCode ?? existing.currency_code);

    if (!description || !category || !startMonth) return res.status(400).json({ error: 'Description, category, and start month are required' });
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return res.status(400).json({ error: 'Day of month must be between 1 and 31' });
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return res.status(400).json({ error: 'Start month must be in YYYY-MM format' });

    await client.execute({
      sql: `UPDATE recurring_expense_rules SET description=?, amount=?, original_amount=?, currency_code=?, category=?, day_of_month=?, start_month=?, active=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
      args: [description, money.amountUsd, money.originalAmount, money.currencyCode, category, dayOfMonth, startMonth, active, existing.id, req.user.id],
    });
    if (active) await ensureRecurringExpensesForMonth(req.user.id, startMonth);
    const row = (await client.execute({ sql: 'SELECT * FROM recurring_expense_rules WHERE id = ?', args: [existing.id] })).rows[0];
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update recurring expense' }); }
});

app.delete('/api/recurring-expenses/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT id FROM recurring_expense_rules WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await client.batch([
      { sql: 'DELETE FROM recurring_expense_skips WHERE user_id = ? AND recurring_rule_id = ?', args: [req.user.id, existing.id] },
      { sql: 'UPDATE expenses SET recurring_rule_id = NULL WHERE user_id = ? AND recurring_rule_id = ?', args: [req.user.id, existing.id] },
      { sql: 'DELETE FROM recurring_expense_rules WHERE id = ? AND user_id = ?', args: [existing.id, req.user.id] },
    ], 'write');
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete recurring expense' }); }
});

// ── REMITTANCES ───────────────────────────────────────────────────────────────

app.get('/api/remittances', authMiddleware, async (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  try {
    let rows;
    if (month) {
      rows = (await client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] })).rows;
    } else if (year) {
      rows = (await client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? AND year = ? ORDER BY date DESC', args: [userId, Number(year)] })).rows;
    } else {
      rows = (await client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? ORDER BY date DESC', args: [userId] })).rows;
    }
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch remittances' }); }
});

app.post('/api/remittances', authMiddleware, async (req, res) => {
  const { amount, originalAmount, currencyCode, note, date } = req.body;
  if (!(amount ?? originalAmount) || !date) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const money = normalizeMoneyInput(originalAmount ?? amount, currencyCode);
    const result = await client.execute({
      sql: 'INSERT INTO remittances (amount, original_amount, currency_code, note, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [money.amountUsd, money.originalAmount, money.currencyCode, note ?? '', date, toMonthKey(date), toYear(date), req.user.id],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM remittances WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create remittance' }); }
});

app.put('/api/remittances/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM remittances WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { amount, originalAmount, currencyCode, note, date } = req.body;
    const newDate = date ?? existing.date;
    const newNote = note ?? existing.note;
    const newMoney = (req.body.amount !== undefined || req.body.originalAmount !== undefined || req.body.currencyCode !== undefined)
      ? normalizeMoneyInput(originalAmount ?? amount ?? existing.original_amount ?? existing.amount, currencyCode ?? existing.currency_code)
      : { amountUsd: existing.amount, originalAmount: existing.original_amount ?? existing.amount, currencyCode: normalizeCurrencyCode(existing.currency_code) };
    await client.execute({
      sql: 'UPDATE remittances SET amount=?, original_amount=?, currency_code=?, note=?, date=?, month=?, year=? WHERE id=?',
      args: [newMoney.amountUsd, newMoney.originalAmount, newMoney.currencyCode, newNote, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id)],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM remittances WHERE id = ?', args: [Number(req.params.id)] })).rows[0];
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update remittance' }); }
});

app.delete('/api/remittances/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM remittances WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await client.execute({ sql: 'DELETE FROM remittances WHERE id = ?', args: [Number(req.params.id)] });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete remittance' }); }
});

// ── INVESTMENTS ───────────────────────────────────────────────────────────────

app.get('/api/investments', authMiddleware, async (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.id;
  try {
    let rows;
    if (month) {
      rows = (await client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? AND month = ? ORDER BY date DESC', args: [userId, month] })).rows;
    } else if (year) {
      rows = (await client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? AND year = ? ORDER BY date DESC', args: [userId, Number(year)] })).rows;
    } else {
      rows = (await client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY date DESC', args: [userId] })).rows;
    }
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch investments' }); }
});

app.post('/api/investments', authMiddleware, async (req, res) => {
  const { note, date, amount } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const investAmount = Number(amount) || 2500;
  try {
    const result = await client.execute({
      sql: 'INSERT INTO investments (amount, original_amount, currency_code, note, date, month, year, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [investAmount, investAmount, 'USD', note ?? '', date, toMonthKey(date), toYear(date), req.user.id],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM investments WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create investment' }); }
});

app.delete('/api/investments/:id', authMiddleware, async (req, res) => {
  try {
    const existing = (await client.execute({ sql: 'SELECT * FROM investments WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.user.id] })).rows[0] ?? null;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await client.execute({ sql: 'DELETE FROM investments WHERE id = ?', args: [Number(req.params.id)] });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete investment' }); }
});

// ── MONTH CONFIG ──────────────────────────────────────────────────────────────

app.get('/api/month-config/:month', authMiddleware, async (req, res) => {
  try {
    const row = (await client.execute({ sql: 'SELECT * FROM month_configs WHERE month = ? AND user_id = ?', args: [req.params.month, req.user.id] })).rows[0] ?? null;
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch config' }); }
});

app.post('/api/month-config', authMiddleware, async (req, res) => {
  const { month, miscBudget } = req.body;
  if (!month || miscBudget === undefined) return res.status(400).json({ error: 'Missing fields' });
  try {
    await client.execute({
      sql: `INSERT INTO month_configs (month, misc_budget, invest_amount, user_id, updated_at) VALUES (?, ?, 2500, ?, datetime('now')) ON CONFLICT(month, user_id) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at`,
      args: [month, miscBudget, req.user.id],
    });
    const row = (await client.execute({ sql: 'SELECT * FROM month_configs WHERE month = ? AND user_id = ?', args: [month, req.user.id] })).rows[0];
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to save config' }); }
});

// ── SUMMARY ───────────────────────────────────────────────────────────────────

app.get('/api/summary/:month', authMiddleware, async (req, res) => {
  try {
    res.json(await getMonthSummaryData(req.user.id, req.params.month));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch summary' }); }
});

// ── ANALYSIS ──────────────────────────────────────────────────────────────────

app.get('/api/analysis/month/:month', authMiddleware, async (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month must be in YYYY-MM format' });

  try {
    const userId = req.user.id;
    const previousMonth = shiftMonth(month, -1);
    const trailingMonths = [shiftMonth(month, -1), shiftMonth(month, -2), shiftMonth(month, -3)];
    const sixMonthWindow = [shiftMonth(month, -5), shiftMonth(month, -4), shiftMonth(month, -3), shiftMonth(month, -2), shiftMonth(month, -1), month];

    const [currentSummary, previousSummary, expectedRecurringForMonth] = await Promise.all([
      getMonthSummaryData(userId, month),
      getMonthSummaryData(userId, previousMonth),
      getExpectedRecurringForMonth(userId, month),
    ]);
    const trailingSummaries = await Promise.all(trailingMonths.map((m) => getMonthSummaryData(userId, m)));
    const sixMonthSummaries = await Promise.all(sixMonthWindow.map((m) => getMonthSummaryData(userId, m)));

    const analysis = buildMonthlyAnalysis({ month, currentSummary, previousSummary, trailingSummaries, sixMonthSummaries, expectedRecurringForMonth, now: new Date() });

    if (!canGenerateCoachNarrative()) {
      return res.json({ ...analysis, monthlyMemo: { ...analysis.monthlyMemo, llmNarrative: null, llmModel: null } });
    }

    try {
      const narrative = await generateCoachNarrative({
        month: analysis.monthLabel, totals: analysis.totals,
        whyDifferent: { summary: analysis.whyDifferent.summary, biggestDrivers: analysis.whyDifferent.biggestDrivers.slice(0, 3), unusualPurchases: analysis.whyDifferent.unusualPurchases.slice(0, 2), recurringCostIncreases: analysis.whyDifferent.recurringCostIncreases.slice(0, 2) },
        lifestyleDrift: { summary: analysis.lifestyleDrift.summary, categories: analysis.lifestyleDrift.categories.slice(0, 3) },
        monthlyMemo: analysis.monthlyMemo,
      });
      return res.json({ ...analysis, monthlyMemo: { ...analysis.monthlyMemo, llmNarrative: narrative.text, llmModel: narrative.model } });
    } catch (llmErr) {
      console.error('Money coach narrative error:', llmErr);
      return res.json({ ...analysis, monthlyMemo: { ...analysis.monthlyMemo, llmNarrative: null, llmModel: null } });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not build monthly analysis' }); }
});

app.post('/api/analysis/affordability', authMiddleware, async (req, res) => {
  const { month, amount, label } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
  try {
    const userId = req.user.id;
    const [currentSummary, expectedRecurringForMonth] = await Promise.all([
      getMonthSummaryData(userId, month),
      getExpectedRecurringForMonth(userId, month),
    ]);
    const trailingMonths = [shiftMonth(month, -1), shiftMonth(month, -2), shiftMonth(month, -3)];
    const trailingSummaries = await Promise.all(trailingMonths.map((m) => getMonthSummaryData(userId, m)));
    res.json(buildAffordabilityCheck({ month, amount: parsedAmount, label, currentSummary, trailingSummaries, expectedRecurringForMonth, now: new Date() }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not evaluate affordability' }); }
});

app.get('/api/analysis/story-timeline', authMiddleware, async (req, res) => {
  try { res.json(await buildMoneyStoryTimeline(req.user.id)); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Could not build story timeline' }); }
});

app.get('/api/analysis/subscription-drift', authMiddleware, async (req, res) => {
  try { res.json(await buildSubscriptionDriftRows(req.user.id)); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Could not build subscription drift analysis' }); }
});

// ── LIFETIME / YEARLY ─────────────────────────────────────────────────────────

app.get('/api/lifetime', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    await ensureRecurringExpensesThroughCurrentMonth(userId);
    const [indiaResult, investResult, expResult, remittances, investments] = await Promise.all([
      client.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as total FROM remittances WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as total FROM investments WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? ORDER BY date DESC', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY date DESC', args: [userId] }),
    ]);
    res.json({
      totalSentToIndia: Number(indiaResult.rows[0]?.total ?? 0),
      totalInvested: Number(investResult.rows[0]?.total ?? 0),
      totalExpenses: Number(expResult.rows[0]?.total ?? 0),
      remittances: remittances.rows,
      investments: investments.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch lifetime totals' }); }
});

app.get('/api/yearly/:year', authMiddleware, async (req, res) => {
  const year = Number(req.params.year);
  const userId = req.user.id;
  try {
    await ensureRecurringExpensesForYear(userId, year);
    const [expenses, remittances, investments] = await Promise.all([
      client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? AND year = ? ORDER BY date', args: [userId, year] }),
      client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? AND year = ? ORDER BY date', args: [userId, year] }),
      client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? AND year = ? ORDER BY date', args: [userId, year] }),
    ]);
    res.json({ expenses: expenses.rows, remittances: remittances.rows, investments: investments.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch yearly data' }); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [exp, rem, inv, cfg] = await Promise.all([
      client.execute({ sql: 'SELECT COUNT(*) as c FROM expenses WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT COUNT(*) as c FROM remittances WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT COUNT(*) as c FROM investments WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT COUNT(*) as c FROM month_configs WHERE user_id = ?', args: [userId] }),
    ]);
    const expenses    = Number(exp.rows[0]?.c ?? 0);
    const remittances = Number(rem.rows[0]?.c ?? 0);
    const investments = Number(inv.rows[0]?.c ?? 0);
    const configs     = Number(cfg.rows[0]?.c ?? 0);
    const dbSizeBytes = (!IS_PRODUCTION && fs.existsSync(DB_PATH)) ? fs.statSync(DB_PATH).size : 0;
    res.json({ expenses, remittances, investments, configs, total: expenses + remittances + investments, dbSizeBytes, dbPath: IS_PRODUCTION ? null : DB_PATH });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch stats' }); }
});

// ── BACKUP ────────────────────────────────────────────────────────────────────

app.get('/api/backup/json', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    await ensureRecurringExpensesThroughCurrentMonth(userId);
    const [expenses, remittances, investments, configs] = await Promise.all([
      client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY date', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? ORDER BY date', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY date', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM month_configs WHERE user_id = ?', args: [userId] }),
    ]);
    const payload = { version: 2, exportedAt: new Date().toISOString(), userId, expenses: expenses.rows, remittances: remittances.rows, investments: investments.rows, configs: configs.rows };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="expenseiq-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(payload);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create backup' }); }
});

app.get('/api/backup/csv', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    await ensureRecurringExpensesThroughCurrentMonth(userId);
    const [expenses, remittances, investments] = await Promise.all([
      client.execute({ sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY date', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM remittances WHERE user_id = ? ORDER BY date', args: [userId] }),
      client.execute({ sql: 'SELECT * FROM investments WHERE user_id = ? ORDER BY date', args: [userId] }),
    ]);
    const escape = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = ['Type,Date,Amount,Category,Description,Note,Month,Year'];
    expenses.rows.forEach((e) => rows.push(['Expense', e.date, e.amount, escape(e.category), escape(e.description), '', e.month, e.year].join(',')));
    remittances.rows.forEach((r) => rows.push(['India Remittance', r.date, r.amount, '', '', escape(r.note), r.month, r.year].join(',')));
    investments.rows.forEach((i) => rows.push(['Investment', i.date, i.amount, '', '', escape(i.note), i.month, i.year].join(',')));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenseiq-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(rows.join('\n'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create CSV export' }); }
});

app.post('/api/backup/import', authMiddleware, async (req, res) => {
  const payload = req.body;
  if (!payload.version || !Array.isArray(payload.expenses)) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  let added = 0; let skipped = 0;
  const userId = req.user.id;

  try {
    const [existingExp, existingRem, existingInv] = await Promise.all([
      client.execute({ sql: 'SELECT created_at FROM expenses WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT created_at FROM remittances WHERE user_id = ?', args: [userId] }),
      client.execute({ sql: 'SELECT created_at FROM investments WHERE user_id = ?', args: [userId] }),
    ]);

    const existingExpDates = new Set(existingExp.rows.map((r) => r.created_at));
    const existingRemDates = new Set(existingRem.rows.map((r) => r.created_at));
    const existingInvDates = new Set(existingInv.rows.map((r) => r.created_at));

    const statements = [];

    for (const e of payload.expenses ?? []) {
      if (e.created_at && existingExpDates.has(e.created_at)) { skipped++; continue; }
      statements.push({ sql: 'INSERT INTO expenses (description, amount, original_amount, currency_code, category, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)', args: [e.description, e.amount, e.original_amount ?? e.amount, e.currency_code ?? 'USD', e.category, e.date, e.month ?? toMonthKey(e.date), e.year ?? toYear(e.date), e.created_at ?? new Date().toISOString(), userId] });
      added++;
    }
    for (const r of payload.remittances ?? []) {
      if (r.created_at && existingRemDates.has(r.created_at)) { skipped++; continue; }
      statements.push({ sql: 'INSERT INTO remittances (amount, original_amount, currency_code, note, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?)', args: [r.amount, r.original_amount ?? r.amount, r.currency_code ?? 'USD', r.note ?? '', r.date, r.month ?? toMonthKey(r.date), r.year ?? toYear(r.date), r.created_at ?? new Date().toISOString(), userId] });
      added++;
    }
    for (const i of payload.investments ?? []) {
      if (i.created_at && existingInvDates.has(i.created_at)) { skipped++; continue; }
      statements.push({ sql: 'INSERT INTO investments (amount, original_amount, currency_code, note, date, month, year, created_at, user_id) VALUES (?,?,?,?,?,?,?,?,?)', args: [i.amount ?? 2500, i.original_amount ?? i.amount ?? 2500, i.currency_code ?? 'USD', i.note ?? '', i.date, i.month ?? toMonthKey(i.date), i.year ?? toYear(i.date), i.created_at ?? new Date().toISOString(), userId] });
      added++;
    }
    for (const cfg of payload.configs ?? payload.monthConfigs ?? []) {
      statements.push({ sql: `INSERT INTO month_configs (month, misc_budget, invest_amount, user_id, updated_at) VALUES (?, ?, 2500, ?, datetime('now')) ON CONFLICT(month, user_id) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at`, args: [cfg.month, cfg.misc_budget ?? cfg.miscBudget ?? 0, userId] });
    }

    if (statements.length > 0) await client.batch(statements, 'write');
    res.json({ ok: true, added, skipped });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Import failed' }); }
});

app.delete('/api/data/all', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    await client.batch([
      { sql: 'DELETE FROM expenses WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM remittances WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM investments WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM month_configs WHERE user_id = ?', args: [userId] },
    ], 'write');
    res.json({ ok: true, message: 'All data cleared. Starting fresh.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to clear data' }); }
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: IS_PRODUCTION ? 'turso' : DB_PATH, time: new Date().toISOString() });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: IS_PRODUCTION ? '1h' : 0 }));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(DIST_INDEX));
}

app.use((err, _req, res, next) => {
  console.error(err);
  if (res.headersSent) { next(err); return; }
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 && IS_PRODUCTION ? 'Internal server error' : err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

await initializeDatabase();

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 ExpenseIQ running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}

export default app;
