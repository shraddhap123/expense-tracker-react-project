import { useMemo, useState } from 'react';
import { Trash2, Edit2, Check, X, Search, ListFilter, Repeat, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;
import { type Expense, type Remittance, type Investment } from '../api/client';
import { removeExpense, removeRemittance, removeInvestment, editExpense } from '../hooks/useDB';
import { CATEGORY_EMOJI, CATEGORY_COLORS, formatCurrency, formatOriginalCurrency } from '../db/database';
import { cn } from '../utils/cn';

type Row =
  | { kind: 'expense'; data: Expense }
  | { kind: 'india';   data: Remittance }
  | { kind: 'invest';  data: Investment };

interface Props {
  expenses:    Expense[];
  remittances: Remittance[];
  investments: Investment[];
}

export default function TransactionsTable({ expenses, remittances, investments }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editId,   setEditId]   = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmt,  setEditAmt]  = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | Row['kind']>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [page, setPage] = useState(1);

  const rows: Row[] = [
    ...expenses.map(d    => ({ kind: 'expense' as const, data: d })),
    ...remittances.map(d => ({ kind: 'india'   as const, data: d })),
    ...investments.map(d => ({ kind: 'invest'  as const, data: d })),
  ].sort((a, b) => b.data.date.localeCompare(a.data.date));

  const expenseCategories = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.category))).sort(),
    [expenses]
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) {
        return false;
      }

      if (categoryFilter !== 'all') {
        if (row.kind !== 'expense' || row.data.category !== categoryFilter) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const label = row.kind === 'expense'
        ? row.data.description
        : row.kind === 'india'
          ? row.data.note || 'Remittance'
          : row.data.note || 'Monthly Investment';

      const category = row.kind === 'expense' ? row.data.category : row.kind === 'india' ? 'India' : 'Investment';
      const haystack = [row.data.date, label, category, String(row.data.amount)].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [categoryFilter, kindFilter, rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (row: Row) => {
    const key = `${row.kind}-${row.data.id}`;
    if (confirmDelete === key) {
      if (row.kind === 'expense') await removeExpense(row.data.id);
      else if (row.kind === 'india') await removeRemittance(row.data.id);
      else await removeInvestment(row.data.id);
      setConfirmDelete(null);
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
    const row = expenses.find((expense) => expense.id === editId);
    await editExpense(editId, {
      description: editDesc,
      originalAmount: parseFloat(editAmt),
      currencyCode: row?.currency_code,
    } as Partial<Expense> & { originalAmount: number; currencyCode?: string });
    setEditId(null);
  };

  if (rows.length === 0) {
    return (
      <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-8 text-center text-gray-500">
        No transactions yet. Add one using the <span className="text-purple-400">+ Add Entry</span> button.
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl overflow-hidden">
      <div className="border-b border-white/10 px-4 py-4 bg-white/[0.02]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search description, date, category, or amount"
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 lg:w-auto">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <ListFilter size={14} className="text-gray-500" />
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as 'all' | Row['kind'])}
                className="px-3 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All types</option>
                <option value="expense">Expenses</option>
                <option value="india">India</option>
                <option value="invest">Investments</option>
              </select>
            </label>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All categories</option>
              {expenseCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing <span className="text-gray-300">{filteredRows.length}</span> of <span className="text-gray-300">{rows.length}</span> transactions
          </span>
          {(searchQuery || kindFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setKindFilter('all');
                setCategoryFilter('all');
                setPage(1);
              }}
              className="text-purple-400 hover:text-purple-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {pagedRows.map((row) => {
              const key = `${row.kind}-${row.data.id}`;
              const isEditing    = row.kind === 'expense' && editId === row.data.id;
              const isConfirming = confirmDelete === key;

              let typeLabel   = '';
              let description = '';
              let color       = '';

              if (row.kind === 'expense') {
                const cat      = (row.data as Expense).category as keyof typeof CATEGORY_EMOJI;
                const emoji    = CATEGORY_EMOJI[cat] ?? '📦';
                const catColor = CATEGORY_COLORS[cat] ?? '#64748b';
                typeLabel   = `${emoji} ${(row.data as Expense).category}`;
                description = (row.data as Expense).description;
                color       = catColor;
              } else if (row.kind === 'india') {
                typeLabel   = '🇮🇳 India';
                description = (row.data as Remittance).note || 'Remittance';
                color       = '#f59e0b';
              } else {
                typeLabel   = '📈 Investment';
                description = (row.data as Investment).note || 'Monthly Investment';
                color       = '#6366f1';
              }

              return (
                <tr key={key} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{row.data.date}</td>
                  <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        {typeLabel}
                      </span>
                      {row.kind === 'expense' && row.data.recurring_rule_id && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/15 text-cyan-300">
                          <Repeat size={10} />
                          Recurring
                        </span>
                      )}
                    </td>
                  <td className="px-4 py-3 text-gray-200">
                    {isEditing ? (
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm w-full"
                      />
                    ) : description}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
                    {isEditing ? (
                      <input
                        value={editAmt}
                        onChange={(e) => setEditAmt(e.target.value)}
                        type="number"
                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm w-24 text-right"
                      />
                    ) : (
                      <div>
                        <div>{formatCurrency(row.data.amount)}</div>
                        {row.data.currency_code && row.data.currency_code !== 'USD' && (
                          <div className="text-[11px] font-normal text-gray-500">
                            {formatOriginalCurrency(row.data.original_amount, row.data.currency_code)}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/40 transition-colors">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          {row.kind === 'expense' && (
                            <button onClick={() => startEdit(row)} className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors">
                              <Edit2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(row)}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              isConfirming
                                ? 'bg-red-500 text-white'
                                : 'bg-red-500/20 text-red-400 hover:bg-red-500/40'
                            )}
                            title={isConfirming ? 'Click again to confirm delete' : 'Delete'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredRows.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-gray-500 border-t border-white/10">
          No transactions match your current search or filters.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-gray-500 text-xs">
            Page {page} of {totalPages} &nbsp;·&nbsp; {filteredRows.length} transactions
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === '...'
                  ? <span key={`ellipsis-${i}`} className="px-1 text-gray-600">…</span>
                  : <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                        page === n ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >{n}</button>
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
