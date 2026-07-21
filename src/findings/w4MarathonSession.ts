import { SessionStats } from "../types";
import { Finding } from "./types";
import { W4_MARATHON_TURN_COUNT, W4_HIGH_SEVERITY_TURN_COUNT } from "./thresholds";

/**
 * W4 — marathon session (TRD §3.2). Nominally "turns without a context
 * reset," but reset points aren't detectable yet (see thresholds.ts), so
 * this uses total turnCount as a stand-in for stretch length — a real
 * simplification, not the finished finding.
 */
export function findW4MarathonSession(stats: SessionStats): Finding[] {
  const { turnCount } = stats;
  if (turnCount < W4_MARATHON_TURN_COUNT) return [];

  return [
    {
      id: "W4",
      status: "hypothesis",
      severity: turnCount >= W4_HIGH_SEVERITY_TURN_COUNT ? "high" : "warn",
      title: "Marathon session",
      detail: `This session is ${turnCount} turns deep.`,
      recommendation: `This session is ${turnCount} turns deep; every new turn re-pays the whole history. A fresh session preserves the leak savings.`,
      evidence: { turnCount },
      confidence: "uncalibrated",
    },
  ];
}
