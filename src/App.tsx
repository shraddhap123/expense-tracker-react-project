import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, List, TrendingUp, Send, Settings,
  Plus, ChevronLeft, ChevronRight, Sun, Moon, Menu, X,
  Download, AlertTriangle, CheckCircle2, LogOut, User,
} from 'lucide-react';
import { toMonthKey, parseMonthLabel, formatCurrency, INVESTMENT_FIXED } from './db/database';
import { useMonthSummary, useLifetimeTotals, exportBackupJSON, getLastBackupMeta } from './hooks/useDB';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { useRipple } from './hooks/useRipple';
import StatCard from './components/StatCard';
import { ToastContainer } from './components/Toast';

const MonthlyOverview      = lazy(() => import('./components/MonthlyOverview'));
const TransactionsTable    = lazy(() => import('./components/TransactionsTable'));
const YearlyTrends         = lazy(() => import('./components/YearlyTrends'));
const IndiaTracker         = lazy(() => import('./components/IndiaTracker'));
const BudgetSetup          = lazy(() => import('./components/BudgetSetup'));
const DataManager          = lazy(() => import('./components/DataManager'));
const RecurringExpensesManager = lazy(() => import('./components/RecurringExpensesManager'));
const AddExpenseModal      = lazy(() => import('./components/AddExpenseModal'));
const ProfileSettings      = lazy(() => import('./components/auth/ProfileSettings'));

type Tab = 'dashboard' | 'transactions' | 'trends' | 'india' | 'settings';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: List            },
  { id: 'trends',       label: 'Trends',       icon: TrendingUp      },
  { id: 'india',        label: 'Transfers',    icon: Send            },
  { id: 'settings',     label: 'Settings',     icon: Settings        },
];

function getMonthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + offset, 1));
}

function SkeletonPanel() {
  return (
    <div className="space-y-4 animate-fade-scale-in">
      <div className="skeleton h-48 rounded-2xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    </div>
  );
}

