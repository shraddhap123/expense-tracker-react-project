import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import Modal from './ui/Modal';
import { addExpense, addRemittance, addInvestment } from '../hooks/useDB';
import { CATEGORIES, INVESTMENT_FIXED, SUPPORTED_CURRENCIES, formatCurrency, normalizeCurrencyCode } from '../db/database';

type EntryType = 'expense' | 'india' | 'invest';

interface Props {
  onClose: () => void;
  defaultMonth?: string; // YYYY-MM — reserved for future pre-selection
}

export default function AddExpenseModal({ onClose, defaultMonth: _defaultMonth }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (type === 'expense') {
        await addExpense({
          description,
          amount: parseFloat(amount),
          originalAmount: parseFloat(amount),
          currencyCode,
          category,
          date,
        });
      } else if (type === 'india') {
        await addRemittance({
          amount: parseFloat(amount),
          originalAmount: parseFloat(amount),
          currencyCode,
          note,
          date,
        });
      } else {
        await addInvestment({ note: note || 'Monthly investment', date });
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const TAB_BTN = (t: EntryType, label: string, emoji: string) => (
    <button
      type="button"
      onClick={() => setType(t)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
        type === t ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
      }`}
    >
      {emoji} {label}
    </button>
  );

  return (
    <Modal title="Add Entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {TAB_BTN('expense', 'Expense', '💸')}
          {TAB_BTN('india', 'Send to India', '🇮🇳')}
          {TAB_BTN('invest', 'Investment', '📈')}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Investment: fixed amount banner */}
        {type === 'invest' ? (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 text-center">
            <p className="text-indigo-300 font-semibold text-lg">{formatCurrency(INVESTMENT_FIXED)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Fixed investment amount</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Amount</label>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(normalizeCurrencyCode(e.target.value))}
                className="bg-[#0f1117] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                {Object.values(SUPPORTED_CURRENCIES).map((currency) => (
                  <option key={currency.code} value={currency.code}>{currency.code}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Expense-specific fields */}
        {type === 'expense' && (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Groceries at Walmart"
                required
                className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Remittance & Investment note */}
        {(type === 'india' || type === 'invest') && (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={type === 'india' ? 'e.g. Sent to parents' : 'e.g. Mutual fund SIP'}
              className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-all"
        >
          <PlusCircle size={16} />
          {loading ? 'Saving...' : 'Add Entry'}
        </button>
      </form>
    </Modal>
  );
}
