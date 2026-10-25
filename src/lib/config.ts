// Public runtime flags. NEXT_PUBLIC_* values are inlined at build time and are visible
// to the browser, so they must never contain secrets.

/**
 * Real-money swap execution is OFF unless explicitly enabled. Quotes always work.
 * Execution has not been tested end-to-end by the authors of this build; enable it
 * only after testing with a tiny amount (see README "Enabling swaps").
 */
export const SWAP_EXECUTION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SWAP_EXECUTION === "true";
