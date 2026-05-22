import { useState } from 'react';
import { ArrowLeft, Mail, KeyRound } from 'lucide-react';

interface Props {
  onSubmit: (email: string) => Promise<{ previewToken?: string; expiresAt?: string; resetUrl?: string } | void>;
  onSwitchToLogin: () => void;
  onSwitchToReset: (token?: string) => void;
}

export default function ForgotPasswordForm({ onSubmit, onSwitchToLogin, onSwitchToReset }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewToken, setPreviewToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await onSubmit(email);
      setPreviewToken(result?.previewToken ?? '');
      setExpiresAt(result?.expiresAt ?? '');
      setResetUrl(result?.resetUrl ?? '');
      setSuccessMessage(result?.previewToken
        ? 'This dev build generated a reset token below.'
        : 'If that email exists, a reset link has been sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[var(--bg-surface)] border border-white/10 rounded-2xl p-8">
      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Reset password</h1>
      <p className="text-gray-400 text-center mb-6">Enter your email and we&apos;ll start a password reset.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="you@example.com"
          />
        </div>
        <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 rounded-lg text-white font-medium">
          <Mail size={18} />
          {submitting ? 'Preparing reset…' : 'Send Reset Link'}
        </button>
      </form>

      {successMessage && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-200">{successMessage}</p>
        </div>
      )}

      {previewToken && (
        <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-medium">
            <KeyRound size={14} />
            Reset token ready
          </div>
          <div className="rounded-lg bg-[var(--bg-primary)] border border-white/10 px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">Use this reset token</p>
            <p className="text-xs text-white font-mono break-all">{previewToken}</p>
          </div>
          {resetUrl && (
            <div className="rounded-lg bg-[var(--bg-primary)] border border-white/10 px-3 py-2">
              <p className="text-xs text-gray-500 mb-1">Preview reset link</p>
              <p className="text-xs text-white break-all">{resetUrl}</p>
            </div>
          )}
          {expiresAt && <p className="text-xs text-gray-400">Expires at {new Date(expiresAt).toLocaleString()}</p>}
          <button
            onClick={() => onSwitchToReset(previewToken)}
            className="w-full px-4 py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-200 text-sm font-medium transition-all"
          >
            Continue to Reset Password
          </button>
        </div>
      )}

      <button onClick={onSwitchToLogin} className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={14} />
        Back to sign in
      </button>
    </div>
  );
}
