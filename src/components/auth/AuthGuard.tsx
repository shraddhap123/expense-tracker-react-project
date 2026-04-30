import { useState } from 'react';
import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AuthLayout from './AuthLayout';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import ResetPasswordForm from './ResetPasswordForm';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, login, register, forgotPassword, resetPassword } = useAuth();
  const [screen, setScreen] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [resetTokenPreview, setResetTokenPreview] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    if (token) {
      setResetTokenPreview(token);
      setScreen('reset');
    }
  }, []);

  const clearResetLinkState = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('resetToken')) {
      return;
    }
    url.searchParams.delete('resetToken');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  };

  const handleLogin = async (email: string, password: string) => {
    clearResetLinkState();
    await login(email, password);
  };

  const handleRegister = async (email: string, password: string, displayName: string) => {
    clearResetLinkState();
    await register(email, password, displayName);
  };

  const handleForgotPassword = async (email: string) => {
    const response = await forgotPassword(email);
    if (response.previewToken) {
      setResetTokenPreview(response.previewToken);
    }
    return response;
  };

  const handleResetPassword = async (token: string, newPassword: string) => {
    await resetPassword(token, newPassword);
    setResetTokenPreview('');
    clearResetLinkState();
    setScreen('login');
  };

  if (loading) {
    return (
      <AuthLayout>
        <div className="w-full max-w-md bg-[#1a1f2e] border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">$</div>
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthLayout>
        {screen === 'register' && (
          <RegisterForm onRegister={handleRegister} onSwitchToLogin={() => setScreen('login')} />
        )}
        {screen === 'login' && (
          <LoginForm
            onLogin={handleLogin}
            onSwitchToRegister={() => {
              clearResetLinkState();
              setScreen('register');
            }}
            onSwitchToForgotPassword={() => {
              clearResetLinkState();
              setScreen('forgot');
            }}
          />
        )}
        {screen === 'forgot' && (
          <ForgotPasswordForm
            onSubmit={handleForgotPassword}
            onSwitchToLogin={() => {
              clearResetLinkState();
              setScreen('login');
            }}
            onSwitchToReset={(token) => {
              setResetTokenPreview(token ?? '');
              setScreen('reset');
            }}
          />
        )}
        {screen === 'reset' && (
          <ResetPasswordForm
            initialToken={resetTokenPreview}
            onSubmit={handleResetPassword}
            onSwitchToLogin={() => {
              clearResetLinkState();
              setScreen('login');
            }}
            onSwitchToForgot={() => {
              clearResetLinkState();
              setScreen('forgot');
            }}
          />
        )}
      </AuthLayout>
    );
  }

  return <>{children}</>;
}
