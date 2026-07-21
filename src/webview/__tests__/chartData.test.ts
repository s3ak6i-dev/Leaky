import { describe, it, expect } from "vitest";
import { buildChartBars } from "../chartData";
import { SessionStats, Turn } from "../../types";

function makeTurn(usage: Partial<Turn["usage"]>): Turn {
  return {
    id: Math.random().toString(),
    timestamp: "",
    model: "claude-sonnet-5",
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, ...usage },
    toolCalls: [{ name: "Read", target: "a.ts" }],
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

describe("buildChartBars", () => {
  it("produces one bar per turn when at or under the threshold", () => {
    const turns = [makeTurn({ input: 10 }), makeTurn({ output: 20 })];
    const bars = buildChartBars(makeStats(turns), 300);
    expect(bars).toHaveLength(2);
    expect(bars[0].label).toBe("Turn 1");
    expect(bars[0].fresh).toBe(10);
    expect(bars[1].output).toBe(20);
  });

  it("aggregates adjacent turns into buckets above the threshold", () => {
    const turns = Array.from({ length: 10 }, () => makeTurn({ input: 1 }));
    const bars = buildChartBars(makeStats(turns), 3);
    // bucketSize = ceil(10/3) = 4 -> buckets of 4,4,2 = 3 bars, never exceeding threshold
    expect(bars.length).toBeLessThanOrEqual(3);
    const totalFreshAcrossBars = bars.reduce((sum, b) => sum + b.fresh, 0);
    expect(totalFreshAcrossBars).toBe(10); // no tokens lost during aggregation
  });

  it("returns an empty array for a session with no turns", () => {
    expect(buildChartBars(makeStats([]))).toEqual([]);
  });

  it("collects unique tool names used within a bucket", () => {
    const turns = [makeTurn({ input: 1 }), makeTurn({ input: 1 })];
    const bars = buildChartBars(makeStats(turns), 1); // force both turns into one bucket
    expect(bars[0].toolNames).toEqual(["Read"]);
  });
});
