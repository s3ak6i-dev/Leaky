import { SessionStats } from "../types";
import { Finding } from "./types";
import { W1_RESENT_SHARE_THRESHOLD, W1_HIGH_SEVERITY_THRESHOLD } from "./thresholds";

/**
 * W1 — high resent-context share (TRD §3.2). This is the PRD's hero
 * diagnosis and also its riskiest: resent context is frequently the cache
 * working correctly, not waste (PRD §1, §7a), so this finding is a
 * hypothesis about a raw measurement, never a claim on its own. Validation.md
 * V-C is the open question of whether cache_read_share separates wasteful
 * from healthy sessions *at all* — if it doesn't, this finding gets
 * redesigned around whatever signal does, per that doc.
 */
export function findW1HighResentShare(stats: SessionStats): Finding[] {
  if (stats.totals.total === 0) return [];

  const share = stats.totals.cacheRead / stats.totals.total;
  if (share < W1_RESENT_SHARE_THRESHOLD) return [];

  const pct = Math.round(share * 100);
  return [
    {
      id: "W1",
      status: "hypothesis",
      severity: share >= W1_HIGH_SEVERITY_THRESHOLD ? "high" : "warn",
      title: "High resent-context share",
      detail: `${pct}% of this session's tokens are previously-seen context being resent.`,
      recommendation: `Over ${pct}% of this session's tokens are previously-seen context being resent. Starting a fresh session for the next task would reset this.`,
      evidence: { resentSharePct: pct, cacheReadTokens: stats.totals.cacheRead, totalTokens: stats.totals.total },
      confidence: "uncalibrated",
    },
  ];
}
