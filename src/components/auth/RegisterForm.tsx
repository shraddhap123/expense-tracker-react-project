import { useState } from 'react';
import { UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';

export default function RegisterForm({
  onRegister,
  onSwitchToLogin,
}: {
  onRegister: (email: string, password: string, displayName: string) => Promise<void>;
  onSwitchToLogin: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  const passwordRules = [
    { label: 'At least 8 characters',       pass: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)',   pass: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)',   pass: /[a-z]/.test(password) },
    { label: 'One number (0-9)',             pass: /[0-9]/.test(password) },
    { label: 'One special character (!@#$)', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordValid = passwordRules.every(r => r.pass);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setError('Please make sure your password meets all the requirements below.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRegister(email, password, displayName);
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (msg.toLowerCase().includes('already')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-8">
      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Create account</h1>
      <p className="text-gray-400 text-center mb-6">Start managing your expenses</p>

      {success ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-emerald-400" />
          </div>
          <p className="text-lg font-semibold text-white">Account created!</p>
          <p className="text-sm text-gray-400 text-center">You're being signed in now…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required
              className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="••••••••" />
            {/* Password strength checklist */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                {passwordRules.map(rule => (
                  <div key={rule.label} className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      rule.pass ? 'bg-emerald-500' : 'bg-white/10'
                    }`}>
                      {rule.pass && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-xs transition-colors ${rule.pass ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {password.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">Min 8 chars, uppercase, number & special character</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3">
              <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300">{error}</p>
                {error.includes('already exists') && (
                  <button type="button" onClick={onSwitchToLogin}
                    className="mt-1.5 text-sm font-semibold text-purple-400 hover:text-purple-300 underline">
                    Sign in instead →
                  </button>
                )}
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-white font-medium transition-all">
            <UserPlus size={18} />
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-gray-400 text-sm">
        Already have an account?{' '}
        <button onClick={onSwitchToLogin} className="text-purple-400 hover:text-purple-300 font-medium">Sign in</button>
      </p>
    </div>
  );
}
