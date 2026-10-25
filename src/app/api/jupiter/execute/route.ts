// Forwards a transaction the user ALREADY SIGNED in their own wallet to Jupiter
// POST /swap/v2/execute for landing. The server never holds keys and never signs.
import type { NextRequest } from "next/server";
import { executeResponseSchema, JUPITER_BASE, validateExecuteBody } from "@/lib/jupiter";
import { BadRequestError, errorResponse, fetchJson, json, limitClient } from "@/lib/server/http";
import { throttles } from "@/lib/server/throttle";
import { SWAP_EXECUTION_ENABLED } from "@/lib/config";

export async function POST(request: NextRequest) {
  const limited = limitClient(request);
  if (limited) return limited;
  if (!SWAP_EXECUTION_ENABLED) {
    return json(
      { error: "Swap execution is disabled on this deployment (NEXT_PUBLIC_ENABLE_SWAP_EXECUTION is not 'true')." },
      { status: 403 },
    );
  }
  try {
    const text = await request.text();
    if (text.length > 10_000) throw new BadRequestError("Request too large.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new BadRequestError("Invalid JSON.");
    }
    const validated = validateExecuteBody(body);
    if (!validated.ok) throw new BadRequestError(validated.error);

    await throttles.jupiterExecute.acquire("execute", 4_000);
    const key = process.env.JUPITER_API_KEY;
    // Jupiter polls for confirmation, so this call can take tens of seconds.
    const raw = await fetchJson(`${JUPITER_BASE}/swap/v2/execute`, "Jupiter", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) },
      body: JSON.stringify(validated.value),
      timeoutMs: 75_000,
    });
    const parsed = executeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // We do not know whether it landed. The client must check the signature on-chain.
      return json({ error: "Jupiter returned an unexpected execute response. Check your wallet history." }, { status: 502 });
    }
    return json({ result: parsed.data });
  } catch (error) {
    return errorResponse(error);
  }
}
