import { useState } from 'react';
import { LogIn } from 'lucide-react';

export default function LoginForm({
  onLogin,
  onSwitchToRegister,
  onSwitchToForgotPassword,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (msg.toLowerCase().includes('invalid credentials')) {
        setError('Wrong email or password. Please try again.');
      } else if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no account')) {
        setError('No account found with this email. Please create one first.');
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setError('Connection error. Please check your internet and try again.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-8">
      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Welcome back</h1>
      <p className="text-gray-400 text-center mb-6">Sign in to continue to ExpenseIQ</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="••••••••" />
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onSwitchToForgotPassword} className="text-sm text-purple-400 hover:text-purple-300">
            Forgot password?
          </button>
        </div>
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3">
            <p className="text-sm text-red-300">{error}</p>
            {error.includes('create one') && (
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="mt-2 text-sm font-semibold text-purple-400 hover:text-purple-300 underline"
              >
                Create an account →
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-white font-medium">
          <LogIn size={18} />{submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      <p className="mt-6 text-center text-gray-400 text-sm">
        Don't have an account? <button onClick={onSwitchToRegister} className="text-purple-400 hover:text-purple-300 font-medium">Create one</button>
      </p>
    </div>
  );
}
