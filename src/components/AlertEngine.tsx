"use client";
// Checks enabled alert rules once a minute WHILE THIS SITE IS OPEN in some tab.
// There is no server or push service: closed tabs receive no alerts.
import { useEffect, useRef } from "react";
import { useToast } from "./Toasts";
import { evaluateAlerts } from "@/lib/alerts";
import type { RowsResponse } from "@/lib/api-types";
import { alertsStore } from "@/lib/client/stores";
import { apiGet } from "@/lib/client/useApi";
import { formatCompactUsd, formatUsd } from "@/lib/format";

export const ALERT_CHECK_INTERVAL_MS = 60_000;

const g = globalThis as unknown as { __memescanLastAlertCheck?: { at: number; error: string | null } };
export function lastAlertCheck() {
  return g.__memescanLastAlertCheck ?? null;
}

export function AlertEngine() {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const rules = alertsStore.get().filter((r) => r.enabled);
      if (rules.length === 0) return;
      const mints = [...new Set(rules.map((r) => r.mint))].slice(0, 90);
      try {
        const data = await apiGet<RowsResponse>(`/api/dex/tokens?mints=${mints.join(",")}`);
        if (cancelled) return;
        g.__memescanLastAlertCheck = { at: Date.now(), error: data.stale ? `Data is stale: ${data.staleReason ?? ""}` : null };
        // Never trigger alerts on stale (cached-after-error) data.
        if (data.stale) return;
        const hits = evaluateAlerts(rules, data.rows);
        if (hits.length === 0) return;
        const now = Date.now();
        alertsStore.set((all) =>
          all.map((r) => {
            const hit = hits.find((h) => h.ruleId === r.id);
            // One-shot: a triggered rule disables itself so it doesn't fire every minute.
            return hit ? { ...r, enabled: false, lastTriggeredAt: now, lastTriggeredValue: hit.observed } : r;
          }),
        );
        for (const hit of hits) {
          const rule = rules.find((r) => r.id === hit.ruleId)!;
          const fmt = rule.metric === "price" ? formatUsd : formatCompactUsd;
          const title = `${rule.symbol} ${rule.metric === "price" ? "price" : "market cap"} is ${rule.op} ${fmt(rule.value)}`;
          const body = `Now ${fmt(hit.observed)} (DEX Screener). This alert has been switched off.`;
          toastRef.current({ title, body, tone: rule.op === "above" ? "up" : "down" });
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(title, { body, tag: rule.id });
            }
          } catch {
            // Some mobile browsers throw on the Notification constructor; the toast still shows.
          }
        }
      } catch (error) {
        g.__memescanLastAlertCheck = { at: Date.now(), error: error instanceof Error ? error.message : "Check failed" };
      }
    }
    const first = window.setTimeout(check, 5_000);
    const id = window.setInterval(check, ALERT_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
