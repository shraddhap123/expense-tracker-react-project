import { lazy, Suspense, useEffect, useState } from 'react';
import {
  LayoutDashboard, List, TrendingUp, Send, Settings,
  Plus, ChevronLeft, ChevronRight, CalendarDays, Download,
  AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { toMonthKey, parseMonthLabel, formatCurrency, INVESTMENT_FIXED } from './db/database';
import {
  useMonthSummary, useLifetimeTotals, useWriteFlash, useAPIStatus,
  exportBackupJSON, getLastBackupMeta,
} from './hooks/useDB';
import StatCard           from './components/StatCard';
import { ToastContainer } from './components/Toast';
import UserMenu from './components/auth/UserMenu';

const MonthlyOverview = lazy(() => import('./components/MonthlyOverview'));
const TransactionsTable = lazy(() => import('./components/TransactionsTable'));
const YearlyTrends = lazy(() => import('./components/YearlyTrends'));
const IndiaTracker = lazy(() => import('./components/IndiaTracker'));
const BudgetSetup = lazy(() => import('./components/BudgetSetup'));
const DataManager = lazy(() => import('./components/DataManager'));
const RecurringExpensesManager = lazy(() => import('./components/RecurringExpensesManager'));
const AddExpenseModal = lazy(() => import('./components/AddExpenseModal'));
const ProfileSettings = lazy(() => import('./components/auth/ProfileSettings'));

type Tab = 'dashboard' | 'transactions' | 'trends' | 'india' | 'settings';

function getMonthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return toMonthKey(d);
}

// ── Small header indicator that flashes "Saving…" on every write ──────────────
function WriteFlash() {
  const flashing = useWriteFlash();
  if (!flashing) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-pulse font-medium px-2">
      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
      Saving…
    </span>
  );
}

