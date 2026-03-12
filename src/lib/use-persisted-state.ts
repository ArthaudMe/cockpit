import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useState backed by localStorage. Debounces writes to avoid thrashing
 * during streaming (where state updates hundreds of times per second).
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T>(defaultValue);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        setState(parsed);
        latestRef.current = parsed;
      }
    } catch {}
  }, [key]);

  // Flush pending writes on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        try {
          localStorage.setItem(key, JSON.stringify(latestRef.current));
        } catch {}
      }
    };
  }, [key]);

  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: T) => T)(prev)
            : value;
        latestRef.current = next;

        // Debounce localStorage writes — 500ms after last update
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          try {
            localStorage.setItem(key, JSON.stringify(latestRef.current));
          } catch {}
          timerRef.current = null;
        }, 500);

        return next;
      });
    },
    [key]
  );

  return [state, setPersistedState];
}
