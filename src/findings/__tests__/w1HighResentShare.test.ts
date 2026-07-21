import { describe, it, expect } from "vitest";
import { findW1HighResentShare } from "../w1HighResentShare";
import { SessionStats } from "../../types";

function statsWithTotals(cacheRead: number, total: number): SessionStats {
  return {
    turns: [],
    totals: { input: 0, cacheCreate: 0, cacheRead, output: 0, total },
    turnCount: 0,
    totalLines: 0,
    skippedLines: 0,
    linesByType: {},
    usageMode: "per-turn",
    usageModeConfidence: "confirmed",
  };
}

describe("findW1HighResentShare", () => {
  it("produces no finding for a session with zero tokens", () => {
    expect(findW1HighResentShare(statsWithTotals(0, 0))).toHaveLength(0);
  });

  it("produces no finding below the 40% threshold", () => {
    expect(findW1HighResentShare(statsWithTotals(30, 100))).toHaveLength(0);
  });

  it("produces a warn finding at the threshold", () => {
    const [finding] = findW1HighResentShare(statsWithTotals(40, 100));
    expect(finding.severity).toBe("warn");
    expect(finding.evidence.resentSharePct).toBe(40);
  });

  it("produces a high-severity finding above the high-severity threshold", () => {
    const [finding] = findW1HighResentShare(statsWithTotals(70, 100));
    expect(finding.severity).toBe("high");
  });

  it("always ships as hypothesis/uncalibrated", () => {
    const [finding] = findW1HighResentShare(statsWithTotals(50, 100));
    expect(finding.status).toBe("hypothesis");
    expect(finding.confidence).toBe("uncalibrated");
  });
});
