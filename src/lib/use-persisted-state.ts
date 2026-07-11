import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Module-level registry of live hook instances, keyed by storage key. When any
 * instance writes a value, every OTHER instance bound to the same key is
 * notified so it can update its in-memory state immediately — without waiting
 * for a reload. This fixes cross-instance staleness (e.g. two components both
 * reading `cockpit-active-agent`: a switch in one propagates to the other).
 */
type Subscriber = (value: unknown) => void;
const registry = new Map<string, Set<Subscriber>>();

function subscribe(key: string, fn: Subscriber): () => void {
  let set = registry.get(key);
  if (!set) {
    set = new Set();
    registry.set(key, set);
  }
  set.add(fn);
  return () => {
    const current = registry.get(key);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) registry.delete(key);
  };
}

function notify(key: string, value: unknown, except?: Subscriber): void {
  const set = registry.get(key);
  if (!set) return;
  for (const fn of set) {
    if (fn !== except) fn(value);
  }
}

/**
 * Write a value to localStorage AND notify every live hook instance bound to
 * the same key, so raw writers can keep hook-backed readers in sync. Prefer
 * this over a bare `localStorage.setItem` when a `usePersistedState(key)` may
 * be mounted elsewhere.
 */
export function writePersisted(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  notify(key, value);
}

/**
 * useState backed by localStorage. Debounces writes to avoid thrashing
 * during streaming (where state updates hundreds of times per second).
 *
 * `serialize` lets callers slim the persisted copy (e.g. strip base64
 * images) without affecting in-memory state.
 *
 * Instances that share a key stay in sync: a setter in one instance notifies
 * the others (same document), and the window `storage` event keeps other
 * tabs/windows in sync.
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

  // Stable per-instance subscriber. Applies an externally-originated value
  // (from another instance or another tab) to this instance's state without
  // re-scheduling a write — the originating writer owns persistence.
  const subscriberRef = useRef<Subscriber | null>(null);
  if (subscriberRef.current === null) {
    subscriberRef.current = (value: unknown) => {
      latestRef.current = value as T;
      setState(value as T);
    };
  }

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

  // Subscribe to same-key updates from sibling instances, and to cross-window
  // storage events.
  useEffect(() => {
    const subscriber = subscriberRef.current!;
    const unsubscribe = subscribe(key, subscriber);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        subscriber(JSON.parse(e.newValue));
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
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
      // Derive next from latestRef (kept in lock-step with state, including
      // sequential setter calls within a tick and external updates) rather than
      // the setState updater, so we can notify siblings without a stale value.
      const prev = latestRef.current;
      const next =
        typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
      latestRef.current = next;
      setState(next);

      // Debounce localStorage writes — 500ms after last update
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        writeNow(latestRef.current);
        timerRef.current = null;
      }, 500);

      // Notify sibling instances of the same key (excluding self).
      notify(key, next, subscriberRef.current ?? undefined);
    },
    [writeNow, key]
  );

  return [state, setPersistedState];
}
