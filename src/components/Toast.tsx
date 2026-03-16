import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, Download } from 'lucide-react';

// ─── Toast Types ──────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'download';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  duration?: number; // ms, default 4000
}

// ─── Global event bus (no context needed) ────────────────────────────────────

type Listener = (toast: ToastMessage) => void;
const listeners: Set<Listener> = new Set();

export function showToast(msg: Omit<ToastMessage, 'id'>) {
  const toast: ToastMessage = { ...msg, id: `${Date.now()}-${Math.random()}` };
  listeners.forEach((fn) => fn(toast));
}

// ─── Individual Toast Item ────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss
    const exitTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration ?? 4500);
    return () => { clearTimeout(enterTimer); clearTimeout(exitTimer); };
  }, [toast, onDismiss]);

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />,
    error:   <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />,
    info:    <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />,
    download:<Download size={18} className="text-purple-400 shrink-0 mt-0.5" />,
  };

  const borders = {
    success: 'border-emerald-500/30 bg-emerald-500/10',
    error:   'border-red-500/30 bg-red-500/10',
    info:    'border-blue-500/30 bg-blue-500/10',
    download:'border-purple-500/30 bg-purple-500/10',
  };

  const titleColors = {
    success: 'text-emerald-300',
    error:   'text-red-300',
    info:    'text-blue-300',
    download:'text-purple-300',
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl
        transition-all duration-300 ease-out max-w-sm w-full
        ${borders[toast.type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${titleColors[toast.type]}`}>{toast.title}</p>
        {toast.body && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{toast.body}</p>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
        className="text-gray-600 hover:text-gray-300 transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Toast Container (mount once in App) ─────────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler: Listener = (toast) => {
      setToasts((prev) => [...prev, toast]);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

// ─── Upload toast variant (with icon override) ────────────────────────────────

export function showUploadToast(title: string, body?: string) {
  showToast({ type: 'info', title, body });
}
