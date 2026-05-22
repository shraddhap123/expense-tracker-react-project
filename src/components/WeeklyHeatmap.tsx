import { useMemo } from 'react';
import { type Expense } from '../api/client';
import { formatCurrency, parseMonthLabel } from '../db/database';

interface Props {
  expenses: Expense[];
  month: string; // YYYY-MM
}

function getIntensityClass(amount: number, max: number): string {
  if (amount === 0) return 'bg-white/5';
  const pct = amount / max;
  if (pct < 0.2) return 'bg-purple-500/20';
  if (pct < 0.4) return 'bg-purple-500/40';
  if (pct < 0.6) return 'bg-purple-500/60';
  if (pct < 0.8) return 'bg-purple-500/80';
  return 'bg-purple-500';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeeklyHeatmap({ expenses, month }: Props) {
  const { calendarDays, maxAmount, dailyTotals } = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startOffset = firstDay.getDay(); // 0=Sun

    // Build daily totals
    const totals: Record<number, number> = {};
    for (let d = 1; d <= daysInMonth; d++) totals[d] = 0;
    expenses.forEach((e) => {
      const day = parseInt(e.date.split('-')[2], 10);
      totals[day] = (totals[day] ?? 0) + e.amount;
    });

    const max = Math.max(...Object.values(totals), 1);

    // Build calendar grid — leading empty cells + day cells
    const cells: Array<{ day: number | null; amount: number }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ day: null, amount: 0 });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, amount: totals[d] });
    // Pad to full weeks
    while (cells.length % 7 !== 0) cells.push({ day: null, amount: 0 });

    return { calendarDays: cells, maxAmount: max, dailyTotals: totals };
  }, [expenses, month]);

  const totalSpend = Object.values(dailyTotals).reduce((s, v) => s + v, 0);
  const activeDays = Object.values(dailyTotals).filter(v => v > 0).length;

  return (
    <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Daily Spending Heatmap — {parseMonthLabel(month)}</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{activeDays} active days</span>
          <span className="text-gray-300 font-medium">{formatCurrency(totalSpend)}</span>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-[10px] text-gray-500 text-center font-medium">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((cell, i) => (
          <div
            key={i}
            title={cell.day ? (cell.amount > 0 ? `Day ${cell.day}: ${formatCurrency(cell.amount)}` : `Day ${cell.day}: No spend`) : ''}
            className={`aspect-square rounded-md text-[10px] flex items-center justify-center font-medium transition-colors ${
              cell.day
                ? `${getIntensityClass(cell.amount, maxAmount)} cursor-default ${cell.amount > 0 ? 'text-white' : 'text-gray-600'}`
                : 'bg-transparent'
            }`}
          >
            {cell.day ?? ''}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-[10px] text-gray-500">Less</span>
        {['bg-white/5', 'bg-purple-500/20', 'bg-purple-500/40', 'bg-purple-500/60', 'bg-purple-500'].map((cls, i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span className="text-[10px] text-gray-500">More</span>
      </div>
    </div>
  );
}
