import { SessionStats } from "../types";
import { Finding } from "./types";
import { W2_MIN_REPEAT_COUNT, W2_HIGH_SEVERITY_COUNT } from "./thresholds";

const RELEVANT_TOOLS = new Set(["Read", "Edit"]);

/**
 * W2 — repeated file reads (TRD §3.2, PRD §8's "near-tautological" finding).
 * Trigger: the same path read or edited >= W2_MIN_REPEAT_COUNT times in a
 * session. Still shipped as `status: "hypothesis"` / `confidence:
 * "uncalibrated"` until it clears the calibration gate in Validation.md —
 * "near-tautological" is a reason to calibrate it first, not a reason to
 * skip the gate the rest of the engine has to clear.
 */
export function findW2RepeatedReads(stats: SessionStats): Finding[] {
  const countByTarget = new Map<string, number>();

  for (const turn of stats.turns) {
    for (const call of turn.toolCalls) {
      if (!call.target || !RELEVANT_TOOLS.has(call.name)) continue;
      countByTarget.set(call.target, (countByTarget.get(call.target) ?? 0) + 1);
    }
  }

  const findings: Finding[] = [];
  for (const [target, count] of countByTarget) {
    if (count < W2_MIN_REPEAT_COUNT) continue;
    findings.push({
      id: `W2:${target}`,
      status: "hypothesis",
      severity: count >= W2_HIGH_SEVERITY_COUNT ? "high" : "warn",
      title: "Repeated file reads",
      detail: `\`${target}\` was read or edited ${count} times this session.`,
      recommendation: `\`${target}\` was read ${count} times. If it isn't changing, consider summarizing it into CLAUDE.md so it's sent once.`,
      evidence: { target, count },
      confidence: "uncalibrated",
    });
  }

  return findings.sort((a, b) => (b.evidence.count as number) - (a.evidence.count as number));
}
