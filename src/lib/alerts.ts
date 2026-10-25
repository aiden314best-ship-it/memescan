// Pure alert evaluation, separated from the browser engine so it can be unit tested.
import type { TokenRow } from "@/lib/dexscreener/normalize";

export interface AlertRuleLike {
  id: string;
  mint: string;
  metric: "price" | "marketCap";
  op: "above" | "below";
  value: number;
  enabled: boolean;
}

export interface AlertHit {
  ruleId: string;
  observed: number;
}

export function metricValue(row: TokenRow, metric: AlertRuleLike["metric"]): number | null {
  return metric === "price" ? row.priceUsd : (row.marketCap ?? row.fdv);
}

/** Rules whose condition is met. Rules with missing data never fire. */
export function evaluateAlerts(rules: AlertRuleLike[], rows: TokenRow[]): AlertHit[] {
  const byMint = new Map(rows.map((r) => [r.mint, r]));
  const hits: AlertHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const row = byMint.get(rule.mint);
    if (!row) continue;
    const observed = metricValue(row, rule.metric);
    if (observed === null) continue;
    if ((rule.op === "above" && observed >= rule.value) || (rule.op === "below" && observed <= rule.value)) {
      hits.push({ ruleId: rule.id, observed });
    }
  }
  return hits;
}