/* Sidebar nav with morphing active pill */
function SidebarNav({ activeTab, onSelect }: { activeTab: Tab; onSelect: (t: Tab) => void }) {
  const ripple   = useRipple();
  const navRef   = useRef<HTMLDivElement>(null);
  const [pillY,  setPillY]  = useState(0);
  const [pillH,  setPillH]  = useState(40);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Update pill position whenever active tab changes
  useEffect(() => {
    const idx = NAV_ITEMS.findIndex(n => n.id === activeTab);
    const btn = itemRefs.current[idx];
    const nav = navRef.current;
    if (btn && nav) {
      const navTop = nav.getBoundingClientRect().top;
      const btnRect = btn.getBoundingClientRect();
      setPillY(btnRect.top - navTop);
      setPillH(btnRect.height);
    }
  }, [activeTab]);

  return (
    <div ref={navRef} className="relative flex-1 px-3 py-2">
      {/* Morphing active background pill */}
      <div
        className="nav-pill-active absolute left-3 right-3 rounded-xl bg-purple-600/18 border border-purple-500/25 pointer-events-none"
        style={{
          top: pillY,
          height: pillH,
          transition: 'top 0.28s cubic-bezier(.4,0,.2,1), height 0.28s cubic-bezier(.4,0,.2,1)',
        }}
      />

      {NAV_ITEMS.map(({ id, label, icon: Icon }, i) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            ref={el => { itemRefs.current[i] = el; }}
            onClick={e => { ripple(e); onSelect(id); }}
            className={`ripple-btn relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 mb-0.5 ${
              active ? 'text-purple-200' : 'text-gray-500 hover:text-gray-200'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all duration-200 ${
              active ? 'bg-purple-500/30 text-purple-300' : 'bg-white/4 text-gray-500 group-hover:bg-white/8'
            }`}>
              <Icon size={15} />
            </div>
            <span>{label}</span>
            {active && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.8)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const now  = new Date();
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const ripple = useRipple();

  const [activeTab,     setActiveTab]     = useState<Tab>('dashboard');
  const [tabKey,        setTabKey]        = useState(0);

  const [currentMonth,  setCurrentMonth]  = useState(toMonthKey(now));
  const [monthDir,      setMonthDir]      = useState<'left' | 'right' | null>(null);
  const [monthKey,      setMonthKey]      = useState(0);

  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [settingsTab,   setSettingsTab]   = useState<'budget' | 'recurring' | 'data'>('budget');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [showProfile,   setShowProfile]   = useState(false);
  const [userMenuOpen,  setUserMenuOpen]  = useState(false);

  const [backupMeta, setBackupMeta] = useState(getLastBackupMeta());
  useEffect(() => { setBackupMeta(getLastBackupMeta()); }, []);
  const backupAgeDays = backupMeta ? Math.floor((Date.now() - new Date(backupMeta.exportedAt).getTime()) / 86_400_000) : null;
  const backupWarning = backupMeta === null || (backupAgeDays !== null && backupAgeDays >= 7);
  const backupLabel   = backupMeta === null ? 'Never' : backupAgeDays === 0 ? 'Today' : `${backupAgeDays}d ago`;
  const handleBackup  = async () => { await exportBackupJSON(); setBackupMeta(getLastBackupMeta()); };

  const summary  = useMonthSummary(currentMonth);
  const lifetime = useLifetimeTotals();
  const initials = user?.displayName?.charAt(0).toUpperCase() ?? '?';

  // Tab switch with transition key
  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabKey(k => k + 1);
    setSidebarOpen(false);
  };

  // Month navigation with direction
  const goMonth = (dir: 1 | -1) => {
    setMonthDir(dir === 1 ? 'left' : 'right');
    setCurrentMonth(getMonthOffset(currentMonth, dir));
    setMonthKey(k => k + 1);
  };
  const goToday = () => {
    setMonthDir('right');
    setCurrentMonth(toMonthKey(now));
    setMonthKey(k => k + 1);
  };

  // Determine slide class based on direction
  const monthSlideClass = monthDir === 'left' ? 'animate-slide-from-right' : 'animate-slide-from-left';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-scale-in"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full z-50 flex flex-col w-60
        bg-[var(--bg-sidebar)] border-r border-white/6
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 animate-fade-scale-in">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 14px rgba(139,92,246,0.4)' }}>
              $
            </div>
            <span className="font-bold text-white text-base tracking-tight">ExpenseIQ</span>
          </div>
          <button className="lg:hidden text-gray-500 hover:text-white transition-colors"
            onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Morphing nav */}
        <SidebarNav activeTab={activeTab} onSelect={switchTab} />

        {/* Bottom actions */}
        <div className="px-3 pb-4 border-t border-white/6 pt-3 space-y-1">
          {/* Backup */}
          <button
            onClick={handleBackup}
            className={`ripple-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              backupWarning
                ? 'border-amber-500/25 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15'
                : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15'
            }`}
          >
            {backupWarning ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span className="flex-1 text-left">Backup</span>
            <span className="text-[10px] opacity-60">{backupLabel}</span>
            <Download size={12} />
          </button>

          {/* Theme */}
          <button
            onClick={e => { ripple(e); toggleTheme(); }}
            className="ripple-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all"
          >
            <div className="p-1.5 rounded-lg bg-white/5">
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </div>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {/* User */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="ripple-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                  {initials}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-gray-600 truncate">{user.email}</p>
                </div>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-surface)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-scale-in">
                    <button
                      onClick={() => { setShowProfile(true); setUserMenuOpen(false); }}
                      className="ripple-btn w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <User size={14} /> Profile settings
                    </button>
                    <button
                      onClick={logout}
                      className="ripple-btn w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-white/6">
          <div className="h-14 px-4 lg:px-6 flex items-center justify-between gap-4">

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="ripple-btn lg:hidden p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all"
              >
                <Menu size={18} />
              </button>
              <div key={activeTab} className="animate-fade-scale-in min-w-0">
                <h1 className="text-base font-semibold text-white leading-none truncate">
                  {NAV_ITEMS.find(n => n.id === activeTab)?.label}
                </h1>
                {(activeTab === 'dashboard' || activeTab === 'transactions' || activeTab === 'settings') && (
                  <p className="text-xs text-gray-600 mt-0.5 hidden sm:block">{parseMonthLabel(currentMonth)}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Month navigator */}
              {(activeTab === 'dashboard' || activeTab === 'transactions' || activeTab === 'settings') && (
                <div className="flex items-center gap-0.5 bg-white/5 rounded-xl px-1 py-1 border border-white/6">
                  <button
                    onClick={e => { ripple(e); goMonth(-1); }}
                    className="ripple-btn p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={e => { ripple(e); goToday(); }}
                    className="ripple-btn px-2 py-1 text-xs font-semibold text-purple-300 hover:text-white transition-colors max-w-[80px] sm:max-w-none truncate"
                  >
                    {parseMonthLabel(currentMonth)}
                  </button>
                  <button
                    onClick={e => { ripple(e); goMonth(1); }}
                    className="ripple-btn p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {activeTab === 'trends' && (
                <div className="flex items-center gap-0.5 bg-white/5 rounded-xl px-1 py-1 border border-white/6">
                  <button onClick={() => setSelectedYear(y => y - 1)} className="ripple-btn p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-2.5 text-xs font-semibold text-purple-300">{selectedYear}</span>
                  <button onClick={() => setSelectedYear(y => y + 1)} className="ripple-btn p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* Add button with ripple */}
              <button
                onClick={e => { ripple(e); setShowAddModal(true); }}
                className="ripple-btn flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 14px rgba(139,92,246,0.35)' }}
              >
                <Plus size={15} />
                <span className="hidden sm:block">Add</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content with tab transition */}
        <main className="flex-1 p-4 lg:p-6 pb-32 lg:pb-6 overflow-auto">

          {activeTab === 'india' && (
            <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up">
              <StatCard label="All-Time Sent" value={formatCurrency(lifetime.totalSentToIndia)} sub={`${lifetime.remittances.length} transfers`} icon={Send} color="orange" />
              <StatCard label="All-Time Invested" value={formatCurrency(lifetime.totalInvested)} sub={`${lifetime.investments.length} entries · $${INVESTMENT_FIXED}/each`} icon={TrendingUp} color="indigo" />
              <StatCard label="All-Time Misc" value={formatCurrency(lifetime.totalExpenses)} sub="Across all months" icon={LayoutDashboard} color="purple" />
            </div>
          )}

          <Suspense fallback={<SkeletonPanel />}>

            {/* Dashboard — month slide */}
            {activeTab === 'dashboard' && (
              <div key={`dash-${monthKey}`} className={monthKey > 0 ? monthSlideClass : 'animate-page-enter'}>
                <MonthlyOverview month={currentMonth} />
              </div>
            )}

            {/* Transactions — month slide */}
            {activeTab === 'transactions' && (
              <div key={`tx-${monthKey}`} className={monthKey > 0 ? monthSlideClass : 'animate-page-enter'}>
                <TransactionsTable
                  expenses={summary.expenses}
                  remittances={summary.remittances}
                  investments={summary.investments}
                />
              </div>
            )}

            {/* Other tabs — page enter */}
            {activeTab === 'trends' && (
              <div key={`trends-${tabKey}`} className="animate-page-enter">
                <YearlyTrends year={selectedYear} />
              </div>
            )}

            {activeTab === 'india' && (
              <div key={`india-${tabKey}`} className="animate-page-enter">
                <IndiaTracker />
              </div>
            )}

            {activeTab === 'settings' && (
              <div key={`settings-${tabKey}`} className="animate-page-enter space-y-6">
                <div className="flex gap-2">
                  {[
                    { id: 'budget' as const,    label: 'Budget',    emoji: '💰' },
                    { id: 'recurring' as const, label: 'Recurring', emoji: '🔁' },
                    { id: 'data' as const,      label: 'Data',      emoji: '🗄️' },
                  ].map(({ id, label, emoji }) => (
                    <button
                      key={id}
                      onClick={e => { ripple(e); setSettingsTab(id); }}
                      className={`ripple-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                        settingsTab === id
                          ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                          : 'text-gray-500 hover:text-gray-200 border-white/6 hover:bg-white/5'
                      }`}
                    >
                      {emoji} {label}
                    </button>
                  ))}
                </div>
                {settingsTab === 'budget'    && <BudgetSetup month={currentMonth} />}
                {settingsTab === 'recurring' && <RecurringExpensesManager />}
                {settingsTab === 'data'      && <DataManager />}
              </div>
            )}

          </Suspense>
        </main>
      </div>

      {/* ── Mobile bottom nav bar ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-[var(--bg-sidebar)]/95 backdrop-blur-md">
        <div className="flex items-center justify-around px-2 pt-2 pb-3">
          {NAV_ITEMS.slice(0, 4).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={e => { ripple(e); switchTab(id); }}
                className={`ripple-btn flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all ${
                  active ? 'text-purple-400' : 'text-gray-500'
                }`}
              >
                <Icon size={21} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
                {active && <span className="w-1 h-1 rounded-full bg-purple-400 mt-0.5" />}
              </button>
            );
          })}
          {/* Placeholder to keep spacing symmetrical */}
          <div className="w-16" />
        </div>
      </nav>

      {/* ── Floating Add button (separate from nav so it's not clipped) ── */}
      <button
        onClick={e => { ripple(e); setShowAddModal(true); }}
        className="ripple-btn lg:hidden fixed z-50 active:scale-95 transition-transform"
        style={{ bottom: '52px', left: '50%', transform: 'translateX(-50%)' }}
      >
        <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 20px rgba(139,92,246,0.6)' }}>
          <Plus size={24} className="text-white" />
        </div>
      </button>

      {/* Spacer — tall enough to clear bottom nav */}
      <div className="lg:hidden h-28" />

      {showAddModal && (
        <Suspense fallback={null}>
          <AddExpenseModal onClose={() => setShowAddModal(false)} defaultMonth={currentMonth} />
        </Suspense>
      )}
      {showProfile && (
        <Suspense fallback={null}>
          <ProfileSettings onClose={() => setShowProfile(false)} />
        </Suspense>
      )}

      <ToastContainer />
    </div>
  );
}
