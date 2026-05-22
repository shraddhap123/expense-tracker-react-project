import { useState, useEffect } from 'react';
import { Target, Save, Info } from 'lucide-react';
import { saveMonthConfig, useMonthSummary } from '../hooks/useDB';
import { INVESTMENT_FIXED, formatCurrency, parseMonthLabel } from '../db/database';

interface Props { month: string; }

export default function BudgetSetup({ month }: Props) {
  // useMonthSummary already fetches the config — reuse it
  const { config } = useMonthSummary(month);
  const [miscBudget, setMiscBudget] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setMiscBudget(String(config.misc_budget));
  }, [config]);

  const totalBudget = (parseFloat(miscBudget) || 0) + INVESTMENT_FIXED;

  const handleSave = async () => {
    const val = parseFloat(miscBudget);
    if (isNaN(val) || val < 0) return;
    await saveMonthConfig(month, val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={18} className="text-purple-400" />
        <h3 className="font-semibold text-white">Budget Setup – {parseMonthLabel(month)}</h3>
      </div>

      <div className="space-y-4">
        {/* Investment – Fixed */}
        <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-indigo-300">📈 Investment (Fixed)</p>
            <p className="text-xs text-gray-400 mt-0.5">Auto-deducted every month</p>
          </div>
          <span className="text-lg font-bold text-indigo-400">{formatCurrency(INVESTMENT_FIXED)}</span>
        </div>

        {/* Misc Budget Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">💰 Misc / Living Budget</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number"
                min={0}
                value={miscBudget}
                onChange={(e) => setMiscBudget(e.target.value)}
                placeholder="e.g. 3000"
                className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                saved ? 'bg-emerald-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              <Save size={14} />
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>

        {/* Total Budget */}
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/10">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-gray-400" />
            <span className="text-sm text-gray-300">Total Monthly Budget</span>
          </div>
          <span className="text-lg font-bold text-white">{formatCurrency(totalBudget)}</span>
        </div>

        {/* India note */}
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-sm mt-0.5">⚠</span>
          <p className="text-xs text-amber-200 leading-relaxed">
            <span className="font-semibold">India remittances are NOT counted in your monthly budget</span> — they are tracked separately in the India Tracker tab and do not affect your budget remaining.
          </p>
        </div>
      </div>
    </div>
  );
}
