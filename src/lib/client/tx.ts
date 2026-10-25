"use client";
// Inspection helpers for the transaction returned by Jupiter, run BEFORE asking the
// wallet to sign it, plus base64 helpers.
import { getBase58Decoder, getTransactionDecoder } from "@solana/kit";

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export interface TxInspection {
  signers: string[];
  feePayer: string | null;
  /** True when the connected wallet is one of the required signers. */
  takerMustSign: boolean;
}

/** Decodes the wire transaction and lists required signers (in account order). */
export function inspectTransaction(bytes: Uint8Array, taker: string): TxInspection {
  const tx = getTransactionDecoder().decode(bytes);
  const signers = Object.keys(tx.signatures);
  return { signers, feePayer: signers[0] ?? null, takerMustSign: signers.includes(taker) };
}

/**
 * After the wallet signs: if the taker is the fee payer, the taker's signature is the
 * transaction ID, which lets us look the transaction up on-chain even if /execute fails.
 */
export function signatureIfFeePayer(signedBytes: Uint8Array, taker: string): string | null {
  const tx = getTransactionDecoder().decode(signedBytes);
  const signers = Object.keys(tx.signatures);
  if (signers[0] !== taker) return null;
  const sig = tx.signatures[signers[0] as keyof typeof tx.signatures];
  return sig ? getBase58Decoder().decode(sig) : null;
}
