import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  getTransactionEncoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, inspectTransaction, signatureIfFeePayer } from "@/lib/client/tx";

const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

async function buildTx(feePayer: string, extraSigner?: string) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"), lastValidBlockHeight: 100n },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        {
          programAddress: MEMO_PROGRAM,
          accounts: extraSigner ? [{ address: address(extraSigner), role: 2 /* READONLY_SIGNER */ }] : [],
          data: new TextEncoder().encode("test"),
        },
        m,
      ),
  );
  return compileTransaction(message);
}

describe("transaction inspection", () => {
  it("detects whether the taker must sign and recovers the fee-payer signature", async () => {
    const taker = await generateKeyPairSigner();
    const tx = await buildTx(taker.address);
    const bytes = new Uint8Array(getTransactionEncoder().encode(tx));

    const inspection = inspectTransaction(bytes, taker.address);
    expect(inspection.takerMustSign).toBe(true);
    expect(inspection.feePayer).toBe(taker.address);

    // Before signing there is no signature yet.
    expect(signatureIfFeePayer(bytes, taker.address)).toBeNull();

    const signed = await partiallySignTransaction([taker.keyPair], tx);
    const signedBytes = new Uint8Array(getTransactionEncoder().encode(signed));
    expect(signatureIfFeePayer(signedBytes, taker.address)).toBe(getSignatureFromTransaction(signed));
  });

  it("flags transactions that do not need the connected wallet", async () => {
    const someoneElse = await generateKeyPairSigner();
    const taker = await generateKeyPairSigner();
    const bytes = new Uint8Array(getTransactionEncoder().encode(await buildTx(someoneElse.address)));
    expect(inspectTransaction(bytes, taker.address).takerMustSign).toBe(false);
  });

  it("returns null signature when the taker is a co-signer but not the fee payer (e.g. gasless/RFQ)", async () => {
    const payer = await generateKeyPairSigner();
    const taker = await generateKeyPairSigner();
    const tx = await buildTx(payer.address, taker.address);
    const bytes = new Uint8Array(getTransactionEncoder().encode(tx));
    expect(inspectTransaction(bytes, taker.address).takerMustSign).toBe(true);
    const signed = await partiallySignTransaction([taker.keyPair], tx);
    expect(signatureIfFeePayer(new Uint8Array(getTransactionEncoder().encode(signed)), taker.address)).toBeNull();
  });

  it("round-trips base64", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(1232));
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});
