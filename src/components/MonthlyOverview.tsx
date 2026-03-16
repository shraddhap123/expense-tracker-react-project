import { TrendingUp, TrendingDown, DollarSign, Send, BarChart2 } from 'lucide-react';
import { useMonthSummary } from '../hooks/useDB';
import { formatCurrency, CATEGORY_COLORS, CATEGORY_EMOJI, parseMonthLabel } from '../db/database';
import StatCard from './StatCard';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

interface Props {
  month: string;
}

export default function MonthlyOverview({ month }: Props) {
  const {
    expenses, remittances, investments,
    totalExpenses, totalRemittances, totalInvested,
    miscBudget, monthlyBudget, totalSpent, remaining, byCategory,
  } = useMonthSummary(month);

  const overBudget = remaining < 0;

  // Pie chart data — budget items only (misc + investment). India shown separately.
  const pieData = [
    ...Object.entries(byCategory).map(([cat, val]) => ({ name: cat, value: val, color: CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#64748b' })),
    ...(totalInvested > 0 ? [{ name: '📈 Investment', value: totalInvested, color: '#6366f1' }] : []),
  ].filter((d) => d.value > 0);

  // Daily bar chart — budget items only (misc expenses + investments), NOT India remittances
  const dailyMap: Record<string, number> = {};
  [...expenses, ...investments].forEach((e) => {
    const day = e.date.split('-')[2];
    dailyMap[day] = (dailyMap[day] ?? 0) + e.amount;
  });
  const dailyData = Object.entries(dailyMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, amt]) => ({ day: `${parseInt(day)}`, amount: amt }));

  // Budget progress — only misc + investment vs monthlyBudget
  const budgetPct = monthlyBudget > 0 ? Math.min((totalSpent / monthlyBudget) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {/* Stats — India remittances are intentionally NOT part of the budget */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Budget Used"
          value={formatCurrency(totalSpent)}
          sub={`of ${formatCurrency(monthlyBudget)} budget`}
          icon={DollarSign}
          color={overBudget ? 'red' : 'blue'}
        />
        <StatCard
          label="Misc Expenses"
          value={formatCurrency(totalExpenses)}
          sub={`Budget: ${formatCurrency(miscBudget)}`}
          icon={BarChart2}
          color="orange"
        />
        <StatCard
          label="Sent to India"
          value={formatCurrency(totalRemittances)}
          sub={`${remittances.length} transfer${remittances.length !== 1 ? 's' : ''} · not in budget`}
          icon={Send}
          color="rose"
        />
        <StatCard
          label={overBudget ? 'Over Budget' : 'Remaining'}
          value={formatCurrency(Math.abs(remaining))}
          sub={overBudget ? '⚠️ Exceeded budget' : '✅ On track'}
          icon={overBudget ? TrendingDown : TrendingUp}
          color={overBudget ? 'red' : 'green'}
        />
      </div>

      {/* Budget Progress Bar */}
      {monthlyBudget > 0 && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-300">Monthly Budget Usage</span>
            <span className={`text-sm font-semibold ${overBudget ? 'text-red-400' : 'text-emerald-400'}`}>
              {budgetPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-orange-500' : 'bg-emerald-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>$0</span>
            <span>Misc {formatCurrency(miscBudget)}</span>
            <span>Total {formatCurrency(monthlyBudget)}</span>
          </div>

          {/* Sub-bars — only budget items (misc + investment). India is tracked separately. */}
          <div className="mt-4 space-y-2">
            {[
              { label: '💸 Misc Expenses', amount: totalExpenses, budget: miscBudget, color: 'bg-orange-500' },
              { label: '📈 Investments (Fixed)', amount: totalInvested, budget: 2500, color: 'bg-indigo-500' },
            ].map(({ label, amount, budget, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{label}</span>
                  <span>{formatCurrency(amount)}{budget > 0 ? ` / ${formatCurrency(budget)}` : ''}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: budget > 0 ? `${Math.min((amount / budget) * 100, 100)}%` : '100%', opacity: amount > 0 ? 1 : 0 }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* India remittances — shown as info only, NOT against budget */}
          {totalRemittances > 0 && (
            <div className="mt-3 flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              <span className="text-xs text-amber-300">🇮🇳 Sent to India this month <span className="text-gray-500">(outside budget)</span></span>
              <span className="text-xs font-semibold text-amber-400">{formatCurrency(totalRemittances)}</span>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie */}
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Spending Breakdown</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">No data yet</div>
          )}
        </div>

        {/* Daily Bar */}
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Daily Spending – {parseMonthLabel(month)}</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Category Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                const color = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#64748b';
                const emoji = CATEGORY_EMOJI[cat as keyof typeof CATEGORY_EMOJI] ?? '📦';
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-300">{emoji} {cat}</span>
                      <span className="text-white font-medium">{formatCurrency(amt)} <span className="text-gray-500 font-normal">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
