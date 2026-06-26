import { useState, useEffect } from 'react';
import { Target, Save, Info, AlertTriangle } from 'lucide-react';
import { saveMonthConfig, useMonthSummary } from '../hooks/useDB';
import { INVESTMENT_FIXED, formatCurrency, parseMonthLabel } from '../db/database';

interface Props { month: string; }

export default function BudgetSetup({ month }: Props) {
  const { config } = useMonthSummary(month);
  const [miscBudget,    setMiscBudget]    = useState('');
  const [investAmount,  setInvestAmount]  = useState(String(INVESTMENT_FIXED));
  const [saved,         setSaved]         = useState(false);

  useEffect(() => {
    if (config) {
      setMiscBudget(String(config.misc_budget));
      if (config.invest_amount) setInvestAmount(String(config.invest_amount));
    }
  }, [config]);

  const invest     = parseFloat(investAmount) || 0;
  const misc       = parseFloat(miscBudget)   || 0;
  const totalBudget = misc + invest;

  const handleSave = async () => {
    if (misc < 0 || invest < 0) return;
    await saveMonthConfig(month, misc, invest);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Target size={18} className="text-purple-400" />
        <h3 className="font-semibold text-white">Budget Setup – {parseMonthLabel(month)}</h3>
      </div>

      <div className="space-y-4">
        {/* Investment amount — editable */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">📈 Monthly Investment</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
            <input
              type="number"
              min={0}
              value={investAmount}
              onChange={(e) => setInvestAmount(e.target.value)}
              placeholder="e.g. 2500"
              className="w-full bg-[var(--bg-primary)] border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Auto-deducted from your monthly budget</p>
        </div>

        {/* Misc Budget */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">💰 Misc / Living Budget</label>
          <div className="relative">
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
        </div>

        {/* Total */}
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/10">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-gray-400" />
            <span className="text-sm text-gray-300">Total Monthly Budget</span>
          </div>
          <span className="text-lg font-bold text-white">{formatCurrency(totalBudget)}</span>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            saved ? 'bg-emerald-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'
          }`}
        >
          <Save size={14} />
          {saved ? '✓ Saved!' : 'Save Budget'}
        </button>

        {/* India warning — clearly visible */}
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 border"
          style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.35)' }}>
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300 leading-relaxed">
            <span className="font-semibold">India remittances are not counted in your budget</span> — they are tracked separately under Transfers and do not affect your remaining budget.
          </p>
        </div>
      </div>
    </div>
  );
}
