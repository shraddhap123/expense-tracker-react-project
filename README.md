# ExpenseIQ — Expense Tracker with SQLite Backend

## How to Run

### Option 1 — One command (recommended)
```bash
bash start.sh
```
This starts both the backend API and the React frontend.

### Option 2 — Two separate terminals

**Terminal 1 — Backend (SQLite API)**
```bash
node server/index.js
```
Runs on http://localhost:3001

**Terminal 2 — Frontend (React)**
```bash
npm run dev
```
Runs on http://localhost:5173 → open this in your browser.

---

## Where is my data stored?

Your data is stored in a **real SQLite database** file:
```
expenseiq.db   ← in the project root folder
```

- ✅ Survives browser clears, incognito mode, device restarts
- ✅ Persists forever — it's a real file on your disk
- ✅ Every entry is instantly written to disk

## To start fresh / delete all data

Go to **Settings → Data & Storage → Delete All Data & Start Fresh**

Or manually delete `expenseiq.db` from the project folder.

## Backup

Use **Settings → Data & Storage → Download JSON Backup** to save a portable copy.
To restore on another machine, use **Restore from Backup** and upload the .json file.
