import { createContext, createElement, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import {
  login, logout, register, forgotPassword, resetPassword,
  getCurrentUser, updateProfile, getStoredUser, getStoredToken, setAuthState, clearAuthState,
  type ForgotPasswordResponse, type User,
} from '../api/auth';
import { showToast } from '../components/Toast';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string) => Promise<User>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<ForgotPasswordResponse>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; currentPassword?: string; newPassword?: string; preferredCurrency?: string }) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      getCurrentUser().then(setUser).catch(() => { clearAuthState(); setUser(null); }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const handleUnauthorized = () => { setUser(null); showToast({ type: 'error', title: 'Session expired', body: 'Please log in again' }); };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const response = await login({ email, password });
    setAuthState(response.user, response.token);
    setUser(response.user);
    showToast({ type: 'success', title: 'Welcome back!', body: `Logged in as ${response.user.displayName}` });
    return response.user;
  }, []);

  const handleRegister = useCallback(async (email: string, password: string, displayName: string) => {
    const response = await register({ email, password, displayName });
    setAuthState(response.user, response.token);
    setUser(response.user);
    showToast({ type: 'success', title: 'Account created!', body: `Welcome to ExpenseIQ, ${response.user.displayName}` });
    return response.user;
  }, []);

  const handleLogout = useCallback(async () => {
    try { await logout(); } catch {}
    clearAuthState();
    setUser(null);
    showToast({ type: 'success', title: 'Logged out', body: 'See you next time!' });
  }, []);

  const handleForgotPassword = useCallback(async (email: string) => {
    const response = await forgotPassword({ email });
    showToast({
      type: 'info',
      title: 'Reset started',
      body: response.previewToken
        ? 'A reset token is ready for this development build.'
        : 'If that email exists, a password reset email is on its way.',
      duration: 6000,
    });
    return response;
  }, []);

  const handleResetPassword = useCallback(async (token: string, newPassword: string) => {
    await resetPassword({ token, newPassword });
    showToast({
      type: 'success',
      title: 'Password updated',
      body: 'You can sign in with your new password now.',
      duration: 6000,
    });
  }, []);

  const handleUpdateProfile = useCallback(async (data: { displayName?: string; currentPassword?: string; newPassword?: string; preferredCurrency?: string }) => {
    const updated = await updateProfile(data);
    setAuthState(updated, getStoredToken()!);
    setUser(updated);
    showToast({ type: 'success', title: 'Profile updated', body: 'Your changes have been saved' });
    return updated;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    forgotPassword: handleForgotPassword,
    resetPassword: handleResetPassword,
    updateProfile: handleUpdateProfile,
  }), [handleForgotPassword, handleLogin, handleLogout, handleRegister, handleResetPassword, handleUpdateProfile, loading, user]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
