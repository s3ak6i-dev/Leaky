import { describe, it, expect } from "vitest";
import { ratesForModel, estimateCostUsd, formatCostUsd } from "../pricing";
import { SessionStats, Turn } from "../types";

function makeTurn(model: string, usage: Partial<Turn["usage"]> = {}): Turn {
  return {
    id: "t",
    timestamp: "",
    model,
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, ...usage },
    toolCalls: [],
  };
}

function makeStats(turns: Turn[]): SessionStats {
  return {
    turns,
    totals: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, total: 0 },
    turnCount: turns.length,
    totalLines: turns.length,
    skippedLines: 0,
    linesByType: {},
    usageMode: "per-turn",
    usageModeConfidence: "confirmed",
  };
}

describe("ratesForModel", () => {
  it("matches known tiers by substring, case-insensitively", () => {
    expect(ratesForModel("claude-opus-4-8")).toEqual(ratesForModel("OPUS"));
    expect(ratesForModel("claude-sonnet-5")).toEqual(ratesForModel("Sonnet"));
    expect(ratesForModel("claude-haiku-4-5")).toEqual(ratesForModel("haiku"));
  });

  it("falls back to a non-zero rate for an unrecognized model id", () => {
    const rates = ratesForModel("some-future-model");
    expect(rates.input).toBeGreaterThan(0);
  });

  it("opus is priced higher than sonnet, which is priced higher than haiku", () => {
    expect(ratesForModel("opus").input).toBeGreaterThan(ratesForModel("sonnet").input);
    expect(ratesForModel("sonnet").input).toBeGreaterThan(ratesForModel("haiku").input);
  });
});

describe("estimateCostUsd", () => {
  it("returns zero for a session with no turns", () => {
    expect(estimateCostUsd(makeStats([]))).toBe(0);
  });

  it("sums cost across turns using each turn's own model rates", () => {
    const stats = makeStats([
      makeTurn("claude-sonnet-5", { input: 1_000_000 }), // 1M input tokens at sonnet rate
      makeTurn("claude-opus-4-8", { output: 1_000_000 }), // 1M output tokens at opus rate
    ]);
    const cost = estimateCostUsd(stats);
    const expected = ratesForModel("sonnet").input + ratesForModel("opus").output;
    expect(cost).toBeCloseTo(expected, 6);
  });
});

describe("formatCostUsd", () => {
  it("always appends the est. treatment with two decimal places", () => {
    expect(formatCostUsd(4.1)).toBe("$4.10 est");
    expect(formatCostUsd(0)).toBe("$0.00 est");
  });
});
