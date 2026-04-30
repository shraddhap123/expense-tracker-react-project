import { useState } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Brain, CircleDollarSign,
  LoaderCircle, ShieldCheck, Sparkles, TrendingUp,
} from 'lucide-react';
import { formatCurrency, parseMonthLabel } from '../db/database';
import { runAffordabilityCheck, useMonthlyAnalysis } from '../hooks/useDB';
import { showToast } from './Toast';

interface Props {
  month: string;
}

function Pill({ tone, children }: { tone: 'green' | 'yellow' | 'red' | 'cyan' | 'gray'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    yellow: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    red: 'bg-red-500/15 text-red-300 border-red-500/25',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
    gray: 'bg-white/5 text-gray-300 border-white/10',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function deltaTone(value: number) {
  if (value > 0) return 'text-amber-300';
  if (value < 0) return 'text-emerald-300';
  return 'text-gray-300';
}

export default function SpendingInsights({ month }: Props) {
  const { analysis, loading } = useMonthlyAnalysis(month);
  const [plannedPurchase, setPlannedPurchase] = useState('');
  const [plannedLabel, setPlannedLabel] = useState('');
  const [checking, setChecking] = useState(false);
  const [affordability, setAffordability] = useState<Awaited<ReturnType<typeof runAffordabilityCheck>> | null>(null);

  const handleAffordabilityCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(plannedPurchase);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast({ type: 'error', title: 'Enter an amount', body: 'Use a number greater than zero for the affordability check.' });
      return;
    }

    setChecking(true);
    try {
      const result = await runAffordabilityCheck({
        month,
        amount,
        label: plannedLabel,
      });
      setAffordability(result);
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not run check',
        body: err instanceof Error ? err.message : 'Please try again in a moment.',
      });
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <LoaderCircle size={16} className="animate-spin text-cyan-400" />
          Building your money coach for {parseMonthLabel(month)}...
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle size={16} />
          Could not load your money coach right now.
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Brain size={16} className="text-cyan-400" />
            <h3 className="text-sm font-semibold text-gray-100">Money Coach</h3>
          </div>
          <p className="text-sm text-white leading-relaxed">{analysis.whyDifferent.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone="cyan">
            <Sparkles size={11} />
            Private to your account
          </Pill>
          {analysis.monthlyMemo.llmModel && (
            <Pill tone="gray">
              <Brain size={11} />
              AI memo enabled
            </Pill>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Why was this month different?</div>
          <p className={`text-xl font-semibold ${deltaTone(analysis.whyDifferent.deltaFromPrevious)}`}>
            {analysis.whyDifferent.deltaFromPrevious >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(analysis.whyDifferent.deltaFromPrevious))}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            vs {analysis.previousMonthLabel}
            {analysis.whyDifferent.deltaFromPreviousPercent !== null && ` • ${Math.abs(analysis.whyDifferent.deltaFromPreviousPercent).toFixed(0)}%`}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            3-month average: {formatCurrency(analysis.totals.trailingAverageSpent)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Projected month-end pace</div>
          <p className="text-xl font-semibold text-white">{formatCurrency(analysis.totals.projectedMonthEndSpend)}</p>
          <p className="text-xs text-gray-400 mt-1">
            Budget room left: {formatCurrency(Math.max(analysis.totals.remainingBudget, 0))}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Budget target: {formatCurrency(analysis.totals.budget)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-medium text-gray-400 mb-2">Lifestyle drift</div>
          <p className="text-xl font-semibold text-white">
            {analysis.lifestyleDrift.categories[0]?.category ?? 'Stable'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{analysis.lifestyleDrift.summary}</p>
          <p className="text-xs text-gray-500 mt-2">
            Tracking patterns across your recent months
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#111521] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-purple-400" />
            <h4 className="text-sm font-semibold text-white">Category drivers</h4>
          </div>
          <div className="space-y-3">
            {analysis.whyDifferent.biggestDrivers.length > 0 ? analysis.whyDifferent.biggestDrivers.map((driver) => (
              <div key={driver.category} className="rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{driver.category}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(driver.current)} this month • {driver.shareOfCurrent.toFixed(0)}% of misc spend
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${deltaTone(driver.deltaFromPrevious)}`}>
                    {driver.deltaFromPrevious >= 0 ? '+' : '-'}{formatCurrency(Math.abs(driver.deltaFromPrevious))}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  vs last month {formatCurrency(driver.previous)} • vs 3-month avg {formatCurrency(driver.average)}
                </p>
              </div>
            )) : (
              <p className="text-sm text-gray-400">Log a bit more spending and the coach will start ranking what moved the month.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111521] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <h4 className="text-sm font-semibold text-white">Outliers and recurring increases</h4>
          </div>
          <div className="space-y-3">
            {analysis.whyDifferent.unusualPurchases.map((purchase) => (
              <div key={purchase.id} className="rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{purchase.description}</p>
                    <p className="text-xs text-gray-400">{purchase.category} • {purchase.date}</p>
                  </div>
                  <span className="text-xs font-medium text-amber-300">{formatCurrency(purchase.amount)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{purchase.reason}</p>
              </div>
            ))}

            {analysis.whyDifferent.recurringCostIncreases.map((entry) => (
              <div key={`${entry.description}-${entry.currentAmount}`} className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{entry.description}</p>
                    <p className="text-xs text-gray-400">Seen across {entry.monthsSeen} months</p>
                  </div>
                  <span className="text-xs font-medium text-cyan-300">
                    +{formatCurrency(entry.increaseAmount)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Now averaging {formatCurrency(entry.currentAmount)} vs {formatCurrency(entry.previousAverage)} before
                </p>
              </div>
            ))}

            {analysis.whyDifferent.unusualPurchases.length === 0 && analysis.whyDifferent.recurringCostIncreases.length === 0 && (
              <p className="text-sm text-gray-400">Nothing dramatic popped up here. This month looks relatively normal.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
        <div className="rounded-xl border border-white/10 bg-[#111521] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={14} className="text-emerald-400" />
            <h4 className="text-sm font-semibold text-white">Can I afford this?</h4>
          </div>

          <form onSubmit={handleAffordabilityCheck} className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_auto] gap-3">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={plannedPurchase}
              onChange={(e) => setPlannedPurchase(e.target.value)}
              placeholder="900"
              className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              value={plannedLabel}
              onChange={(e) => setPlannedLabel(e.target.value)}
              placeholder="Trip, laptop, concert..."
              className="bg-[#0f1117] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={checking}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 font-medium transition-all disabled:opacity-60"
            >
              {checking ? 'Checking...' : 'Check'}
            </button>
          </form>

          {affordability ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{affordability.explanation}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    After this purchase, projected month-end spend is {formatCurrency(affordability.projectedAfterPurchase)}.
                  </p>
                </div>
                <Pill tone={affordability.status}>
                  {affordability.status === 'green' && <ShieldCheck size={11} />}
                  {affordability.status === 'yellow' && <AlertTriangle size={11} />}
                  {affordability.status === 'red' && <AlertTriangle size={11} />}
                  {affordability.status.toUpperCase()}
                </Pill>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-[#0f1117] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Remaining before purchase</p>
                  <p className="text-sm font-semibold text-white">{formatCurrency(affordability.remainingBudget)}</p>
                </div>
                <div className="rounded-lg bg-[#0f1117] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Safety buffer</p>
                  <p className="text-sm font-semibold text-white">{formatCurrency(affordability.safetyBuffer)}</p>
                </div>
                <div className="rounded-lg bg-[#0f1117] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Still-expected recurring</p>
                  <p className="text-sm font-semibold text-white">{formatCurrency(affordability.recurringGap)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {affordability.reasons.map((reason) => (
                  <div key={reason} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-500" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Try a planned purchase amount and the coach will grade it green, yellow, or red using your budget, recurring commitments, and recent pace.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111521] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowUpRight size={14} className="text-purple-400" />
            <h4 className="text-sm font-semibold text-white">Lifestyle drift detector</h4>
          </div>
          <p className="text-sm text-gray-300">{analysis.lifestyleDrift.summary}</p>
          <div className="space-y-3">
            {analysis.lifestyleDrift.categories.length > 0 ? analysis.lifestyleDrift.categories.map((category) => (
              <div key={category.category} className="rounded-lg bg-white/5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{category.category}</p>
                    <p className="text-xs text-gray-400">
                      Recent avg {formatCurrency(category.recentAverage)} • older baseline {formatCurrency(category.baselineAverage)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Pill tone={category.status === 'up' ? 'yellow' : category.status === 'down' ? 'green' : 'gray'}>
                      {category.status === 'up' ? <ArrowUpRight size={11} /> : category.status === 'down' ? <ArrowDownRight size={11} /> : <Sparkles size={11} />}
                      {category.status}
                    </Pill>
                    <Pill tone="gray">{category.trend}</Pill>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {category.changePercent === null
                    ? 'This is newly appearing in your recent months.'
                    : `${category.changePercent >= 0 ? '+' : ''}${category.changePercent.toFixed(0)}% versus your earlier baseline.`}
                </p>
              </div>
            )) : (
              <p className="text-sm text-gray-400">No strong drift yet. Your category mix is pretty even over time.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111521] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-cyan-400" />
          <h4 className="text-sm font-semibold text-white">Monthly money memo</h4>
        </div>

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <p className="text-base font-semibold text-white">{analysis.monthlyMemo.headline}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">What changed</p>
            <p className="text-sm text-gray-200">{analysis.monthlyMemo.whatChanged}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">What was good</p>
            <p className="text-sm text-gray-200">{analysis.monthlyMemo.whatWentWell}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">What to watch</p>
            <p className="text-sm text-gray-200">{analysis.monthlyMemo.watchNext}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Suggested action</p>
            <p className="text-sm text-gray-200">{analysis.monthlyMemo.suggestedAction}</p>
          </div>
        </div>

        {analysis.monthlyMemo.llmNarrative && (
          <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-cyan-200">AI-written memo</p>
              {analysis.monthlyMemo.llmModel && <Pill tone="cyan">{analysis.monthlyMemo.llmModel}</Pill>}
            </div>
            <p className="text-sm whitespace-pre-line text-gray-200 leading-relaxed">
              {analysis.monthlyMemo.llmNarrative}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
