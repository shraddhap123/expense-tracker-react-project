import { useEffect, useState } from 'react';
import { ArrowLeft, LockKeyhole } from 'lucide-react';

interface Props {
  initialToken?: string;
  onSubmit: (token: string, newPassword: string) => Promise<void>;
  onSwitchToLogin: () => void;
  onSwitchToForgot: () => void;
}

export default function ResetPasswordForm({ initialToken = '', onSubmit, onSwitchToLogin, onSwitchToForgot }: Props) {
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    setLocalError('');
    setSubmitting(true);
    try {
      await onSubmit(token, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-8">
      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Choose a new password</h1>
      <p className="text-gray-400 text-center mb-6">Use the reset link from your email, or paste the token below and set a fresh password for your account.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Reset Token</label>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            rows={3}
            className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            placeholder="Paste your reset token"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="••••••••"
          />
        </div>
        {localError && <p className="text-sm text-red-400">{localError}</p>}
        <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-white font-medium">
          <LockKeyhole size={18} />
          {submitting ? 'Resetting password…' : 'Reset Password'}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2">
        <button onClick={onSwitchToForgot} className="w-full text-sm text-gray-400 hover:text-white">
          Need a new reset token?
        </button>
        <button onClick={onSwitchToLogin} className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={14} />
          Back to sign in
        </button>
      </div>
    </div>
  );
}