// ── API connection dot ─────────────────────────────────────────────────────────
function APIStatusDot() {
  const { status } = useAPIStatus();
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${
        status === 'ok'    ? 'bg-emerald-400 animate-pulse' :
        status === 'error' ? 'bg-red-400' :
                             'bg-yellow-400 animate-pulse'
      }`} />
      <span className={`hidden lg:block font-medium ${
        status === 'ok' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-yellow-400'
      }`}>
        {status === 'ok' ? 'SQLite' : status === 'error' ? 'DB offline' : 'Connecting'}
      </span>
    </div>
  );
}

function PanelFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1f2e] p-6">
      <div className="animate-pulse text-sm text-gray-400">{label}</div>
    </div>
  );
}

export default function App() {
  const now = new Date();
  const [activeTab,    setActiveTab]    = useState<Tab>('dashboard');
  const [currentMonth, setCurrentMonth] = useState(toMonthKey(now));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<'budget' | 'recurring' | 'data'>('budget');

  const [backupMeta, setBackupMeta] = useState(getLastBackupMeta());
  useEffect(() => { setBackupMeta(getLastBackupMeta()); }, []);
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  const backupAgeDays = backupMeta
    ? Math.floor((Date.now() - new Date(backupMeta.exportedAt).getTime()) / 86_400_000)
    : null;
  const backupWarning = backupMeta === null || (backupAgeDays !== null && backupAgeDays >= 7);
  const backupLabel   = backupMeta === null
    ? 'Never backed up'
    : backupAgeDays === 0 ? 'Backed up today' : `${backupAgeDays}d ago`;

  const handleBackup = async () => {
    await exportBackupJSON();
    setBackupMeta(getLastBackupMeta());
  };

  const summary  = useMonthSummary(currentMonth);
  const lifetime = useLifetimeTotals();

  const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions',  icon: List },
    { id: 'trends',       label: 'Yearly Trends', icon: TrendingUp },
    { id: 'india',        label: 'India Tracker', icon: Send },
    { id: 'settings',     label: 'Settings',      icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col">

      {/* ── Top Header ── */}
      <header className="border-b border-white/10 bg-[#0f1117]/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-sm font-bold">$</div>
            <span className="font-bold text-white text-lg hidden sm:block">ExpenseIQ</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-0.5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={15} />
                <span className="hidden md:block">{label}</span>
              </button>
            ))}
          </nav>

          {/* Right — status + backup + user menu + add */}
          <div className="flex items-center gap-2 shrink-0">
            <WriteFlash />
            <APIStatusDot />
            <UserMenu onOpenSettings={() => setShowProfileSettings(true)} />

            {/* Backup Button */}
            <div className="relative group">
              <button
                onClick={handleBackup}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  backupWarning
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                {backupWarning ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                <Download size={13} />
                <span className="hidden sm:flex flex-col items-start leading-none">
                  <span className="text-[11px] font-semibold">Backup</span>
                  <span className="text-[9px] opacity-70">{backupLabel}</span>
                </span>
              </button>

              {/* Hover tooltip */}
              <div className="absolute right-0 top-full mt-2 w-68 bg-[#1a1f2e] border border-white/10 rounded-xl p-3 shadow-2xl
                opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 w-64">
                <p className="text-xs font-semibold text-white mb-1">What does Backup do?</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Downloads your account history as a <span className="text-white">.json backup</span>.
                  Your day-to-day data stays attached to your login —
                  this gives you a portable recovery copy.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-purple-600 hover:bg-purple-500 text-white font-medium transition-all"
            >
              <Plus size={15} />
              <span className="hidden sm:block">Add Entry</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">

        {/* Month Navigator */}
        {(activeTab === 'dashboard' || activeTab === 'transactions' || activeTab === 'settings') && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentMonth(getMonthOffset(currentMonth, -1))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-purple-400" />
                <h1 className="text-lg font-semibold text-white">{parseMonthLabel(currentMonth)}</h1>
              </div>
              <button
                onClick={() => setCurrentMonth(getMonthOffset(currentMonth, 1))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              onClick={() => setCurrentMonth(toMonthKey(now))}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Today
            </button>
          </div>
        )}

        {/* Year selector */}
        {activeTab === 'trends' && (
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedYear(y => y - 1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-purple-400" />
              {selectedYear} Annual Overview
            </span>
            <button onClick={() => setSelectedYear(y => y + 1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Lifetime quick-stats strip */}
        {(activeTab === 'dashboard' || activeTab === 'india') && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="All-Time Sent to India"
              value={formatCurrency(lifetime.totalSentToIndia)}
              sub={`${lifetime.remittances.length} transfers`}
              icon={Send}
              color="orange"
            />
            <StatCard
              label="All-Time Invested"
              value={formatCurrency(lifetime.totalInvested)}
              sub={`${lifetime.investments.length} entries · $${INVESTMENT_FIXED}/each`}
              icon={TrendingUp}
              color="indigo"
            />
            <StatCard
              label="All-Time Misc Spent"
              value={formatCurrency(lifetime.totalExpenses)}
              sub="Across all months"
              icon={LayoutDashboard}
              color="purple"
            />
          </div>
        )}

        {/* ── Tab Content ── */}
        <Suspense fallback={<PanelFallback />}>
          {activeTab === 'dashboard' && <MonthlyOverview month={currentMonth} />}

          {activeTab === 'transactions' && (
            <TransactionsTable
              expenses={summary.expenses}
              remittances={summary.remittances}
              investments={summary.investments}
            />
          )}

          {activeTab === 'trends' && <YearlyTrends year={selectedYear} />}

          {activeTab === 'india' && <IndiaTracker />}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="flex gap-2 bg-white/5 rounded-xl p-1 w-fit">
                <button
                  onClick={() => setSettingsTab('budget')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    settingsTab === 'budget' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  💰 Budget Setup
                </button>
                <button
                  onClick={() => setSettingsTab('recurring')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    settingsTab === 'recurring' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🔁 Recurring
                </button>
                <button
                  onClick={() => setSettingsTab('data')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    settingsTab === 'data' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🗄️ Data & Storage
                </button>
              </div>

              {settingsTab === 'budget' && <BudgetSetup month={currentMonth} />}
              {settingsTab === 'recurring' && <RecurringExpensesManager />}
              {settingsTab === 'data'   && <DataManager />}
            </div>
          )}
        </Suspense>
      </main>

      {showAddModal && (
        <Suspense fallback={null}>
          <AddExpenseModal
            onClose={() => setShowAddModal(false)}
            defaultMonth={currentMonth}
          />
        </Suspense>
      )}

      {showProfileSettings && (
        <Suspense fallback={null}>
          <ProfileSettings onClose={() => setShowProfileSettings(false)} />
        </Suspense>
      )}

      <ToastContainer />
    </div>
  );
}
