import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    category    TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    month       TEXT    NOT NULL,
    year        INTEGER NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS remittances (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     REAL NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    month      TEXT NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     REAL NOT NULL DEFAULT 2500,
    note       TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    month      TEXT NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS month_configs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    month        TEXT    NOT NULL UNIQUE,
    misc_budget  REAL    NOT NULL DEFAULT 0,
    invest_amount REAL   NOT NULL DEFAULT 2500,
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_month  ON expenses(month);
  CREATE INDEX IF NOT EXISTS idx_expenses_year   ON expenses(year);
  CREATE INDEX IF NOT EXISTS idx_remit_month     ON remittances(month);
  CREATE INDEX IF NOT EXISTS idx_remit_year      ON remittances(year);
  CREATE INDEX IF NOT EXISTS idx_invest_month    ON investments(month);
  CREATE INDEX IF NOT EXISTS idx_invest_year     ON investments(year);
`);

console.log(`✅ SQLite DB ready at: ${DB_PATH}`);

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Helper ────────────────────────────────────────────────────────────────────
function toMonthKey(dateStr) {
  return dateStr.slice(0, 7); // "2025-01-15" → "2025-01"
}
function toYear(dateStr) {
  return parseInt(dateStr.slice(0, 4), 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/expenses', (req, res) => {
  const { month, year } = req.query;
  let rows;
  if (month) {
    rows = db.prepare('SELECT * FROM expenses WHERE month = ? ORDER BY date DESC').all(month);
  } else if (year) {
    rows = db.prepare('SELECT * FROM expenses WHERE year = ? ORDER BY date DESC').all(Number(year));
  } else {
    rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
  }
  res.json(rows);
});

app.post('/api/expenses', (req, res) => {
  const { description, amount, category, date } = req.body;
  if (!description || !amount || !category || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const stmt = db.prepare(
    'INSERT INTO expenses (description, amount, category, date, month, year) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(description, amount, category, date, toMonthKey(date), toYear(date));
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/expenses/:id', (req, res) => {
  const { description, amount, category, date } = req.body;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newDate   = date        ?? existing.date;
  const newDesc   = description ?? existing.description;
  const newAmt    = amount      ?? existing.amount;
  const newCat    = category    ?? existing.category;

  db.prepare(
    'UPDATE expenses SET description=?, amount=?, category=?, date=?, month=?, year=? WHERE id=?'
  ).run(newDesc, newAmt, newCat, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id));

  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(req.params.id)));
});

app.delete('/api/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// REMITTANCES (India transfers)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/remittances', (req, res) => {
  const { month, year } = req.query;
  let rows;
  if (month) {
    rows = db.prepare('SELECT * FROM remittances WHERE month = ? ORDER BY date DESC').all(month);
  } else if (year) {
    rows = db.prepare('SELECT * FROM remittances WHERE year = ? ORDER BY date DESC').all(Number(year));
  } else {
    rows = db.prepare('SELECT * FROM remittances ORDER BY date DESC').all();
  }
  res.json(rows);
});

app.post('/api/remittances', (req, res) => {
  const { amount, note, date } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'Missing required fields' });
  const stmt = db.prepare(
    'INSERT INTO remittances (amount, note, date, month, year) VALUES (?, ?, ?, ?, ?)'
  );
  const info = stmt.run(amount, note ?? '', date, toMonthKey(date), toYear(date));
  res.status(201).json(db.prepare('SELECT * FROM remittances WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/remittances/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM remittances WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { amount, note, date } = req.body;
  const newDate = date   ?? existing.date;
  const newAmt  = amount ?? existing.amount;
  const newNote = note   ?? existing.note;
  db.prepare('UPDATE remittances SET amount=?, note=?, date=?, month=?, year=? WHERE id=?')
    .run(newAmt, newNote, newDate, toMonthKey(newDate), toYear(newDate), Number(req.params.id));
  res.json(db.prepare('SELECT * FROM remittances WHERE id = ?').get(Number(req.params.id)));
});

app.delete('/api/remittances/:id', (req, res) => {
  db.prepare('DELETE FROM remittances WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTMENTS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/investments', (req, res) => {
  const { month, year } = req.query;
  let rows;
  if (month) {
    rows = db.prepare('SELECT * FROM investments WHERE month = ? ORDER BY date DESC').all(month);
  } else if (year) {
    rows = db.prepare('SELECT * FROM investments WHERE year = ? ORDER BY date DESC').all(Number(year));
  } else {
    rows = db.prepare('SELECT * FROM investments ORDER BY date DESC').all();
  }
  res.json(rows);
});

app.post('/api/investments', (req, res) => {
  const { note, date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const stmt = db.prepare(
    'INSERT INTO investments (amount, note, date, month, year) VALUES (?, ?, ?, ?, ?)'
  );
  const info = stmt.run(2500, note ?? '', date, toMonthKey(date), toYear(date));
  res.status(201).json(db.prepare('SELECT * FROM investments WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/investments/:id', (req, res) => {
  db.prepare('DELETE FROM investments WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTH CONFIG (budget per month)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/month-config/:month', (req, res) => {
  const row = db.prepare('SELECT * FROM month_configs WHERE month = ?').get(req.params.month);
  res.json(row ?? null);
});

app.post('/api/month-config', (req, res) => {
  const { month, miscBudget } = req.body;
  if (!month || miscBudget === undefined) return res.status(400).json({ error: 'Missing fields' });
  db.prepare(`
    INSERT INTO month_configs (month, misc_budget, invest_amount, updated_at)
    VALUES (?, ?, 2500, datetime('now'))
    ON CONFLICT(month) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at
  `).run(month, miscBudget);
  res.json(db.prepare('SELECT * FROM month_configs WHERE month = ?').get(month));
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY (aggregate for a month — one API call)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/summary/:month', (req, res) => {
  const { month } = req.params;
  const expenses    = db.prepare('SELECT * FROM expenses    WHERE month = ? ORDER BY date DESC').all(month);
  const remittances = db.prepare('SELECT * FROM remittances WHERE month = ? ORDER BY date DESC').all(month);
  const investments = db.prepare('SELECT * FROM investments WHERE month = ? ORDER BY date DESC').all(month);
  const config      = db.prepare('SELECT * FROM month_configs WHERE month = ?').get(month) ?? null;
  res.json({ expenses, remittances, investments, config });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFETIME TOTALS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/lifetime', (req, res) => {
  const totalSentToIndia = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM remittances').get().total;
  const totalInvested    = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM investments').get().total;
  const totalExpenses    = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses').get().total;
  const remittances      = db.prepare('SELECT * FROM remittances ORDER BY date DESC').all();
  const investments      = db.prepare('SELECT * FROM investments ORDER BY date DESC').all();
  res.json({ totalSentToIndia, totalInvested, totalExpenses, remittances, investments });
});

// ─────────────────────────────────────────────────────────────────────────────
// YEARLY DATA
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/yearly/:year', (req, res) => {
  const year = Number(req.params.year);
  const expenses    = db.prepare('SELECT * FROM expenses    WHERE year = ? ORDER BY date').all(year);
  const remittances = db.prepare('SELECT * FROM remittances WHERE year = ? ORDER BY date').all(year);
  const investments = db.prepare('SELECT * FROM investments WHERE year = ? ORDER BY date').all(year);
  res.json({ expenses, remittances, investments });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB STATS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const expenses    = db.prepare('SELECT COUNT(*) as c FROM expenses').get().c;
  const remittances = db.prepare('SELECT COUNT(*) as c FROM remittances').get().c;
  const investments = db.prepare('SELECT COUNT(*) as c FROM investments').get().c;
  const configs     = db.prepare('SELECT COUNT(*) as c FROM month_configs').get().c;
  const dbSizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  res.json({
    expenses, remittances, investments, configs,
    total: expenses + remittances + investments,
    dbSizeBytes,
    dbPath: DB_PATH,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKUP / EXPORT
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/backup/json', (req, res) => {
  const expenses    = db.prepare('SELECT * FROM expenses    ORDER BY date').all();
  const remittances = db.prepare('SELECT * FROM remittances ORDER BY date').all();
  const investments = db.prepare('SELECT * FROM investments ORDER BY date').all();
  const configs     = db.prepare('SELECT * FROM month_configs').all();
  const payload = { version: 2, exportedAt: new Date().toISOString(), expenses, remittances, investments, configs };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="expenseiq-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(payload);
});

app.get('/api/backup/csv', (req, res) => {
  const expenses    = db.prepare('SELECT * FROM expenses    ORDER BY date').all();
  const remittances = db.prepare('SELECT * FROM remittances ORDER BY date').all();
  const investments = db.prepare('SELECT * FROM investments ORDER BY date').all();

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

app.post('/api/backup/import', (req, res) => {
  const payload = req.body;
  if (!payload.version || !Array.isArray(payload.expenses)) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  let added = 0; let skipped = 0;

  const importMany = db.transaction(() => {
    const existingExpDates = new Set(
      db.prepare('SELECT created_at FROM expenses').all().map(r => r.created_at)
    );
    for (const e of payload.expenses ?? []) {
      if (e.created_at && existingExpDates.has(e.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO expenses (description, amount, category, date, month, year, created_at) VALUES (?,?,?,?,?,?,?)'
      ).run(e.description, e.amount, e.category, e.date, e.month ?? toMonthKey(e.date), e.year ?? toYear(e.date), e.created_at ?? new Date().toISOString());
      added++;
    }

    const existingRemDates = new Set(
      db.prepare('SELECT created_at FROM remittances').all().map(r => r.created_at)
    );
    for (const r of payload.remittances ?? []) {
      if (r.created_at && existingRemDates.has(r.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO remittances (amount, note, date, month, year, created_at) VALUES (?,?,?,?,?,?)'
      ).run(r.amount, r.note ?? '', r.date, r.month ?? toMonthKey(r.date), r.year ?? toYear(r.date), r.created_at ?? new Date().toISOString());
      added++;
    }

    const existingInvDates = new Set(
      db.prepare('SELECT created_at FROM investments').all().map(r => r.created_at)
    );
    for (const i of payload.investments ?? []) {
      if (i.created_at && existingInvDates.has(i.created_at)) { skipped++; continue; }
      db.prepare(
        'INSERT INTO investments (amount, note, date, month, year, created_at) VALUES (?,?,?,?,?,?)'
      ).run(i.amount ?? 2500, i.note ?? '', i.date, i.month ?? toMonthKey(i.date), i.year ?? toYear(i.date), i.created_at ?? new Date().toISOString());
      added++;
    }

    for (const cfg of payload.configs ?? payload.monthConfigs ?? []) {
      db.prepare(`
        INSERT INTO month_configs (month, misc_budget, invest_amount, updated_at)
        VALUES (?, ?, 2500, datetime('now'))
        ON CONFLICT(month) DO UPDATE SET misc_budget=excluded.misc_budget, updated_at=excluded.updated_at
      `).run(cfg.month, cfg.misc_budget ?? cfg.miscBudget ?? 0);
    }
  });

  importMany();
  res.json({ ok: true, added, skipped });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR ALL DATA (Start Fresh)
// ─────────────────────────────────────────────────────────────────────────────

app.delete('/api/data/all', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM expenses').run();
    db.prepare('DELETE FROM remittances').run();
    db.prepare('DELETE FROM investments').run();
    db.prepare('DELETE FROM month_configs').run();
    // Reset auto-increment counters
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('expenses','remittances','investments','month_configs')").run();
  })();
  res.json({ ok: true, message: 'All data cleared. Starting fresh.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: DB_PATH, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 ExpenseIQ API server running on http://localhost:${PORT}`);
  console.log(`📦 Database: ${DB_PATH}`);
});
