// Proxies Jupiter GET /swap/v2/order. Keeps the optional JUPITER_API_KEY server-side.
// Quotes are never cached: each one carries a unique requestId and expiry.
import type { NextRequest } from "next/server";
import { JUPITER_BASE, orderResponseSchema, validateOrderParams } from "@/lib/jupiter";
import { BadRequestError, errorResponse, fetchJson, json, limitClient } from "@/lib/server/http";
import { throttles } from "@/lib/server/throttle";

export async function GET(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  try {
    const sp = request.nextUrl.searchParams;
    const validated = validateOrderParams({
      inputMint: sp.get("inputMint"),
      outputMint: sp.get("outputMint"),
      amount: sp.get("amount"),
      taker: sp.get("taker"),
      slippageBps: sp.get("slippageBps"),
    });
    if (!validated.ok) throw new BadRequestError(validated.error);
    const p = validated.value;

    const query = new URLSearchParams({ inputMint: p.inputMint, outputMint: p.outputMint, amount: p.amount });
    if (p.taker) query.set("taker", p.taker);
    if (p.slippageBps) query.set("slippageBps", String(p.slippageBps));
    // No referralAccount/referralFee: this app charges no platform fee.

    await throttles.jupiter.acquire("jupiter", 4_000);
    const key = process.env.JUPITER_API_KEY;
    const raw = await fetchJson(`${JUPITER_BASE}/swap/v2/order?${query}`, "Jupiter", {
      headers: key ? { "x-api-key": key } : {},
    });
    const parsed = orderResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const err = (raw as { error?: unknown })?.error;
      return json(
        { error: typeof err === "string" ? `Jupiter: ${err.slice(0, 200)}` : "Jupiter returned an unexpected quote format." },
        { status: 502 },
      );
    }
    const order = parsed.data;
    if (order.inputMint !== p.inputMint || order.outputMint !== p.outputMint || order.inAmount !== p.amount) {
      return json({ error: "Jupiter quote does not match the requested swap. Not shown for safety." }, { status: 502 });
    }
    if (p.taker && order.taker && order.taker !== p.taker) {
      return json({ error: "Jupiter quote was built for a different wallet. Not shown for safety." }, { status: 502 });
    }
    return json({ order, fetchedAt: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}
