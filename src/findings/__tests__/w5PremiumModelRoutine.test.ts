import { describe, it, expect } from "vitest";
import { findW5PremiumModelRoutine } from "../w5PremiumModelRoutine";
import { SessionStats, Turn } from "../../types";

function turn(model: string, toolNames: string[]): Turn {
  return {
    id: Math.random().toString(),
    timestamp: "",
    model,
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: toolNames.map((name) => ({ name, target: "x" })),
  };
}

function statsFromTurns(turns: Turn[]): SessionStats {
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

describe("findW5PremiumModelRoutine", () => {
  it("produces no finding below the minimum navigation-turn count", () => {
    const turns = Array.from({ length: 2 }, () => turn("claude-opus-4-8", ["Read"]));
    expect(findW5PremiumModelRoutine(statsFromTurns(turns))).toHaveLength(0);
  });

  it("produces a warn finding at the minimum threshold", () => {
    const turns = Array.from({ length: 3 }, () => turn("claude-opus-4-8", ["Read"]));
    const [finding] = findW5PremiumModelRoutine(statsFromTurns(turns));
    expect(finding.severity).toBe("warn");
    expect(finding.evidence.navigationTurnCount).toBe(3);
  });

  it("produces a high-severity finding above the high-severity threshold", () => {
    const turns = Array.from({ length: 10 }, () => turn("claude-opus-4-8", ["Grep"]));
    const [finding] = findW5PremiumModelRoutine(statsFromTurns(turns));
    expect(finding.severity).toBe("high");
  });

  it("does not count non-opus models", () => {
    const turns = Array.from({ length: 5 }, () => turn("claude-sonnet-5", ["Read"]));
    expect(findW5PremiumModelRoutine(statsFromTurns(turns))).toHaveLength(0);
  });

  it("does not count turns that include a non-navigation tool", () => {
    const turns = Array.from({ length: 5 }, () => turn("claude-opus-4-8", ["Read", "Edit"]));
    expect(findW5PremiumModelRoutine(statsFromTurns(turns))).toHaveLength(0);
  });

  it("does not count turns with no tool calls at all", () => {
    const turns = Array.from({ length: 5 }, () => turn("claude-opus-4-8", []));
    expect(findW5PremiumModelRoutine(statsFromTurns(turns))).toHaveLength(0);
  });

  it("counts Read, Grep, and Glob interchangeably as navigation tools", () => {
    const turns = [turn("opus", ["Read"]), turn("opus", ["Grep"]), turn("opus", ["Glob"])];
    const [finding] = findW5PremiumModelRoutine(statsFromTurns(turns));
    expect(finding.evidence.navigationTurnCount).toBe(3);
  });
});
