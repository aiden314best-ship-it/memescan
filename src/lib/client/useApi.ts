"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Network error: could not reach this app's server.", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new ApiError(msg || `Request failed (HTTP ${res.status}).`, res.status);
  }
  return body as T;
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Epoch ms of the last successful load. */
  updatedAt: number | null;
  refresh: () => void;
}

interface Settled<T> {
  /** Identity of the resource (data from another id is never shown). */
  id: string;
  /** Identity of the specific attempt that settled. */
  attempt: string;
  data: T | null;
  error: string | null;
  updatedAt: number | null;
}

/**
 * Runs `load` whenever `id` changes (or refresh() is called). While a refresh of the
 * same id is in flight, or after it fails, the previous data stays visible so users
 * see labelled stale data rather than a blank page. Pass id=null to disable.
 */
export function useAsync<T>(id: string | null, load: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const attempt = id === null ? null : `${id}#${tick}`;
  useEffect(() => {
    if (id === null || attempt === null) return;
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSettled({ id, attempt, data, error: null, updatedAt: Date.now() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Request failed.";
        setSettled((prev) => ({
          id,
          attempt,
          data: prev?.id === id ? prev.data : null,
          error: message,
          updatedAt: prev?.id === id ? prev.updatedAt : null,
        }));
      });
    return () => controller.abort();
  }, [id, attempt]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const current = settled && settled.id === id ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: id !== null && settled?.attempt !== attempt,
    updatedAt: current?.updatedAt ?? null,
    refresh,
  };
}

/** Fetches a JSON API route and optionally re-polls it. Polling pauses while the tab is hidden. */
export function useApi<T>(url: string | null, refreshMs = 0): AsyncState<T> {
  const state = useAsync<T>(url, (signal) => apiGet<T>(url!, signal));
  const { refresh } = state;
  useEffect(() => {
    if (!url || !refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [url, refreshMs, refresh]);
  return state;
}

// One shared 1-second clock for all relative-time displays. On the server (prerender)
// the snapshot is 0, so no wall-clock time is baked into static HTML.
let clockNow = 0;
let clockTimer: number | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) window.clearInterval(clockTimer);
  };
}

/** Current time, re-rendering at most every `ms`. Returns 0 during server prerender. */
export function useNow(ms = 1000): number {
  const getSnapshot = useCallback(() => {
    if (!clockNow) clockNow = Date.now();
    return Math.floor(clockNow / ms) * ms;
  }, [ms]);
  return useSyncExternalStore(subscribeClock, getSnapshot, () => 0);
}
