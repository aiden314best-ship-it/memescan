// Display formatting. Every formatter accepts null/undefined and renders an em dash
// so missing upstream data is never shown as zero.

export const NA = "—";

function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (!isNum(value)) return NA;
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1) {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  if (abs >= 0.0001) return `$${value.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return formatTinyUsd(value);
}

/** Renders very small prices like $0.0₅1234 (subscript count of zeros), common for memecoins. */
function formatTinyUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const [mantissa, exp] = Math.abs(value).toExponential(3).split("e");
  const zeros = Math.abs(Number(exp)) - 1;
  const digits = mantissa.replace(".", "").replace(/0+$/, "");
  const sub = String(zeros)
    .split("")
    .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
    .join("");
  return `${sign}$0.0${sub}${digits}`;
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (!isNum(value)) return NA;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 2 : 0,
  });
}

export function formatCompact(value: number | null | undefined): string {
  if (!isNum(value)) return NA;
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}

export function formatInt(value: number | null | undefined): string {
  if (!isNum(value)) return NA;
  return Math.round(value).toLocaleString("en-US");
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (!isNum(value)) return NA;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Tailwind text class for a signed change. */
export function changeClass(value: number | null | undefined): string {
  if (!isNum(value) || value === 0) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}

export function formatAge(fromMs: number | null | undefined, nowMs: number): string {
  if (!isNum(fromMs)) return NA;
  const seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatTime(ms: number | null | undefined): string {
  if (!isNum(ms)) return NA;
  return new Date(ms).toLocaleString();
}
