import { SessionStats } from "./types";

/** USD per million tokens. T2 estimated — see PRD §7a metric integrity model. */
export interface PricingRates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Static table keyed by model-tier substring match (TRD §3.3). Approximate
 * published Anthropic API rates; not billing-accurate for any specific
 * account/contract, which is why every dollar figure derived from this
 * table is formatted through formatCostUsd() and always carries "est.".
 * User-editable overrides (F11, leaky.pricingOverrides) land in v0.3.
 */
const PRICING_TABLE: Record<"opus" | "sonnet" | "haiku" | "unknown", PricingRates> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  // Unknown/unrecognized model id: fall back to sonnet-tier rates rather
  // than zero, since silently showing $0.00 would misrepresent a real cost.
  unknown: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
};

export function ratesForModel(model: string): PricingRates {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return PRICING_TABLE.opus;
  if (lower.includes("sonnet")) return PRICING_TABLE.sonnet;
  if (lower.includes("haiku")) return PRICING_TABLE.haiku;
  return PRICING_TABLE.unknown;
}

export function estimateCostUsd(stats: SessionStats): number {
  let totalUsd = 0;
  for (const turn of stats.turns) {
    const rates = ratesForModel(turn.model);
    totalUsd += (turn.usage.input / 1_000_000) * rates.input;
    totalUsd += (turn.usage.cacheCreate / 1_000_000) * rates.cacheWrite;
    totalUsd += (turn.usage.cacheRead / 1_000_000) * rates.cacheRead;
    totalUsd += (turn.usage.output / 1_000_000) * rates.output;
  }
  return totalUsd;
}

/** The one formatting function every rendered dollar figure must pass through (TRD §3.3). */
export function formatCostUsd(usd: number): string {
  return `$${usd.toFixed(2)} est`;
}
