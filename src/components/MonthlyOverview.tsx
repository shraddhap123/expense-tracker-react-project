import { useState } from 'react';
import { TrendingUp, TrendingDown, Send, Target, Zap } from 'lucide-react';
import { useMonthSummary, useMonthlyAnalysis } from '../hooks/useDB';
import { useCountUp } from '../hooks/useCountUp';
import { formatCurrency, CATEGORY_COLORS, CATEGORY_EMOJI, parseMonthLabel } from '../db/database';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

interface Props { month: string }

function DonutRing({ pct, over }: { pct: number; over: boolean }) {
  const r     = 52;
  const circ  = 2 * Math.PI * r;
  const animated = useCountUp(Math.min(pct, 100), 1000);
  const dash  = (animated / 100) * circ;
  const color = over ? '#ef4444' : pct > 80 ? '#f97316' : '#a855f7';
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0">
      <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" />
      <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="11"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 65 65)"
        style={{ filter: `drop-shadow(0 0 10px ${color}70)` }}
      />
      <text x="65" y="61" textAnchor="middle" fill="white" fontSize="14" fontWeight="800">
        {Math.round(animated)}%
      </text>
      <text x="65" y="76" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9.5">of budget</text>
    </svg>
  );
}

function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value, 900);
  return <span className={className}>{formatCurrency(animated)}</span>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function CategoryBar({ cat, amt, pct, color, emoji, isHovered, onHover, index }: {
  cat: string; amt: number; pct: number; color: string; emoji: string;
  isHovered: boolean; onHover: (c: string | null) => void; index: number;
}) {
  const stagger = `stagger-${Math.min(index + 1, 10)}`;
  return (
    <div
      className={`group cursor-default rounded-xl px-4 py-3 transition-all duration-200 animate-slide-up ${stagger} ${isHovered ? 'bg-white/8' : 'hover:bg-white/5'}`}
      onMouseEnter={() => onHover(cat)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-sm font-medium text-gray-200">{cat}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-white">{formatCurrency(amt)}</span>
          <span className="text-xs text-gray-500 ml-1.5">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: isHovered ? `0 0 8px ${color}90` : 'none',
            transitionDelay: `${index * 60}ms`,
          }}
        />
      </div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
};

