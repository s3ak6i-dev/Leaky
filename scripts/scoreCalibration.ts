/**
 * Validation.md Step 4 — threshold scoring. Joins calibrate.ts's signal
 * CSV with the labeled sheet from generateLabelingSheet.ts on session_id,
 * sweeps candidate thresholds per finding, and reports precision/recall
 * with a Wilson 90% confidence interval (not point estimates — Validation.md
 * §2b: point estimates on a small corpus are close to meaningless).
 *
 * Acceptance criterion (Validation.md Step 4): the LOWER BOUND of the
 * Wilson 90% CI for precision >= 0.8, AND recall point estimate >= 0.5.
 * A threshold only gets to claim VALIDATED if the corpus also clears the
 * power floor (§2b: >=40 labeled sessions, >=15 wasteful) — below that,
 * the best this script can say is "would pass, but on too small a
 * corpus to trust," which is not the same as validated.
 *
 * Also runs the mandatory anti-circularity check (§labeling): if
 * |correlation(label, cost)| > 0.7, labels are effectively cost in
 * disguise and the run is circular — reported, not silently ignored.
 *
 * Usage: npm run score-calibration -- [--signals file] [--labels file]
 */
import * as fs from "fs";
import { parseCsvObjects } from "./calibrationShared";

const POWER_FLOOR_TOTAL = 40;
const POWER_FLOOR_WASTEFUL = 15;
const PRECISION_LOWER_BOUND_TARGET = 0.8;
const RECALL_TARGET = 0.5;
const WILSON_Z_90 = 1.6449;

interface FindingConfig {
  id: string;
  title: string;
  column: string; // signals.csv column this finding's trigger is built on
}

// W3 and W6 are excluded here on purpose: W3's chars/4 estimate hasn't
// itself been validated (V-A) and TRD forbids building a T3 claim on an
// unvalidated T2 input; W6's compaction data is real now but the finding
// itself isn't implemented yet. Nothing to score for either.
const FINDINGS: FindingConfig[] = [
  { id: "W1", title: "High resent-context share", column: "cache_read_share" },
  { id: "W2", title: "Repeated file reads", column: "max_repeat_read_count" },
  { id: "W4", title: "Marathon session", column: "longest_stretch_turns" },
  { id: "W5", title: "Premium model on routine turns", column: "opus_share_of_navigation_turns" },
];

