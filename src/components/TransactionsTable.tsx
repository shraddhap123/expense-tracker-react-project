import { useState } from 'react';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import { type Expense, type Remittance, type Investment } from '../api/client';
import { removeExpense, removeRemittance, removeInvestment, editExpense } from '../hooks/useDB';
import { CATEGORY_EMOJI, CATEGORY_COLORS, formatCurrency } from '../db/database';
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

  const rows: Row[] = [
    ...expenses.map(d    => ({ kind: 'expense' as const, data: d })),
    ...remittances.map(d => ({ kind: 'india'   as const, data: d })),
    ...investments.map(d => ({ kind: 'invest'  as const, data: d })),
  ].sort((a, b) => b.data.date.localeCompare(a.data.date));

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
    setEditAmt(String(row.data.amount));
  };

  const saveEdit = async () => {
    if (editId == null) return;
    await editExpense(editId, { description: editDesc, amount: parseFloat(editAmt) });
    setEditId(null);
  };

  if (rows.length === 0) {
    return (
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-8 text-center text-gray-500">
        No transactions yet. Add one using the <span className="text-purple-400">+ Add Entry</span> button.
      </div>
    );
  }

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl overflow-hidden">
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
            {rows.map((row) => {
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
                    ) : formatCurrency(row.data.amount)}
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
    </div>
  );
}
