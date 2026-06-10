import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useState backed by localStorage. Debounces writes to avoid thrashing
 * during streaming (where state updates hundreds of times per second).
 *
 * `serialize` lets callers slim the persisted copy (e.g. strip base64
 * images) without affecting in-memory state.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (value: T) => T }
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T>(defaultValue);
  const serializeRef = useRef(options?.serialize);
  serializeRef.current = options?.serialize;

  const writeNow = useCallback(
    (value: T) => {
      try {
        const toStore = serializeRef.current ? serializeRef.current(value) : value;
        localStorage.setItem(key, JSON.stringify(toStore));
      } catch {}
    },
    [key]
  );

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
        writeNow(latestRef.current);
      }
    };
  }, [key, writeNow]);

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
          writeNow(latestRef.current);
          timerRef.current = null;
        }, 500);

        return next;
      });
    },
    [writeNow]
  );

  return [state, setPersistedState];
}
