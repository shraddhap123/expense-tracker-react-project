import { useState } from 'react';
import { PlusCircle, Zap } from 'lucide-react';
import Modal from './ui/Modal';
import { addExpense, addRemittance, addInvestment } from '../hooks/useDB';
import { CATEGORIES, SUPPORTED_CURRENCIES, normalizeCurrencyCode, type ExpenseCategory } from '../db/database';

type EntryType = 'expense' | 'india' | 'invest';

interface Props {
  onClose: () => void;
  defaultMonth?: string;
}

function detectCategory(text: string): ExpenseCategory {
  const t = text.toLowerCase();
  if (/food|lunch|dinner|breakfast|restaurant|coffee|cafe|pizza|burger|grocery|groceries|walmart|target|safeway|kroger|eat|sushi|thai|indian|chinese|taco|sandwich|salad/.test(t)) return 'Food & Dining';
  if (/uber|lyft|gas|parking|train|bus|metro|taxi|car|auto|transport|drive|fuel|toll|commute/.test(t)) return 'Transport';
  if (/amazon|shop|buy|mall|store|clothes|shoes|fashion|clothing|apparel|ebay|etsy/.test(t)) return 'Shopping';
  if (/netflix|spotify|hulu|disney|movie|cinema|game|ticket|concert|entertainment|steam|apple tv|youtube/.test(t)) return 'Entertainment';
  if (/doctor|pharmacy|medicine|gym|health|dental|medical|hospital|fitness|prescription|yoga/.test(t)) return 'Health';
  if (/electric|water|internet|phone|utility|utilities|bill|pg&e|comcast|at&t|verizon|t-mobile/.test(t)) return 'Utilities';
  if (/rent|mortgage|home|housing|apartment|condo|lease|landlord/.test(t)) return 'Housing';
  return 'Misc';
}

function parseQuickAdd(text: string): { amount: number; description: string; category: ExpenseCategory } | null {
  const stripped = text.trim();
  if (!stripped) return null;

  // Match amount — supports "$18", "18.50", "$1,200"
  const amountMatch = stripped.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const description = stripped.replace(amountMatch[0], '').replace(/\s+/g, ' ').trim() || 'Expense';
  const category = detectCategory(description);

  return { amount, description, category };
}

export default function AddExpenseModal({ onClose, defaultMonth: _defaultMonth }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [type, setType] = useState<EntryType>('expense');
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>(CATEGORIES[0]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [investAmount, setInvestAmount] = useState('2500');

  const applyQuickParse = () => {
    const parsed = parseQuickAdd(quickText);
    if (!parsed) {
      setQuickError('Could not parse. Try: "Lunch $18" or "$25 transport"');
      return false;
    }
    setAmount(String(parsed.amount));
    setDescription(parsed.description);
    setCategory(parsed.category);
    setQuickError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (quickMode && type === 'expense') {
      if (!applyQuickParse()) return;
    }

    setLoading(true);
    try {
      if (type === 'expense') {
        const finalAmount = quickMode ? parseQuickAdd(quickText)?.amount ?? parseFloat(amount) : parseFloat(amount);
        const finalDesc = quickMode ? (parseQuickAdd(quickText)?.description ?? description) : description;
        const finalCat = quickMode ? (parseQuickAdd(quickText)?.category ?? category) : category;
        await addExpense({
          description: finalDesc,
          amount: finalAmount,
          originalAmount: finalAmount,
          currencyCode,
          category: finalCat,
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
        await addInvestment({ note: note || 'Monthly investment', date, amount: parseFloat(investAmount) || 2500 });
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

        {/* Quick-Add toggle (expense only) */}
        {type === 'expense' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Quick add mode</span>
            <button
              type="button"
              onClick={() => { setQuickMode(q => !q); setQuickError(''); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                quickMode ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Zap size={12} />
              {quickMode ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {/* Quick Add input */}
        {type === 'expense' && quickMode && (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Quick Add</label>
            <input
              type="text"
              value={quickText}
              onChange={(e) => { setQuickText(e.target.value); setQuickError(''); }}
              placeholder='e.g. "Lunch $18" or "$25 gas"'
              autoFocus
              className="w-full bg-[var(--bg-primary)] border border-purple-500/40 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
            {quickError && <p className="text-xs text-red-400 mt-1">{quickError}</p>}
            <p className="text-[11px] text-gray-500 mt-1">Category is auto-detected from the description.</p>
          </div>
        )}

        {/* Date */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Investment: configurable amount */}
        {type === 'invest' ? (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Investment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                required
                className="w-full bg-[var(--bg-primary)] border border-indigo-500/30 rounded-xl pl-8 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Default is $2,500 — change as needed.</p>
          </div>
        ) : (
          /* Amount field — hidden in quick mode for expenses */
          (!quickMode || type !== 'expense') && (
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
                  className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(normalizeCurrencyCode(e.target.value))}
                  className="bg-[var(--bg-primary)] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((currency) => (
                    <option key={currency.code} value={currency.code}>{currency.code}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        )}

        {/* Expense-specific fields — hidden in quick mode */}
        {type === 'expense' && !quickMode && (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Groceries at Walmart"
                required
                className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
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
              className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
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