export default function MonthlyOverview({ month }: Props) {
  const {
    expenses, investments,
    totalExpenses, totalRemittances, totalInvested,
    miscBudget, monthlyBudget, totalSpent, remaining, byCategory,
  } = useMonthSummary(month);

  const { analysis } = useMonthlyAnalysis(month);
  const projectedSpend     = analysis?.totals?.projectedMonthEndSpend ?? null;
  const overBudget         = remaining < 0;
  const projectedOverBudget = projectedSpend !== null && monthlyBudget > 0 && projectedSpend > monthlyBudget;
  const budgetPct          = monthlyBudget > 0 ? (totalSpent / monthlyBudget) * 100 : 0;

  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const pieData = [
    ...Object.entries(byCategory).map(([cat, val]) => ({
      name: cat, value: val,
      color: CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#64748b',
    })),
    ...(totalInvested > 0 ? [{ name: 'Investment', value: totalInvested, color: '#6366f1' }] : []),
  ].filter(d => d.value > 0);

  const dailyMap: Record<string, number> = {};
  [...expenses, ...investments].forEach(e => {
    const day = e.date.split('-')[2];
    dailyMap[day] = (dailyMap[day] ?? 0) + e.amount;
  });
  const dailyData = Object.entries(dailyMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, amt]) => ({ day: `${parseInt(day)}`, amount: amt }));

  const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-5">

      {/* ── Hero Card ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 md:p-8 animate-fade-scale-in"
        style={{ background: 'linear-gradient(135deg, #1e1040 0%, #1a1535 45%, #0f0f1a 100%)' }}
      >
        <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-20 animate-float-a"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 65%)' }} />
        <div className="pointer-events-none absolute -bottom-24 -left-12 w-56 h-56 rounded-full opacity-15 animate-float-b"
          style={{ background: 'radial-gradient(circle, #4f46e5 0%, transparent 65%)' }} />
        <div className="pointer-events-none absolute top-1/2 left-1/3 w-32 h-32 rounded-full opacity-8 animate-float-a"
          style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 65%)', animationDelay: '3s' }} />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-purple-300/60 mb-1 uppercase tracking-widest animate-slide-up">
              {greeting()} · {parseMonthLabel(month)}
            </p>

            {/* Count-up hero number */}
            <AnimatedAmount
              value={totalSpent}
              className="text-5xl md:text-6xl font-black text-white tracking-tight leading-none animate-count-up stagger-1"
            />
            <p className="text-sm text-purple-200/40 mt-1.5 mb-5 animate-slide-up stagger-2">
              spent this month
            </p>

            <div className="flex flex-wrap gap-2 animate-slide-up stagger-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                overBudget
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}>
                {overBudget ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                {overBudget
                  ? <><AnimatedAmount value={Math.abs(remaining)} /> over budget</>
                  : <><AnimatedAmount value={remaining} /> remaining</>}
              </span>

              {totalRemittances > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Send size={12} /> <AnimatedAmount value={totalRemittances} /> to India
                </span>
              )}

              {totalInvested > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  <TrendingUp size={12} /> <AnimatedAmount value={totalInvested} /> invested
                </span>
              )}
            </div>
          </div>

          {monthlyBudget > 0 && (
            <div className="flex flex-col items-center gap-1 shrink-0 animate-fade-scale-in stagger-2">
              <DonutRing pct={budgetPct} over={overBudget} />
              <p className="text-[10px] text-purple-300/40 font-medium">of {formatCurrency(monthlyBudget)} budget</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Forecast pill ── */}
      {projectedSpend !== null && (
        <div className={`flex items-center justify-between rounded-2xl border px-5 py-3.5 transition-all animate-slide-up stagger-4 ${
          projectedOverBudget
            ? 'bg-red-500/8 border-red-500/25 hover:bg-red-500/12'
            : 'bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/12'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${projectedOverBudget ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
              <Target size={14} className={projectedOverBudget ? 'text-red-400' : 'text-emerald-400'} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">Projected month-end</p>
              <p className="text-xs text-gray-500">Based on recurring expenses + pace</p>
            </div>
          </div>
          <div className="text-right">
            <AnimatedAmount value={projectedSpend} className={`text-lg font-bold ${projectedOverBudget ? 'text-red-400' : 'text-emerald-400'}`} />
            {monthlyBudget > 0 && (
              <p className="text-xs text-gray-500">
                {projectedOverBudget
                  ? `${formatCurrency(projectedSpend - monthlyBudget)} over`
                  : `${formatCurrency(monthlyBudget - projectedSpend)} buffer`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5">

        {/* Left — categories */}
        <div className="bg-[var(--bg-surface)] border border-white/8 rounded-2xl overflow-hidden animate-slide-up stagger-5">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Where did it go?</h3>
            {totalExpenses > 0 && (
              <span className="text-xs text-gray-500">{formatCurrency(totalExpenses)} misc</span>
            )}
          </div>

          {sortedCategories.length > 0 ? (
            <div className="pb-3">
              {sortedCategories.map(([cat, amt], i) => {
                const pct   = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                const color = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? '#64748b';
                const emoji = CATEGORY_EMOJI[cat as keyof typeof CATEGORY_EMOJI] ?? '📦';
                return (
                  <CategoryBar
                    key={cat} cat={cat} amt={amt} pct={pct}
                    color={color} emoji={emoji} index={i}
                    isHovered={hoveredCat === cat}
                    onHover={setHoveredCat}
                  />
                );
              })}

              {monthlyBudget > 0 && (
                <div className="mx-4 mt-3 pt-3 border-t border-white/8 space-y-2.5">
                  {[
                    { label: '💸 Misc', amount: totalExpenses, budget: miscBudget, color: '#f97316' },
                    { label: '📈 Investments', amount: totalInvested, budget: 2500, color: '#6366f1' },
                  ].map(({ label, amount, budget, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{label}</span>
                        <span className="text-gray-400">{formatCurrency(amount)} / {formatCurrency(budget)}</span>
                      </div>
                      <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min((amount / budget) * 100, 100)}%`, backgroundColor: color, opacity: amount > 0 ? 1 : 0 }} />
                      </div>
                    </div>
                  ))}
                  {totalRemittances > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2 mt-1">
                      <span className="text-xs text-amber-300">🇮🇳 India <span className="text-gray-600">(outside budget)</span></span>
                      <span className="text-xs font-semibold text-amber-400">{formatCurrency(totalRemittances)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 pb-8 flex flex-col items-center justify-center text-center gap-3 pt-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">💸</div>
              <p className="text-sm text-gray-400">No expenses yet this month</p>
              <p className="text-xs text-gray-600">Add an entry to see your breakdown</p>
            </div>
          )}
        </div>

        {/* Right — charts */}
        <div className="space-y-5">
          <div className="bg-[var(--bg-surface)] border border-white/8 rounded-2xl p-5 animate-slide-up stagger-6">
            <h3 className="text-sm font-semibold text-gray-100 mb-4">Spending breakdown</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={44}
                    animationBegin={200} animationDuration={900}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color}
                        opacity={hoveredCat === null || hoveredCat === entry.name ? 1 : 0.3}
                        style={{
                          transition: 'opacity 0.2s',
                          cursor: 'pointer',
                          filter: hoveredCat === entry.name ? `drop-shadow(0 0 8px ${entry.color})` : 'none',
                        }}
                        onMouseEnter={() => setHoveredCat(entry.name)}
                        onMouseLeave={() => setHoveredCat(null)}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[190px] flex items-center justify-center text-gray-600 text-sm">No data yet</div>
            )}
          </div>

          <div className="bg-[var(--bg-surface)] border border-white/8 rounded-2xl p-5 animate-slide-up stagger-7">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-purple-400" />
              <h3 className="text-sm font-semibold text-gray-100">Daily activity</h3>
            </div>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
                  <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]}
                    animationBegin={400} animationDuration={800}
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(139,92,246,0.3))' }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-gray-600 text-sm">No data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
