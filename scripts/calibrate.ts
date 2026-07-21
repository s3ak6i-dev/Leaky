/**
 * The `calibrate` CLI (TRD §3.4 engineering contract): ingests a directory
 * of real Claude Code session logs and emits one CSV row per session
 * containing every candidate signal (Validation.md Step 3's table). This
 * shares the production parser (parseSession) so calibration and product
 * can never drift apart — the only extra parsing here is for signals the
 * production ingestion layer doesn't need yet (tool-result sizes,
 * compaction boundaries), kept local to this script.
 *
 * Usage: npm run calibrate -- [dir] [--out file.csv]
 * Default dir: ~/.claude/projects
 *
 * Privacy: no message text or file paths ever leave this script. Each
 * session gets a session_id derived from a one-way hash of its file path
 * (Validation.md: "paths are hashed") — stable across runs, but not
 * reversible to the path, so this CSV is the thing Validation.md's corpus
 * step describes as safe to donate.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseSession } from "../src/ingestion/parser";
import { estimateCostUsd } from "../src/pricing";
import { W2_MIN_REPEAT_COUNT } from "../src/findings/thresholds";
import { hashSessionId, findSessionFiles, toCsvRow } from "./calibrationShared";

const RELEVANT_TOOLS = new Set(["Read", "Edit"]);
const NAVIGATION_TOOLS = new Set(["Read", "Grep", "Glob"]);

interface RawLineExtras {
  compactionTurnIndices: number[]; // index into the coalesced turn list, approximated by line order
  toolResultCharSizes: number[];
}

function scanRawExtras(jsonlText: string): RawLineExtras {
  const compactionTurnIndices: number[] = [];
  const toolResultCharSizes: number[] = [];
  let turnIndex = -1;
  const seenTurnIds = new Set<string>();

  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === "assistant") {
      const id = parsed.message?.id;
      if (id && !seenTurnIds.has(id)) {
        seenTurnIds.add(id);
        turnIndex++;
      }
      continue;
    }

    if (parsed.type === "system" && parsed.subtype === "compact_boundary") {
      compactionTurnIndices.push(turnIndex);
      continue;
    }

    if (parsed.type === "user" && parsed.toolUseResult !== undefined) {
      toolResultCharSizes.push(JSON.stringify(parsed.toolUseResult).length);
    }
  }

  return { compactionTurnIndices, toolResultCharSizes };
}

function longestStretch(turnCount: number, compactionTurnIndices: number[]): number {
  if (compactionTurnIndices.length === 0) return turnCount;
  const boundaries = [0, ...compactionTurnIndices, turnCount];
  let longest = 0;
  for (let i = 1; i < boundaries.length; i++) {
    longest = Math.max(longest, boundaries[i] - boundaries[i - 1]);
  }
  return longest;
}

const CSV_COLUMNS = [
  "session_id",
  "total_tokens",
  "turns",
  "duration_min",
  "cache_read_share",
  "max_repeat_read_count",
  "repeat_read_file_count",
  "largest_tool_result_chars",
  "total_tool_result_chars",
  "longest_stretch_turns",
  "opus_share_of_navigation_turns",
  "compaction_events_detected",
  "est_cost_usd",
  "skipped_lines",
  "total_lines",
  "usage_mode",
] as const;

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const dirArg = args.find((a, i) => a !== "--out" && args[i - 1] !== "--out");
  const projectsDir = dirArg ?? path.join(os.homedir(), ".claude", "projects");

  const files = findSessionFiles(projectsDir);
  const rows: string[] = [CSV_COLUMNS.join(",")];
  let skipped = 0;

  for (const { filePath, relativePath } of files) {
    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      skipped++;
      continue;
    }

    const stats = parseSession(text);
    if (stats.turnCount === 0) continue;

    const { compactionTurnIndices, toolResultCharSizes } = scanRawExtras(text);

    const countByTarget = new Map<string, number>();
    let navigationTurns = 0;
    let opusNavigationTurns = 0;
    for (const turn of stats.turns) {
      for (const call of turn.toolCalls) {
        if (call.target && RELEVANT_TOOLS.has(call.name)) {
          countByTarget.set(call.target, (countByTarget.get(call.target) ?? 0) + 1);
        }
      }
      const isNavigation = turn.toolCalls.length > 0 && turn.toolCalls.every((c) => NAVIGATION_TOOLS.has(c.name));
      if (isNavigation) {
        navigationTurns++;
        if (turn.model.toLowerCase().includes("opus")) opusNavigationTurns++;
      }
    }
    const repeatCounts = [...countByTarget.values()];
    const maxRepeatReadCount = repeatCounts.length ? Math.max(...repeatCounts) : 0;
    const repeatReadFileCount = repeatCounts.filter((c) => c >= W2_MIN_REPEAT_COUNT).length;

    const timestamps = stats.turns.map((t) => Date.parse(t.timestamp)).filter((ms) => !Number.isNaN(ms));
    const durationMin =
      timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : 0;

    const cacheReadShare = stats.totals.total > 0 ? stats.totals.cacheRead / stats.totals.total : 0;

    rows.push(
      toCsvRow([
        hashSessionId(relativePath),
        stats.totals.total,
        stats.turnCount,
        durationMin,
        cacheReadShare.toFixed(4),
        maxRepeatReadCount,
        repeatReadFileCount,
        toolResultCharSizes.length ? Math.max(...toolResultCharSizes) : 0,
        toolResultCharSizes.reduce((a, b) => a + b, 0),
        longestStretch(stats.turnCount, compactionTurnIndices),
        navigationTurns > 0 ? (opusNavigationTurns / navigationTurns).toFixed(4) : "0",
        compactionTurnIndices.length,
        estimateCostUsd(stats).toFixed(4),
        stats.skippedLines,
        stats.totalLines,
        stats.usageMode,
      ])
    );
  }

  const csv = rows.join("\n") + "\n";
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, csv);
    console.log(`Wrote ${rows.length - 1} sessions to ${outFile} (${skipped} unreadable files skipped)`);
  } else {
    process.stdout.write(csv);
  }
}

main();
