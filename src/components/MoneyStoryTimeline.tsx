import { CalendarRange, Landmark, PiggyBank, Repeat, Sparkles, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../db/database';
import { useMoneyStoryTimeline } from '../hooks/useDB';

interface Props {
  limit?: number;
}

const icons = {
  start: CalendarRange,
  spike: TrendingUp,
  savings: PiggyBank,
  recurring: Repeat,
  transfer: Landmark,
  milestone: Sparkles,
} as const;

const tones = {
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  rose: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
  gray: 'bg-white/5 border-white/10 text-gray-300',
} as const;

export default function MoneyStoryTimeline({ limit = 8 }: Props) {
  const { events, loading } = useMoneyStoryTimeline();

  return (
    <section className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Money Story Timeline</h3>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Building your timeline...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400">
          Once you log a few months of activity, this feed will turn your history into a story instead of a spreadsheet.
        </p>
      ) : (
        <div className="space-y-3">
          {events.slice(0, limit).map((event) => {
            const Icon = icons[event.icon as keyof typeof icons] ?? Sparkles;
            const tone = tones[event.tone as keyof typeof tones] ?? tones.gray;
            return (
              <div key={`${event.type}-${event.month}-${event.title}`} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{event.title}</p>
                    <span className="text-[11px] text-gray-500">{event.monthLabel}</span>
                    {typeof event.amount === 'number' && (
                      <span className="text-[11px] font-medium text-gray-300">{formatCurrency(event.amount)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-300 leading-relaxed">{event.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

