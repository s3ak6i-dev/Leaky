import { SessionStats } from "../types";
import { Finding } from "./types";
import { findW2RepeatedReads } from "./w2RepeatedReads";

const ALL_FINDERS: Array<(stats: SessionStats) => Finding[]> = [findW2RepeatedReads];

export function runFindings(stats: SessionStats): Finding[] {
  return ALL_FINDERS.flatMap((finder) => finder(stats));
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
