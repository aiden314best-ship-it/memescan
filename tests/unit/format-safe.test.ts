import { describe, expect, it } from "vitest";
import { formatAge, formatCompactUsd, formatPct, formatUsd, NA } from "@/lib/format";
import { cleanText, safeExternalUrl, safeImageUrl } from "@/lib/safe";

describe("formatting", () => {
  it("never renders missing data as zero", () => {
    expect(formatUsd(null)).toBe(NA);
    expect(formatUsd(undefined)).toBe(NA);
    expect(formatUsd(Number.NaN)).toBe(NA);
    expect(formatCompactUsd(null)).toBe(NA);
    expect(formatPct(null)).toBe(NA);
  });

  it("formats memecoin-scale prices", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(0.01234)).toBe("$0.01234");
    expect(formatUsd(0.00000123)).toBe("$0.0₅123");
    expect(formatPct(12.345)).toBe("+12.35%");
    expect(formatPct(-3)).toBe("-3.00%");
  });

  it("formats ages", () => {
    const now = 10 * 86_400_000;
    expect(formatAge(now - 30_000, now)).toBe("30s");
    expect(formatAge(now - 3 * 3_600_000, now)).toBe("3h");
    expect(formatAge(now - 5 * 86_400_000, now)).toBe("5d");
    expect(formatAge(null, now)).toBe(NA);
  });
});

describe("untrusted input sanitising", () => {
  it("strips control and bidi-override characters", () => {
    expect(cleanText("Bonk‮evil\u0000")).toBe("Bonkevil");
    expect(cleanText("x".repeat(100), 10)).toHaveLength(10);
    expect(cleanText(42)).toBe("");
  });

  it("only allows http(s) URLs", () => {
    expect(safeExternalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>")).toBeNull();
    expect(safeExternalUrl("https://user:pass@example.com")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });

  it("only allows images from DEX Screener CDNs over https", () => {
    expect(safeImageUrl("https://dd.dexscreener.com/ds-data/tokens/solana/x.png")).not.toBeNull();
    expect(safeImageUrl("https://cdn.dexscreener.com/cms/images/x")).not.toBeNull();
    expect(safeImageUrl("http://dd.dexscreener.com/x.png")).toBeNull();
    expect(safeImageUrl("https://tracker.example.com/pixel.png")).toBeNull();
  });
});