function wilsonLowerBound(successes: number, total: number, z = WILSON_Z_90): number {
  if (total === 0) return 0;
  const phat = successes / total;
  const z2 = z * z;
  const center = (phat + z2 / (2 * total)) / (1 + z2 / total);
  const halfWidth = (z / (1 + z2 / total)) * Math.sqrt((phat * (1 - phat)) / total + z2 / (4 * total * total));
  return Math.max(0, center - halfWidth);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

interface ScoredRow {
  sessionId: string;
  label: "wasteful" | "healthy";
  values: Record<string, number>;
  costUsd: number;
}

function loadScoredRows(signalsPath: string, labelsPath: string): { rows: ScoredRow[]; unsureCount: number; unlabeledCount: number } {
  const signals = parseCsvObjects(fs.readFileSync(signalsPath, "utf-8"));
  const labels = parseCsvObjects(fs.readFileSync(labelsPath, "utf-8"));

  const labelById = new Map(labels.map((l) => [l.session_id, l.label.trim().toLowerCase()]));
  const rows: ScoredRow[] = [];
  let unsureCount = 0;
  let unlabeledCount = 0;

  for (const s of signals) {
    const label = labelById.get(s.session_id) ?? "";
    if (label === "wasteful" || label === "healthy") {
      const values: Record<string, number> = {};
      for (const f of FINDINGS) values[f.column] = Number(s[f.column]);
      rows.push({ sessionId: s.session_id, label: label as "wasteful" | "healthy", values, costUsd: Number(s.est_cost_usd) });
    } else if (label === "unsure") {
      unsureCount++;
    } else {
      unlabeledCount++;
    }
  }
  return { rows, unsureCount, unlabeledCount };
}

interface SweepResult {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  precisionLowerBound: number;
  recall: number;
  passes: boolean;
}

function sweepThreshold(rows: ScoredRow[], column: string): SweepResult[] {
  const wastefulCount = rows.filter((r) => r.label === "wasteful").length;
  const candidateThresholds = [...new Set(rows.map((r) => r.values[column]))].sort((a, b) => a - b);

  return candidateThresholds.map((threshold) => {
    let tp = 0;
    let fp = 0;
    for (const row of rows) {
      const flagged = row.values[column] >= threshold;
      if (!flagged) continue;
      if (row.label === "wasteful") tp++;
      else fp++;
    }
    const flaggedTotal = tp + fp;
    const precision = flaggedTotal > 0 ? tp / flaggedTotal : null;
    const precisionLowerBound = wilsonLowerBound(tp, flaggedTotal);
    const recall = wastefulCount > 0 ? tp / wastefulCount : 0;
    const fn = wastefulCount - tp;
    return {
      threshold,
      tp,
      fp,
      fn,
      precision,
      precisionLowerBound,
      recall,
      passes: precisionLowerBound >= PRECISION_LOWER_BOUND_TARGET && recall >= RECALL_TARGET,
    };
  });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const signalsPath = arg("--signals", "fixtures/calibration/signals.csv");
  const labelsPath = arg("--labels", "fixtures/calibration/labels.csv");

  if (!fs.existsSync(signalsPath) || !fs.existsSync(labelsPath)) {
    console.error(`Missing ${!fs.existsSync(signalsPath) ? signalsPath : labelsPath}. Run "npm run calibrate" and "npm run labeling-sheet" first.`);
    process.exit(1);
  }

  const { rows, unsureCount, unlabeledCount } = loadScoredRows(signalsPath, labelsPath);
  const wastefulCount = rows.filter((r) => r.label === "wasteful").length;
  const healthyCount = rows.filter((r) => r.label === "healthy").length;

  if (rows.length === 0) {
    console.log(
      `No labeled sessions yet (${unlabeledCount} rows have an empty label, ${unsureCount} marked "unsure"). ` +
        `Fill in the "label" column in ${labelsPath} with wasteful|healthy, then re-run.`
    );
    return;
  }

  console.log(`=== Calibration scoring ===`);
  console.log(`Labeled: ${rows.length} (${wastefulCount} wasteful, ${healthyCount} healthy) · ${unsureCount} unsure · ${unlabeledCount} unlabeled\n`);

  // Mandatory anti-circularity check (Validation.md §labeling).
  const correlation = pearsonCorrelation(
    rows.map((r) => (r.label === "wasteful" ? 1 : 0)),
    rows.map((r) => r.costUsd)
  );
  console.log(`Label-vs-cost correlation: ${correlation.toFixed(3)}`);
  if (Math.abs(correlation) > 0.7) {
    console.log(
      `  ⚠ |correlation| > 0.7 — labels are effectively cost in disguise. Per Validation.md, this run is circular and its results must be DISCARDED, not used to validate anything.\n`
    );
    return;
  }
  console.log();

  const meetsPowerFloor = rows.length >= POWER_FLOOR_TOTAL && wastefulCount >= POWER_FLOOR_WASTEFUL;
  if (!meetsPowerFloor) {
    console.log(
      `⚠ Below the power floor (need >=${POWER_FLOOR_TOTAL} labeled sessions with >=${POWER_FLOOR_WASTEFUL} wasteful; ` +
        `have ${rows.length} with ${wastefulCount} wasteful). Any threshold below may look like it passes, but per ` +
        `Validation.md §2b it is NOT eligible for "validated" status — ships at most as "uncalibrated" regardless of the numbers.\n`
    );
  }

  for (const finding of FINDINGS) {
    const sweep = sweepThreshold(rows, finding.column);
    console.log(`--- ${finding.id}: ${finding.title} (${finding.column}) ---`);
    console.log("threshold\tTP\tFP\tFN\tprecision\tp-lower90\trecall\tverdict");
    for (const r of sweep) {
      console.log(
        `${r.threshold}\t${r.tp}\t${r.fp}\t${r.fn}\t` +
          `${r.precision === null ? "n/a" : fmtPct(r.precision)}\t${fmtPct(r.precisionLowerBound)}\t${fmtPct(r.recall)}\t` +
          `${r.passes ? "PASS" : "fail"}`
      );
    }
    const passing = sweep.filter((r) => r.passes).sort((a, b) => b.recall - a.recall);
    if (passing.length > 0) {
      const best = passing[0];
      const status = meetsPowerFloor ? "VALIDATED-eligible" : "would pass, but corpus too small — stays uncalibrated";
      console.log(`  => best threshold ${best.threshold}: ${status}`);
    } else {
      console.log(`  => no threshold clears precision-lower-bound>=${fmtPct(PRECISION_LOWER_BOUND_TARGET)} AND recall>=${fmtPct(RECALL_TARGET)} on this corpus`);
    }
    console.log();
  }
}

main();
