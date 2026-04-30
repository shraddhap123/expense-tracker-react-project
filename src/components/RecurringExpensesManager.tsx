import { useMemo, useState } from 'react';
import { CalendarSync, Pause, Play, Repeat, Trash2 } from 'lucide-react';
import { addRecurringExpenseRule, editRecurringExpenseRule, removeRecurringExpenseRule, useRecurringExpenseRules } from '../hooks/useDB';
import { CATEGORIES, SUPPORTED_CURRENCIES, formatCurrency, formatOriginalCurrency, normalizeCurrencyCode, parseMonthLabel, toMonthKey } from '../db/database';

export default function RecurringExpensesManager() {
  const { rules, loading } = useRecurringExpenseRules();
  const nextMonth = (() => {
    const [year, month] = toMonthKey(new Date()).split('-').map(Number);
    return toMonthKey(new Date(year, month, 1));
  })();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [startMonth, setStartMonth] = useState(nextMonth);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(() => rules.filter((rule) => rule.active === 1).length, [rules]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addRecurringExpenseRule({
        description,
        amount: Number(amount),
        originalAmount: Number(amount),
        currencyCode,
        category,
        dayOfMonth: Number(dayOfMonth),
        startMonth,
      });
      setDescription('');
      setAmount('');
      setCategory(CATEGORIES[0]);
      setDayOfMonth(String(new Date().getDate()));
      setStartMonth(nextMonth);
      setCurrencyCode('USD');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <CalendarSync size={18} className="text-cyan-400" />
            <h3 className="font-semibold text-white">Recurring Expenses</h3>
          </div>
          <div className="text-xs text-gray-400">
            <span className="text-white font-medium">{activeCount}</span> active rule{activeCount === 1 ? '' : 's'}
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-4 leading-relaxed">
          Use recurring expenses for things like rent, subscriptions, insurance, or bills.
          Each rule creates one expense entry per month on the day you choose.
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-7 gap-3">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Netflix, Rent, Internet..."
            className="lg:col-span-2 bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
            className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
          />
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(normalizeCurrencyCode(e.target.value))}
            className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
          >
            {Object.values(SUPPORTED_CURRENCIES).map((currency) => (
              <option key={currency.code} value={currency.code}>{currency.code}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
          >
            {CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            required
            placeholder="Day"
            className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            required
            className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500"
          />

          <button
            type="submit"
            disabled={saving}
            className="lg:col-span-7 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-200 font-medium transition-all disabled:opacity-60"
          >
            <Repeat size={16} />
            {saving ? 'Saving recurring expense…' : 'Add Recurring Expense'}
          </button>
        </form>
      </div>

      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Repeat size={16} className="text-cyan-400" />
          <h3 className="font-semibold text-white">Current Rules</h3>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading recurring expenses…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-400">No recurring expenses yet. Add one above and it will start appearing each month automatically.</p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between border border-white/10 rounded-xl bg-white/5 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{rule.description}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${rule.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                      {rule.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatCurrency(rule.amount)}{rule.currency_code !== 'USD' ? ` (${formatOriginalCurrency(rule.original_amount, rule.currency_code)})` : ''} · {rule.category} · day {rule.day_of_month} · starts {parseMonthLabel(rule.start_month)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => editRecurringExpenseRule(rule.id, { active: !rule.active })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      rule.active
                        ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                        : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    {rule.active ? <Pause size={14} /> : <Play size={14} />}
                    {rule.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => removeRecurringExpenseRule(rule.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-all"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
