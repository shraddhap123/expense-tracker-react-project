import { useMemo, useState, useEffect, useRef } from 'react';
import { Trash2, Edit2, Check, X, Search, SlidersHorizontal, Repeat, ChevronLeft, ChevronRight } from 'lucide-react';
import { type Expense, type Remittance, type Investment } from '../api/client';
import { removeExpense, removeRemittance, removeInvestment, editExpense } from '../hooks/useDB';
import { CATEGORY_EMOJI, CATEGORY_COLORS, formatCurrency, formatOriginalCurrency } from '../db/database';
import { cn } from '../utils/cn';

const PAGE_SIZE = 25;

type Row =
  | { kind: 'expense'; data: Expense }
  | { kind: 'india';   data: Remittance }
  | { kind: 'invest';  data: Investment };

interface Props {
  expenses:    Expense[];
  remittances: Remittance[];
  investments: Investment[];
}

function dateLabel(dateStr: string) {
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const d         = new Date(dateStr + 'T00:00:00');
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function rowMeta(row: Row) {
  if (row.kind === 'expense') {
    const cat   = (row.data as Expense).category as keyof typeof CATEGORY_EMOJI;
    return {
      emoji: CATEGORY_EMOJI[cat] ?? '📦',
      label: (row.data as Expense).category,
      desc:  (row.data as Expense).description,
      color: CATEGORY_COLORS[cat] ?? '#64748b',
      badge: null as null | string,
    };
  }
  if (row.kind === 'india') {
    return { emoji: '🇮🇳', label: 'Transfer', desc: (row.data as Remittance).note || 'India remittance', color: '#f59e0b', badge: null };
  }
  return { emoji: '📈', label: 'Investment', desc: (row.data as Investment).note || 'Monthly investment', color: '#6366f1', badge: null };
}

function TxCard({
  row, index, isEditing, isConfirming, editDesc, editAmt,
  onEdit, onSaveEdit, onCancelEdit, onDelete,
  onEditDesc, onEditAmt, exiting,
}: {
  row: Row; index: number; isEditing: boolean; isConfirming: boolean;
  editDesc: string; editAmt: string;
  onEdit: () => void; onSaveEdit: () => void; onCancelEdit: () => void;
  onDelete: () => void; onEditDesc: (v: string) => void; onEditAmt: (v: string) => void;
  exiting: boolean;
}) {
  const meta    = rowMeta(row);
  const stagger = `stagger-${Math.min((index % 10) + 1, 10)}`;

  return (
    <div
      className={cn(
        'tx-card group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-white/6 bg-[var(--bg-surface)] cursor-default',
        exiting ? 'animate-slide-out' : `animate-slide-up ${stagger}`,
      )}
      style={{ '--tx-glow': meta.color } as React.CSSProperties}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px rgba(0,0,0,0.35), 0 0 0 1px ${meta.color}28`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      {/* Color left accent */}
      <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full" style={{ backgroundColor: meta.color }} />

      {/* Icon bubble */}
      <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg"
        style={{ backgroundColor: `${meta.color}18` }}>
        {meta.emoji}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            value={editDesc}
            onChange={e => onEditDesc(e.target.value)}
            className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 mb-1"
            autoFocus
          />
        ) : (
          <p className="text-sm font-medium text-gray-100 truncate">{meta.desc}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
            {meta.label}
          </span>
          {row.kind === 'expense' && (row.data as Expense).recurring_rule_id && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">
              <Repeat size={9} /> Recurring
            </span>
          )}
          <span className="text-[11px] text-gray-600">{row.data.date}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        {isEditing ? (
          <input
            value={editAmt}
            onChange={e => onEditAmt(e.target.value)}
            type="number"
            className="w-24 bg-white/8 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white text-right focus:outline-none focus:border-purple-500"
          />
        ) : (
          <>
            <p className="text-sm font-bold text-white">−{formatCurrency(row.data.amount)}</p>
            {row.data.currency_code && row.data.currency_code !== 'USD' && (
              <p className="text-[10px] text-gray-600">{formatOriginalCurrency(row.data.original_amount, row.data.currency_code)}</p>
            )}
          </>
        )}
      </div>

      {/* Actions — visible on hover or when editing/confirming */}
      <div className={cn(
        'shrink-0 flex items-center gap-1.5 transition-all duration-200',
        isEditing || isConfirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        {isEditing ? (
          <>
            <button onClick={onSaveEdit}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/35 transition-colors">
              <Check size={13} />
            </button>
            <button onClick={onCancelEdit}
              className="p-1.5 rounded-lg bg-white/8 text-gray-400 hover:bg-white/15 transition-colors">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            {row.kind === 'expense' && (
              <button onClick={onEdit}
                className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/30 transition-colors">
                <Edit2 size={13} />
              </button>
            )}
            <button
              onClick={onDelete}
              title={isConfirming ? 'Tap again to confirm' : 'Delete'}
              className={cn(
                'p-1.5 rounded-lg transition-all duration-200',
                isConfirming
                  ? 'bg-red-500 text-white scale-110'
                  : 'bg-red-500/15 text-red-400 hover:bg-red-500/30'
              )}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TransactionsTable({ expenses, remittances, investments }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [exitingKey,    setExitingKey]    = useState<string | null>(null);
  const [editId,        setEditId]        = useState<number | null>(null);
  const [editDesc,      setEditDesc]      = useState('');
  const [editAmt,       setEditAmt]       = useState('');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [kindFilter,    setKindFilter]    = useState<'all' | Row['kind']>('all');
  const [categoryFilter,setCategoryFilter]= useState<'all' | string>('all');
  const [page,          setPage]          = useState(1);
  const [filterKey,     setFilterKey]     = useState(0); // bump to re-trigger entrance anim
  const prevFilter = useRef({ searchQuery, kindFilter, categoryFilter });

  useEffect(() => {
    const prev = prevFilter.current;
    if (prev.searchQuery !== searchQuery || prev.kindFilter !== kindFilter || prev.categoryFilter !== categoryFilter) {
      setFilterKey(k => k + 1);
      setPage(1);
      prevFilter.current = { searchQuery, kindFilter, categoryFilter };
    }
  }, [searchQuery, kindFilter, categoryFilter]);

  const rows: Row[] = useMemo(() => [
    ...expenses.map(d    => ({ kind: 'expense' as const, data: d })),
    ...remittances.map(d => ({ kind: 'india'   as const, data: d })),
    ...investments.map(d => ({ kind: 'invest'  as const, data: d })),
  ].sort((a, b) => b.data.date.localeCompare(a.data.date)), [expenses, remittances, investments]);

  const expenseCategories = useMemo(
    () => Array.from(new Set(expenses.map(e => e.category))).sort(),
    [expenses],
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter(row => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (categoryFilter !== 'all') {
        if (row.kind !== 'expense' || row.data.category !== categoryFilter) return false;
      }
      if (!query) return true;
      const meta    = rowMeta(row);
      const haystack = [row.data.date, meta.desc, meta.label, String(row.data.amount)].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, searchQuery, kindFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows  = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; rows: typeof pagedRows }[] = [];
    for (const row of pagedRows) {
      const lbl = dateLabel(row.data.date);
      const last = groups[groups.length - 1];
      if (last && last.label === lbl) last.rows.push(row);
      else groups.push({ label: lbl, rows: [row] });
    }
    return groups;
  }, [pagedRows]);

  // Summary totals for filtered view
  const filteredTotal = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.data.amount, 0),
    [filteredRows],
  );

  const handleDelete = async (row: Row) => {
    const key = `${row.kind}-${row.data.id}`;
    if (confirmDelete === key) {
      setExitingKey(key);
      setTimeout(async () => {
        if (row.kind === 'expense')     await removeExpense(row.data.id);
        else if (row.kind === 'india')  await removeRemittance(row.data.id);
        else                            await removeInvestment(row.data.id);
        setExitingKey(null);
        setConfirmDelete(null);
      }, 280);
    } else {
      setConfirmDelete(key);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const startEdit = (row: Row) => {
    if (row.kind !== 'expense') return;
    setEditId(row.data.id);
    setEditDesc(row.data.description);
    setEditAmt(String(row.data.original_amount ?? row.data.amount));
  };

  const saveEdit = async () => {
    if (editId == null) return;
    const row = expenses.find(e => e.id === editId);
    await editExpense(editId, {
      description: editDesc,
      originalAmount: parseFloat(editAmt),
      currencyCode: row?.currency_code,
    } as Partial<Expense> & { originalAmount: number; currencyCode?: string });
    setEditId(null);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl">📋</div>
        <p className="text-gray-400 font-medium">No transactions yet</p>
        <p className="text-sm text-gray-600">Add an entry using the <span className="text-purple-400">+ Add</span> button</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Search + filters ── */}
      <div className="bg-[var(--bg-surface)] border border-white/8 rounded-2xl p-4 animate-slide-up stagger-1">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search transactions…"
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-primary)] border border-white/8 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 transition-colors"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-gray-600 shrink-0" />
            <select
              value={kindFilter}
              onChange={e => setKindFilter(e.target.value as 'all' | Row['kind'])}
              className="px-3 py-2.5 bg-[var(--bg-primary)] border border-white/8 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors"
            >
              <option value="all">All types</option>
              <option value="expense">Expenses</option>
              <option value="india">Transfers</option>
              <option value="invest">Investments</option>
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 bg-[var(--bg-primary)] border border-white/8 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors"
            >
              <option value="all">All categories</option>
              {expenseCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary row */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-gray-500">
            <span className="text-gray-300 font-medium">{filteredRows.length}</span> transactions
            {(searchQuery || kindFilter !== 'all' || categoryFilter !== 'all') && (
              <span> · <span className="text-gray-300 font-medium">{formatCurrency(filteredTotal)}</span> total</span>
            )}
          </span>
          {(searchQuery || kindFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setKindFilter('all'); setCategoryFilter('all'); }}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Grouped transaction cards ── */}
      {filteredRows.length === 0 ? (
        <div className="py-16 text-center animate-fade-scale-in">
          <p className="text-gray-500 text-sm">No transactions match your filters</p>
        </div>
      ) : (
        <div key={filterKey} className="space-y-5">
          {grouped.map(group => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{group.label}</span>
                <div className="flex-1 h-px bg-white/6" />
                <span className="text-xs text-gray-600">
                  {formatCurrency(group.rows.reduce((s, r) => s + r.data.amount, 0))}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {group.rows.map((row, i) => {
                  const key         = `${row.kind}-${row.data.id}`;
                  const isEditing   = row.kind === 'expense' && editId === row.data.id;
                  const isConfirming = confirmDelete === key;
                  const exiting     = exitingKey === key;
                  return (
                    <TxCard
                      key={key}
                      row={row}
                      index={i}
                      isEditing={isEditing}
                      isConfirming={isConfirming}
                      exiting={exiting}
                      editDesc={editDesc}
                      editAmt={editAmt}
                      onEdit={() => startEdit(row)}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => setEditId(null)}
                      onDelete={() => handleDelete(row)}
                      onEditDesc={setEditDesc}
                      onEditAmt={setEditAmt}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 animate-slide-up">
          <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-25 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(n); return acc;
              }, [])
              .map((n, i) =>
                n === '...'
                  ? <span key={`e-${i}`} className="px-1 text-gray-600 text-xs">…</span>
                  : <button key={n} onClick={() => setPage(n as number)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                        page === n ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}>{n}</button>
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-25 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
