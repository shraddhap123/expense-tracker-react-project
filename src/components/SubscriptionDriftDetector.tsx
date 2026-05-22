import { ArrowUpRight, Repeat, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../db/database';
import { useSubscriptionDrift } from '../hooks/useDB';

export default function SubscriptionDriftDetector() {
  const { subscriptions, loading } = useSubscriptionDrift();

  return (
    <section className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Repeat size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">Subscription Drift Detector</h3>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Checking recurring patterns...</p>
      ) : subscriptions.length === 0 ? (
        <p className="text-sm text-gray-400">
          No rising recurring charges detected yet. When the same bill slowly creeps up, it will show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((subscription) => (
            <div key={`${subscription.description}-${subscription.currentAmount}`} className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{subscription.description}</p>
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-200">
                      {subscription.monthsSeen} months
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {subscription.frequencyLabel} recurring pattern
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-cyan-200">{formatCurrency(subscription.currentAmount)}</p>
                  <p className="text-xs text-amber-300">+{formatCurrency(subscription.increaseAmount)}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-[var(--bg-primary)] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Earlier average</p>
                  <p className="text-sm text-white">{formatCurrency(subscription.previousAverage)}</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-primary)] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Increase</p>
                  <p className="text-sm text-white">{subscription.increasePercent.toFixed(0)}%</p>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 text-xs text-gray-300">
                {subscription.increasePercent >= 20 ? (
                  <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-400" />
                ) : (
                  <ArrowUpRight size={13} className="mt-0.5 shrink-0 text-cyan-400" />
                )}
                <span>{subscription.summary}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
