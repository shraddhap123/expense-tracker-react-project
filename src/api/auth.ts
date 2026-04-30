const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options?.headers ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface User {
  id: number;
  email: string;
  displayName: string;
  createdAt: string;
  preferredCurrency: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export const register = (data: { email: string; password: string; displayName: string }) =>
  req<LoginResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) });

export const login = (data: { email: string; password: string }) =>
  req<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) });

export const logout = () => req('/auth/logout', { method: 'POST' });
export const getCurrentUser = () => req<User>('/auth/me');
export const updateProfile = (data: { displayName?: string; currentPassword?: string; newPassword?: string; preferredCurrency?: string }) =>
  req<User>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });

export interface ForgotPasswordResponse {
  ok: boolean;
  message: string;
  previewToken?: string;
  expiresAt?: string;
  resetUrl?: string;
}

export const forgotPassword = (data: { email: string }) =>
  req<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) });

export const resetPassword = (data: { token: string; newPassword: string }) =>
  req<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) });

export function getStoredUser(): User | null {
  const raw = localStorage.getItem('auth_user');
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setAuthState(user: User, token: string) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function clearAuthState() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}
