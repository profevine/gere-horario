import { useState, useEffect, useCallback } from 'react';
import { dbGet, dbSet } from '../db/schoolDB';

export function useDB<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Migrate from localStorage if data exists there
    const fromLS = localStorage.getItem(key);
    if (fromLS) {
      try {
        const parsed = JSON.parse(fromLS) as T;
        dbSet(key, parsed).then(() => {
          setValue(parsed);
          localStorage.removeItem(key);
          setLoaded(true);
        });
        return;
      } catch {
        localStorage.removeItem(key);
      }
    }
    dbGet<T>(key).then(stored => {
      if (stored !== undefined) setValue(stored);
      setLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAndPersist = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof newValue === 'function' ? (newValue as (p: T) => T)(prev) : newValue;
      dbSet(key, next);
      return next;
    });
  }, [key]);

  return [value, setAndPersist, loaded];
}
