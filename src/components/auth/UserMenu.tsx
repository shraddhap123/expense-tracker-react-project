import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, Settings } from 'lucide-react';

export default function UserMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
        <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-white hidden sm:block">{user.displayName}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-surface)] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-sm font-medium text-white">{user.displayName}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <div className="py-1">
              <button onClick={() => { onOpenSettings(); setOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white">
                <Settings size={16} /> Profile Settings
              </button>
              <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-red-400">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
