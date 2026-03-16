import { useYearlySummary } from '../hooks/useDB';
import { type Expense, type Remittance, type Investment } from '../api/client';
import { formatCurrency } from '../db/database';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

interface Props { year: number; }

export default function YearlyTrends({ year }: Props) {
  const { expenses, remittances, investments } = useYearlySummary(year);

  const months: Record<string, { month: string; expenses: number; india: number; investment: number; total: number }> = {};
  for (let m = 1; m <= 12; m++) {
    const key   = `${year}-${String(m).padStart(2, '0')}`;
    const label = new Date(year, m - 1, 1).toLocaleString('default', { month: 'short' });
    months[key] = { month: label, expenses: 0, india: 0, investment: 0, total: 0 };
  }

  expenses.forEach((e: Expense) => {
    if (months[e.month]) { months[e.month].expenses += e.amount; months[e.month].total += e.amount; }
  });
  remittances.forEach((r: Remittance) => {
    if (months[r.month]) { months[r.month].india += r.amount; months[r.month].total += r.amount; }
  });
  investments.forEach((i: Investment) => {
    if (months[i.month]) { months[i.month].investment += i.amount; months[i.month].total += i.amount; }
  });

  const data = Object.values(months);

  const totalExpenses = expenses.reduce((s: number, e: Expense) => s + e.amount, 0);
  const totalIndia    = remittances.reduce((s: number, r: Remittance) => s + r.amount, 0);
  const totalInvested = investments.reduce((s: number, i: Investment) => s + i.amount, 0);
  const grandTotal    = totalExpenses + totalIndia + totalInvested;

  const byCat: Record<string, number> = {};
  expenses.forEach((e: Expense) => { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; });

  const byDow: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dowKeys = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  expenses.forEach((e: Expense) => {
    const dow = dowKeys[new Date(e.date).getDay()];
    byDow[dow] = (byDow[dow] ?? 0) + e.amount;
  });
  const dowData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => ({ day: d, amount: byDow[d] }));

  const fmt = (v: unknown) => formatCurrency(Number(v));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Outflow',      value: grandTotal,    color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
          { label: '💸 Misc Expenses',   value: totalExpenses, color: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
          { label: '🇮🇳 Sent to India', value: totalIndia,    color: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
          { label: '📈 Invested',        value: totalInvested, color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold text-white">{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <TrendingUp size={15} className="text-purple-400" />
          Monthly Breakdown – {year}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip formatter={fmt} contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="expenses"   name="Misc"       stackId="a" fill="#f97316" />
            <Bar dataKey="india"      name="India"      stackId="a" fill="#f59e0b" />
            <Bar dataKey="investment" name="Investment" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Spending Trend – {year}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip formatter={fmt} contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="total"    name="Total" stroke="#a855f7" strokeWidth={2}   dot={false} />
            <Line type="monotone" dataKey="expenses" name="Misc"  stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Category Breakdown – {year}</h3>
          {Object.keys(byCat).length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No expense data</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byCat).sort(([, a], [, b]) => b - a).map(([cat, amt]) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300">{cat}</span>
                      <span className="text-white">{formatCurrency(amt)} <span className="text-gray-500">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Spending by Day of Week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dowData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day"    tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip formatter={fmt} contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
