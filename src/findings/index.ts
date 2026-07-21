import { SessionStats } from "../types";
import { Finding } from "./types";
import { findW1HighResentShare } from "./w1HighResentShare";
import { findW2RepeatedReads } from "./w2RepeatedReads";
import { findW4MarathonSession } from "./w4MarathonSession";
import { findW5PremiumModelRoutine } from "./w5PremiumModelRoutine";

// W3 (oversized tool result) and W6 (post-compaction rework) are `blocked`
// per TRD §3.2 — they depend on validations (chars/4 accuracy, compaction
// detectability) that haven't happened yet, so they aren't implemented.
const ALL_FINDERS: Array<(stats: SessionStats) => Finding[]> = [
  findW1HighResentShare,
  findW2RepeatedReads,
  findW4MarathonSession,
  findW5PremiumModelRoutine,
];

const SEVERITY_RANK = { high: 0, warn: 1, info: 2 } as const;

export function runFindings(stats: SessionStats): Finding[] {
  // UISpec §S2.c: findings order by severity, magnitude within a finding
  // type is each finder's own concern (e.g. W2 sorts its own targets).
  return ALL_FINDERS.flatMap((finder) => finder(stats)).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
}

/**
 * The findings actually shown in the UI (TRD §3.2): validated findings
 * always render; hypothesis-status findings only render behind
 * leaky.showHypothesisFindings, and always carry the "uncalibrated" badge
 * — see Finding.confidence, rendered by the webview.
 */
export function visibleFindings(stats: SessionStats, showHypothesisFindings: boolean): Finding[] {
  return runFindings(stats).filter(
    (f) => f.status === "validated" || (f.status === "hypothesis" && showHypothesisFindings)
  );
}

export type { Finding } from "./types";
