import { describe, expect, it } from "vitest";
import { base58Decode, isSolanaAddress, shortAddress, WRAPPED_SOL_MINT } from "@/lib/solana/address";
import { atomicToNumber, formatAtomic, parseDecimalAmount } from "@/lib/solana/amounts";

describe("base58 / address validation", () => {
  it("accepts real Solana addresses", () => {
    expect(isSolanaAddress(WRAPPED_SOL_MINT)).toBe(true);
    expect(isSolanaAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true); // USDC
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true); // System program
  });

  it("decodes leading '1's as zero bytes", () => {
    const bytes = base58Decode("11111111111111111111111111111111");
    expect(bytes?.length).toBe(32);
    expect([...bytes!].every((b) => b === 0)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isSolanaAddress("")).toBe(false);
    expect(isSolanaAddress("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl")).toBe(false); // non-base58 chars
    expect(isSolanaAddress("abc")).toBe(false);
    expect(isSolanaAddress(`${WRAPPED_SOL_MINT}1`)).toBe(false); // 33 bytes
    expect(isSolanaAddress("<script>alert(1)</script>")).toBe(false);
    expect(isSolanaAddress(123)).toBe(false);
    expect(isSolanaAddress(null)).toBe(false);
  });

  it("shortens addresses", () => {
    expect(shortAddress(WRAPPED_SOL_MINT)).toBe("So11…1112");
  });
});

describe("amount parsing", () => {
  it("converts decimals to atomic units exactly", () => {
    expect(parseDecimalAmount("1", 9)).toEqual({ ok: true, atomic: 1_000_000_000n });
    expect(parseDecimalAmount("0.000000001", 9)).toEqual({ ok: true, atomic: 1n });
    expect(parseDecimalAmount("1.5", 6)).toEqual({ ok: true, atomic: 1_500_000n });
    expect(parseDecimalAmount(".5", 2)).toEqual({ ok: true, atomic: 50n });
  });

  it("rejects invalid amounts", () => {
    expect(parseDecimalAmount("", 9).ok).toBe(false);
    expect(parseDecimalAmount("0", 9).ok).toBe(false);
    expect(parseDecimalAmount("-1", 9).ok).toBe(false);
    expect(parseDecimalAmount("1e5", 9).ok).toBe(false);
    expect(parseDecimalAmount("1.2345678", 6).ok).toBe(false); // too many decimals
    expect(parseDecimalAmount("99999999999999999999999", 9).ok).toBe(false); // > u64
    expect(parseDecimalAmount(".", 9).ok).toBe(false);
  });

  it("formats atomic units", () => {
    expect(formatAtomic(1_500_000_000n, 9)).toBe("1.5");
    expect(formatAtomic("1234567890000", 6)).toBe("1,234,567.89");
    expect(formatAtomic(1n, 9)).toBe("0.000000001");
    expect(formatAtomic(123456789n, 9, 4)).toBe("0.1234");
    expect(atomicToNumber("2500000", 6)).toBe(2.5);
  });
});

describe("base58 decoder matches @solana/kit", () => {
  it("round-trips 200 random 32-byte keys", async () => {
    const { getBase58Decoder } = await import("@solana/kit");
    const toBase58 = getBase58Decoder();
    for (let i = 0; i < 200; i++) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      if (i % 10 === 0) bytes[0] = 0; // exercise leading-zero handling
      if (i % 20 === 0) bytes[1] = 0;
      const encoded = toBase58.decode(bytes);
      expect(isSolanaAddress(encoded)).toBe(true);
      expect([...base58Decode(encoded)!]).toEqual([...bytes]);
    }
  });
});
