import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from  = prev.current;

    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
      else { setValue(target); prev.current = target; }
    });
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}
