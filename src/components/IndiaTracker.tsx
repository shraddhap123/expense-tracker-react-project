import { Send, TrendingUp, Calendar } from 'lucide-react';
import { useLifetimeTotals } from '../hooks/useDB';
import { formatCurrency, parseMonthLabel } from '../db/database';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function IndiaTracker() {
  const { totalSentToIndia, remittances } = useLifetimeTotals();

  // Group by month for chart
  const byMonth: Record<string, number> = {};
  remittances.forEach((r) => {
    byMonth[r.month] = (byMonth[r.month] ?? 0) + r.amount;
  });

  const monthlyData = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({
      month: parseMonthLabel(month).split(' ')[0] + ' ' + month.split('-')[0],
      amount,
    }));

  // Group by year for summary pills
  const byYear: Record<number, number> = {};
  remittances.forEach((r) => {
    byYear[r.year] = (byYear[r.year] ?? 0) + r.amount;
  });

  const count = remittances.length;
  const avg = count > 0 ? totalSentToIndia / count : 0;

  // Pre-compute running totals — sort ascending, compute cumulative, then reverse for newest-first display
  const sorted = [...remittances].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const rowsWithRunning = sorted.map((row) => {
    running += row.amount;
    return { row, running };
  });
  const tableRows = [...rowsWithRunning].reverse();

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-yellow-500/20 border border-orange-500/30 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🇮🇳</span>
              <h2 className="text-lg font-bold text-white">Total Sent to India</h2>
            </div>
            <p className="text-4xl font-black text-orange-400 mt-2">{formatCurrency(totalSentToIndia)}</p>
            <p className="text-sm text-gray-400 mt-1">
              Across {count} transfer{count !== 1 ? 's' : ''} · Avg {formatCurrency(avg)} per transfer
            </p>
          </div>
          <div className="bg-orange-500/20 p-4 rounded-2xl">
            <Send size={28} className="text-orange-400" />
          </div>
        </div>

        {/* Year totals */}
        {Object.keys(byYear).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(byYear)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([year, amt]) => (
                <div key={year} className="bg-white/10 rounded-xl px-4 py-2">
                  <p className="text-xs text-gray-400">{year}</p>
                  <p className="text-sm font-bold text-white">{formatCurrency(amt)}</p>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Monthly Chart */}
      {monthlyData.length > 0 && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-orange-400" />
            Monthly Remittances
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip
                formatter={(v: unknown) => formatCurrency(Number(v))}
                contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
              />
              <Bar dataKey="amount" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* All Transfers Table */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-300">All Transfers</h3>
        </div>

        {remittances.length === 0 ? (
          <p className="p-6 text-center text-gray-500 text-sm">No remittances recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-white/10">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Note</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-right px-4 py-3">Running Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableRows.map(({ row, running: rt }) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-400">{row.date}</td>
                    <td className="px-4 py-3 text-gray-200">{row.note || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-400">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {formatCurrency(rt)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/5">
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-300">Total</td>
                  <td colSpan={2} className="px-4 py-3 text-right text-lg font-bold text-orange-400">
                    {formatCurrency(totalSentToIndia)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
