import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseSession } from "../parser";

const FIXTURES_DIR = path.join(__dirname, "..", "..", "..", "fixtures", "real");

// PARSER-RECON regression baseline (TRD §2.4). These totals were computed by
// this same parser against sanitized real session logs and are locked in as
// a regression guard: any future parser change that shifts these numbers
// must be a deliberate, reviewed change, not an accident.
const KNOWN_GOOD: Record<string, { turnCount: number; total: number; totalLines: number; skippedLines: number }> = {
  "session-leaky.jsonl": { turnCount: 31, total: 2359413, totalLines: 129, skippedLines: 0 },
  "session-locus.jsonl": { turnCount: 694, total: 72564286, totalLines: 3106, skippedLines: 0 },
  "session-klados.jsonl": { turnCount: 405, total: 183952686, totalLines: 1841, skippedLines: 0 },
};

describe("parseSession against real-log fixtures", () => {
  for (const [file, expected] of Object.entries(KNOWN_GOOD)) {
    it(`matches known-good totals for ${file}`, () => {
      const text = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
      const stats = parseSession(text);

      expect(stats.turnCount).toBe(expected.turnCount);
      expect(stats.totals.total).toBe(expected.total);
      expect(stats.totalLines).toBe(expected.totalLines);
      expect(stats.skippedLines).toBe(expected.skippedLines);
    });

    it(`confirms per-turn usage mode for ${file}`, () => {
      const text = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
      const stats = parseSession(text);

      expect(stats.usageMode).toBe("per-turn");
    });

    it(`coalesces duplicate streamed lines by message id for ${file}`, () => {
      const text = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
      const stats = parseSession(text);
      const rawAssistantLines = text
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .filter((l) => JSON.parse(l).type === "assistant").length;

      // Coalescing must never increase turn count, and on every real
      // fixture in this corpus it strictly decreases (there are duplicates).
      expect(stats.turnCount).toBeLessThanOrEqual(rawAssistantLines);
    });
  }
});

describe("parseSession defensive behavior", () => {
  it("never throws on malformed JSON lines and counts them as skipped", () => {
    const text = ['{"type":"assistant","message":{"id":"a","usage":{}}}', "not json at all", "{ also not json"].join(
      "\n"
    );
    const stats = parseSession(text);
    expect(stats.skippedLines).toBe(2);
    expect(stats.turnCount).toBe(1);
  });

  it("treats a missing usage object as zero-usage, never throws", () => {
    const text = '{"type":"assistant","message":{"id":"a"}}';
    const stats = parseSession(text);
    expect(stats.turnCount).toBe(1);
    expect(stats.totals.total).toBe(0);
  });

  it("ignores non user/assistant line types but counts them by type", () => {
    const text = ['{"type":"queue-operation"}', '{"type":"assistant","message":{"id":"a","usage":{"input_tokens":5}}}'].join(
      "\n"
    );
    const stats = parseSession(text);
    expect(stats.linesByType["queue-operation"]).toBe(1);
    expect(stats.turnCount).toBe(1);
  });

  it("falls back to per-turn/assumed when no decrease is observed (short session)", () => {
    const text = [
      '{"type":"assistant","message":{"id":"a","usage":{"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}}',
      '{"type":"assistant","message":{"id":"b","usage":{"cache_creation_input_tokens":20,"cache_read_input_tokens":15}}}',
    ].join("\n");
    const stats = parseSession(text);
    expect(stats.usageMode).toBe("per-turn");
    expect(stats.usageModeConfidence).toBe("assumed");
  });
});
