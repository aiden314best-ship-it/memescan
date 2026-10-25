"use client";
// Tiny localStorage-backed stores for NON-SENSITIVE preferences only (theme, favorites,
// alert rules, swap history). Never store keys, seed phrases or signed transactions here.
import { useCallback, useSyncExternalStore } from "react";
import type { z } from "zod";

type Listener = () => void;

interface StoreDef<T> {
  key: string;
  fallback: T;
  schema: z.ZodType<T>;
}

const listeners = new Map<string, Set<Listener>>();
const snapshots = new Map<string, unknown>();

function read<T>(def: StoreDef<T>): T {
  if (snapshots.has(def.key)) return snapshots.get(def.key) as T;
  let value = def.fallback;
  try {
    const raw = window.localStorage.getItem(def.key);
    if (raw) {
      const parsed = def.schema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    }
  } catch {
    // Storage blocked (private mode) or corrupt JSON: fall back to defaults.
  }
  snapshots.set(def.key, value);
  return value;
}

function write<T>(def: StoreDef<T>, value: T) {
  snapshots.set(def.key, value);
  try {
    window.localStorage.setItem(def.key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: keep the in-memory value for this session.
  }
  listeners.get(def.key)?.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !listeners.has(e.key)) return;
    snapshots.delete(e.key);
    listeners.get(e.key)?.forEach((l) => l());
  });
}

export function createStore<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const def: StoreDef<T> = { key: `memescan:${key}`, schema, fallback };
  const subscribe = (l: Listener) => {
    const set = listeners.get(def.key) ?? new Set();
    set.add(l);
    listeners.set(def.key, set);
    return () => set.delete(l);
  };
  const get = () => (typeof window === "undefined" ? fallback : read(def));
  const set = (next: T | ((prev: T) => T)) => {
    const value = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
    write(def, value);
  };
  function useStore(): [T, typeof set] {
    const value = useSyncExternalStore(subscribe, get, () => fallback);
    return [value, useCallback(set, [])];
  }
  return { useStore, get, set, subscribe };
}
