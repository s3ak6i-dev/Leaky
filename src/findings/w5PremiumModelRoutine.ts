import { SessionStats } from "../types";
import { Finding } from "./types";
import { W5_MIN_NAVIGATION_TURN_COUNT, W5_HIGH_SEVERITY_TURN_COUNT, W5_NAVIGATION_TOOLS } from "./thresholds";

const NAVIGATION_TOOLS = new Set<string>(W5_NAVIGATION_TOOLS);

function isOpusTier(model: string): boolean {
  return model.toLowerCase().includes("opus");
}

function isPureNavigationTurn(toolCalls: SessionStats["turns"][number]["toolCalls"]): boolean {
  return toolCalls.length > 0 && toolCalls.every((call) => NAVIGATION_TOOLS.has(call.name));
}

/**
 * W5 — premium model on routine turns (TRD §3.2). Trigger: an opus-tier
 * model used on a turn whose only tool calls are pure navigation
 * (Read/Grep/Glob) — no edits, no execution. One session-level finding
 * aggregating the count, since a per-turn card for this would be noisy.
 */
export function findW5PremiumModelRoutine(stats: SessionStats): Finding[] {
  const count = stats.turns.filter((t) => isOpusTier(t.model) && isPureNavigationTurn(t.toolCalls)).length;
  if (count < W5_MIN_NAVIGATION_TURN_COUNT) return [];

  return [
    {
      id: "W5",
      status: "hypothesis",
      severity: count >= W5_HIGH_SEVERITY_TURN_COUNT ? "high" : "warn",
      title: "Premium model on routine turns",
      detail: `${count} turns used an Opus-tier model for file navigation only.`,
      recommendation: `${count} turns used an Opus-tier model for file navigation. Routing routine turns to a cheaper model cuts their cost ~80%.`,
      evidence: { navigationTurnCount: count },
      confidence: "uncalibrated",
    },
  ];
}
