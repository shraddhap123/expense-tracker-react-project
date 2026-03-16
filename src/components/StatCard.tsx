import { LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'indigo' | 'rose';
  trend?: 'up' | 'down' | 'neutral';
}

const COLOR_MAP = {
  blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
  green: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
  purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400',
  orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400',
  red: 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-400',
  indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400',
  rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-400',
};

const ICON_BG = {
  blue: 'bg-blue-500/20 text-blue-400',
  green: 'bg-emerald-500/20 text-emerald-400',
  purple: 'bg-purple-500/20 text-purple-400',
  orange: 'bg-orange-500/20 text-orange-400',
  red: 'bg-red-500/20 text-red-400',
  indigo: 'bg-indigo-500/20 text-indigo-400',
  rose: 'bg-rose-500/20 text-rose-400',
};

export default function StatCard({ label, value, sub, icon: Icon, color }: Props) {
  return (
    <div className={cn('relative rounded-2xl border bg-gradient-to-br p-5 overflow-hidden', COLOR_MAP[color])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={cn('p-3 rounded-xl', ICON_BG[color])}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
