// عدّاد تنازلي بالثواني منذ لحظة معيّنة؛ يعيد 0 حين يُسمح بالإعادة
import { useEffect, useState } from 'react';

export default function useCooldown(since, seconds) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!since) { setLeft(0); return undefined; }
    const calc = () => Math.max(0, seconds - Math.floor((Date.now() - since) / 1000));
    setLeft(calc());
    if (calc() === 0) return undefined;
    const id = setInterval(() => {
      const l = calc();
      setLeft(l);
      if (l === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [since, seconds]);
  return left;
}
