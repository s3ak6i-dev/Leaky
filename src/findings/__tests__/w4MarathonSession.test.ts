import { describe, it, expect } from "vitest";
import { findW4MarathonSession } from "../w4MarathonSession";
import { SessionStats, Turn } from "../../types";

function statsWithTurnCount(turnCount: number): SessionStats {
  const turns: Turn[] = Array.from({ length: turnCount }, (_, i) => ({
    id: String(i),
    timestamp: "",
    model: "claude-sonnet-5",
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: [],
  }));
  return {
    turns,
    totals: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, total: 0 },
    turnCount,
    totalLines: turnCount,
    skippedLines: 0,
    linesByType: {},
    usageMode: "per-turn",
    usageModeConfidence: "confirmed",
  };
}

describe("findW4MarathonSession", () => {
  it("produces no finding below the marathon threshold", () => {
    expect(findW4MarathonSession(statsWithTurnCount(39))).toHaveLength(0);
  });

  it("produces a warn finding at the threshold", () => {
    const [finding] = findW4MarathonSession(statsWithTurnCount(40));
    expect(finding.severity).toBe("warn");
    expect(finding.evidence.turnCount).toBe(40);
  });

  it("produces a high-severity finding above the high-severity threshold", () => {
    const [finding] = findW4MarathonSession(statsWithTurnCount(80));
    expect(finding.severity).toBe("high");
  });

  it("always ships as hypothesis/uncalibrated", () => {
    const [finding] = findW4MarathonSession(statsWithTurnCount(50));
    expect(finding.status).toBe("hypothesis");
    expect(finding.confidence).toBe("uncalibrated");
  });
});
