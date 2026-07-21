import { describe, it, expect } from "vitest";
import { runFindings, visibleFindings } from "../index";
import { SessionStats, Turn } from "../../types";

function statsThatTriggersW1AndW2(): SessionStats {
  const w2Turns: Turn[] = Array.from({ length: 4 }, () => ({
    id: Math.random().toString(),
    timestamp: "",
    model: "claude-sonnet-5",
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: [{ name: "Read", target: "a.ts" }],
  }));
  return {
    turns: w2Turns,
    totals: { input: 0, cacheCreate: 90, cacheRead: 90, output: 0, total: 100 }, // 90% resent -> W1 high
    turnCount: w2Turns.length,
    totalLines: w2Turns.length,
    skippedLines: 0,
    linesByType: {},
    usageMode: "per-turn",
    usageModeConfidence: "confirmed",
  };
}

describe("runFindings", () => {
  it("aggregates across all registered finders and orders by severity", () => {
    const findings = runFindings(statsThatTriggersW1AndW2());
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("W1");
    expect(ids.some((id) => id.startsWith("W2:"))).toBe(true);
    // W1 is high severity (90% resent) and W2's 4-read finding is warn ->
    // W1 must sort first.
    expect(findings[0].id).toBe("W1");
  });
});

describe("visibleFindings", () => {
  it("hides hypothesis findings by default", () => {
    expect(visibleFindings(statsThatTriggersW1AndW2(), false)).toHaveLength(0);
  });

  it("shows hypothesis findings when the dev flag is on, all badged uncalibrated", () => {
    const findings = visibleFindings(statsThatTriggersW1AndW2(), true);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.confidence === "uncalibrated")).toBe(true);
  });
});
