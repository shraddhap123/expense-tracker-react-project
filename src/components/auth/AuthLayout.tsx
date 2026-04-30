import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-indigo-500/10" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
