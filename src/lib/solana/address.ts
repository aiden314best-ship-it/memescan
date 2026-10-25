// Base58 decoding and Solana address validation. Kept dependency-free so it can
// run in route handlers, client components and unit tests alike.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((c, i) => [c, i]),
);

/** Decodes a base58 string. Returns null for any character outside the alphabet. */
export function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0) return new Uint8Array();
  const bytes: number[] = [];
  for (const char of input) {
    const value = INDEX[char];
    if (value === undefined) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's encode leading zero bytes.
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * True when the string is a base58-encoded 32-byte public key. This accepts both
 * on-curve wallet addresses and off-curve PDAs (mints, pools), which is what we want
 * for validating user-supplied mint addresses.
 */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 32 || value.length > 44) return false;
  const decoded = base58Decode(value);
  return decoded !== null && decoded.length === 32;
}

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const INCINERATOR_ADDRESS = "1nc1nerator11111111111111111111111111111111";

/** Shortens an address for display: "AbCd…WxYz". */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
