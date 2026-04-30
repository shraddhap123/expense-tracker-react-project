import { useState } from 'react';
import { UserPlus } from 'lucide-react';

export default function RegisterForm({ onRegister, onSwitchToLogin }: { onRegister: (email: string, password: string, displayName: string) => Promise<void>; onSwitchToLogin: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try { await onRegister(email, password, displayName); } finally { setSubmitting(false); }
  };

  return (
    <div className="w-full max-w-md bg-[#1a1f2e] border border-white/10 rounded-2xl p-8">
      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Create account</h1>
      <p className="text-gray-400 text-center mb-6">Start managing your expenses</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="w-full px-4 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="John Doe" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-4 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="••••••••" />
          <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
        </div>
        <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-white font-medium">
          <UserPlus size={18} />{submitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      <p className="mt-6 text-center text-gray-400 text-sm">
        Already have an account? <button onClick={onSwitchToLogin} className="text-purple-400 hover:text-purple-300 font-medium">Sign in</button>
      </p>
    </div>
  );
}
