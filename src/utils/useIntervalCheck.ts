import { useEffect, useState } from "react";

export function useIntervalCheck<T>(checkFn: () => T, intervalMs: number = 10000): T {
  const [value, setValue] = useState<T>(() => checkFn());
  
  useEffect(() => {
    const check = () => setValue(checkFn());
    check();
    const interval = setInterval(check, intervalMs);
    return () => clearInterval(interval);
  }, [checkFn, intervalMs]);
  
  return value;
}
