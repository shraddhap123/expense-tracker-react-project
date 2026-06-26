import { useCallback } from 'react';

export function useRipple() {
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el   = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const x    = e.clientX - rect.left - size / 2;
    const y    = e.clientY - rect.top  - size / 2;

    const wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    el.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
  }, []);
}
