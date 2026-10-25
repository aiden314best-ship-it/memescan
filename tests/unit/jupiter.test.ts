import { describe, expect, it } from "vitest";
import {
  describeExecuteCode,
  describeOrderError,
  orderResponseSchema,
  takerNetworkCostLamports,
  validateExecuteBody,
  validateOrderParams,
  validateSlippageInput,
} from "@/lib/jupiter";
import { MINT_A, orderResponse, PAIR_1, SOL } from "../fixtures";

describe("order parameter validation", () => {
  const base = { inputMint: SOL, outputMint: MINT_A, amount: "100000000" };
  it("accepts a valid request", () => {
    expect(validateOrderParams({ ...base, taker: PAIR_1, slippageBps: "100" })).toEqual({
      ok: true,
      value: { ...base, taker: PAIR_1, slippageBps: 100 },
    });
  });

  it("rejects bad mints, amounts, takers and slippage", () => {
    expect(validateOrderParams({ ...base, inputMint: "nope" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, outputMint: SOL }).ok).toBe(false);
    expect(validateOrderParams({ ...base, amount: "0" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, amount: "1.5" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, amount: "99999999999999999999" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, taker: "bad" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, slippageBps: "0" }).ok).toBe(false);
    expect(validateOrderParams({ ...base, slippageBps: "5000" }).ok).toBe(false);
  });
});

describe("execute body validation", () => {
  it("requires base64 and a sane requestId", () => {
    expect(validateExecuteBody({ signedTransaction: "AQID", requestId: "abc-123" }).ok).toBe(true);
    expect(validateExecuteBody({ signedTransaction: "not base64!", requestId: "a" }).ok).toBe(false);
    expect(validateExecuteBody({ signedTransaction: "A".repeat(9000), requestId: "a" }).ok).toBe(false);
    expect(validateExecuteBody({ signedTransaction: "AQID", requestId: "../../etc" }).ok).toBe(false);
    expect(validateExecuteBody(null).ok).toBe(false);
  });
});

describe("response parsing and messages", () => {
  it("parses an /order response shaped like the official spec", () => {
    const parsed = orderResponseSchema.parse(orderResponse());
    expect(parsed.otherAmountThreshold).toBe("6400000");
    expect(parsed.routePlan?.[0].swapInfo.label).toBe("Raydium");
  });

  it("rejects non-integer amounts in a quote", () => {
    expect(orderResponseSchema.safeParse(orderResponse({ outAmount: "1e9" })).success).toBe(false);
  });

  it("maps /order error codes by router", () => {
    expect(describeOrderError("metis", 2)).toMatch(/SOL/);
    expect(describeOrderError("jupiterz", 2)).toMatch(/token account/);
    expect(describeOrderError("metis", 99, "custom")).toBe("custom");
  });

  it("maps /execute codes, treating expiry separately", () => {
    expect(describeExecuteCode(0).outcome).toBe("confirmed");
    expect(describeExecuteCode(-1005).outcome).toBe("expired");
    expect(describeExecuteCode(-2003).outcome).toBe("expired");
    expect(describeExecuteCode(-1000).outcome).toBe("failed");
    expect(describeExecuteCode(-2).outcome).toBe("rejected-by-api");
    expect(describeExecuteCode(-777).message).toContain("-777");
  });

  it("sums only network costs paid by the taker", () => {
    const taker = PAIR_1;
    const own = orderResponseSchema.parse(orderResponse({ taker }));
    expect(takerNetworkCostLamports(own)).toBe(5000 + 10000 + 2039280);
    const gasless = orderResponseSchema.parse(
      orderResponse({ taker, signatureFeePayer: SOL, prioritizationFeePayer: SOL, rentFeePayer: SOL }),
    );
    expect(takerNetworkCostLamports(gasless)).toBe(0);
    const unreported = orderResponseSchema.parse(
      orderResponse({ signatureFeeLamports: undefined, prioritizationFeeLamports: undefined, rentFeeLamports: undefined }),
    );
    expect(takerNetworkCostLamports(unreported)).toBeNull();
  });
});

describe("slippage input", () => {
  it("enforces limits and warns at extremes", () => {
    expect(validateSlippageInput("1")).toEqual({ bps: 100, error: null, warning: null });
    expect(validateSlippageInput("10").warning).toMatch(/High slippage/);
    expect(validateSlippageInput("0.05").warning).toMatch(/low slippage/);
    expect(validateSlippageInput("31").error).not.toBeNull();
    expect(validateSlippageInput("0").error).not.toBeNull();
    expect(validateSlippageInput("abc").error).not.toBeNull();
  });
});
