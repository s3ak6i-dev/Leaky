import { describe, it, expect } from "vitest";
import { findW2RepeatedReads } from "../w2RepeatedReads";
import { SessionStats, Turn } from "../../types";

function turnWithCall(name: string, target?: string): Turn {
  return {
    id: Math.random().toString(),
    timestamp: "",
    model: "claude-sonnet-5",
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: [{ name, target }],
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

describe("findW2RepeatedReads", () => {
  const cases: Array<{ name: string; turns: Turn[]; expectedFindingCount: number; expectedSeverity?: string }> = [
    {
      name: "below threshold: 2 reads of the same file produces no finding",
      turns: [turnWithCall("Read", "a.ts"), turnWithCall("Read", "a.ts")],
      expectedFindingCount: 0,
    },
    {
      name: "at threshold: 3 reads of the same file produces one warn finding",
      turns: [turnWithCall("Read", "a.ts"), turnWithCall("Read", "a.ts"), turnWithCall("Read", "a.ts")],
      expectedFindingCount: 1,
      expectedSeverity: "warn",
    },
    {
      name: "high severity: 6+ reads of the same file",
      turns: Array.from({ length: 6 }, () => turnWithCall("Read", "a.ts")),
      expectedFindingCount: 1,
      expectedSeverity: "high",
    },
    {
      name: "Read and Edit on the same path count together toward the threshold",
      turns: [turnWithCall("Read", "a.ts"), turnWithCall("Edit", "a.ts"), turnWithCall("Read", "a.ts")],
      expectedFindingCount: 1,
    },
    {
      name: "different files are counted independently",
      turns: [
        turnWithCall("Read", "a.ts"),
        turnWithCall("Read", "a.ts"),
        turnWithCall("Read", "a.ts"),
        turnWithCall("Read", "b.ts"),
      ],
      expectedFindingCount: 1, // only a.ts crosses the threshold
    },
    {
      name: "irrelevant tools (e.g. Bash) never count toward the threshold",
      turns: Array.from({ length: 5 }, () => turnWithCall("Bash", "a.ts")),
      expectedFindingCount: 0,
    },
    {
      name: "tool calls without a target are ignored",
      turns: Array.from({ length: 5 }, () => turnWithCall("Read", undefined)),
      expectedFindingCount: 0,
    },
  ];

  for (const { name, turns, expectedFindingCount, expectedSeverity } of cases) {
    it(name, () => {
      const findings = findW2RepeatedReads(statsFromTurns(turns));
      expect(findings).toHaveLength(expectedFindingCount);
      if (expectedSeverity) expect(findings[0].severity).toBe(expectedSeverity);
    });
  }

  it("always ships as hypothesis/uncalibrated until it clears the calibration gate", () => {
    const turns = Array.from({ length: 3 }, () => turnWithCall("Read", "a.ts"));
    const [finding] = findW2RepeatedReads(statsFromTurns(turns));
    expect(finding.status).toBe("hypothesis");
    expect(finding.confidence).toBe("uncalibrated");
  });

  it("sorts findings by descending repeat count", () => {
    const turns = [
      ...Array.from({ length: 3 }, () => turnWithCall("Read", "low.ts")),
      ...Array.from({ length: 8 }, () => turnWithCall("Read", "high.ts")),
    ];
    const findings = findW2RepeatedReads(statsFromTurns(turns));
    expect(findings.map((f) => f.evidence.target)).toEqual(["high.ts", "low.ts"]);
  });
});
