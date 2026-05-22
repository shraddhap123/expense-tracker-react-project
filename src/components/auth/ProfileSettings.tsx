import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { showToast } from '../Toast';
import { X, KeyRound, UserRound } from 'lucide-react';
import { SUPPORTED_CURRENCIES, normalizeCurrencyCode } from '../../db/database';

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [preferredCurrency, setPreferredCurrency] = useState(normalizeCurrencyCode(user?.preferredCurrency));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updateData: { displayName?: string; currentPassword?: string; newPassword?: string; preferredCurrency?: string } = {};
    if (displayName !== user?.displayName) updateData.displayName = displayName;
    if (preferredCurrency !== normalizeCurrencyCode(user?.preferredCurrency)) updateData.preferredCurrency = preferredCurrency;
    if (newPassword) {
      if (newPassword.length < 8 || newPassword !== confirmPassword) {
        showToast({ type: 'error', title: 'Invalid password', body: 'Password requirements not met' });
        return;
      }
      updateData.currentPassword = currentPassword;
      updateData.newPassword = newPassword;
    }
    if (Object.keys(updateData).length === 0) {
      showToast({ type: 'info', title: 'No changes', body: 'No changes to update' });
      return;
    }
    await updateProfile(updateData);
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--bg-surface)] border border-white/10 rounded-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">Account</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-8">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Signed in as</p>
            <p className="text-sm font-medium text-white">{user?.email}</p>
            <p className="text-xs text-gray-400 mt-1">Your data stays attached to this account every time you sign in again.</p>
          </div>
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><UserRound size={18} className="text-purple-400" /> Profile Information</h3>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Currency</label>
                <select
                  value={preferredCurrency}
                  onChange={(e) => setPreferredCurrency(normalizeCurrencyCode(e.target.value))}
                  className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((currency) => (
                    <option key={currency.code} value={currency.code}>{currency.code} - {currency.name}</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 border-t border-white/10">
                <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <KeyRound size={14} className="text-gray-500" />
                  Change Password
                </h4>
                <div className="space-y-3">
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <button type="submit" className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-medium">Save Changes</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
