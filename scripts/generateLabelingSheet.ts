/**
 * Generates the blind-labeling sheet (Validation.md Step 2): one row per
 * real session with just enough human-readable context to jog memory
 * (project, date, rough size) — deliberately NO computed signals (cache
 * share, repeat-read counts, cost, etc). You label each session from
 * memory of the experience BEFORE ever seeing calibrate.ts's output, so
 * the signals can't contaminate the judgment.
 *
 * Usage: npm run labeling-sheet -- [dir] [--out file.csv]
 * Default dir: ~/.claude/projects
 *
 * Fill in the `label` column with exactly one of: wasteful | healthy | unsure
 * per Validation.md's definitions:
 *   wasteful — "I remember redoing work, the agent thrashed, it re-read
 *               things it already knew, I got a worse result than the
 *               effort implied"
 *   healthy  — "the effort felt proportionate to what I got, regardless
 *               of what it cost"
 *   unsure   — excluded from scoring
 *
 * This sheet contains project names and is local-only tooling: it is NOT
 * the thing Validation.md describes as safe to donate (that's
 * calibrate.ts's output, which is hashed and signal-only). Keep this file
 * out of version control (see .gitignore).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseSession } from "../src/ingestion/parser";
import { hashSessionId, findSessionFiles, toCsvRow } from "./calibrationShared";

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const dirArg = args.find((a, i) => a !== "--out" && args[i - 1] !== "--out");
  const projectsDir = dirArg ?? path.join(os.homedir(), ".claude", "projects");

  const files = findSessionFiles(projectsDir);
  const rows: string[] = [["session_id", "project", "file_modified", "turns", "duration_min", "label"].join(",")];

  for (const { filePath, relativePath, projectDir } of files) {
    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const stats = parseSession(text);
    if (stats.turnCount === 0) continue;

    const timestamps = stats.turns.map((t) => Date.parse(t.timestamp)).filter((ms) => !Number.isNaN(ms));
    const durationMin =
      timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : 0;
    const modified = fs.statSync(filePath).mtime.toISOString().slice(0, 16).replace("T", " ");

    rows.push(toCsvRow([hashSessionId(relativePath), projectDir, modified, stats.turnCount, durationMin, ""]));
  }

  const csv = rows.join("\n") + "\n";
  const target = outFile ?? "fixtures/calibration/labels.csv";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, csv);
  console.log(`Wrote ${rows.length - 1} sessions to ${target}`);
  console.log(`Fill in the "label" column with: wasteful | healthy | unsure — then run calibrate to build the signal side.`);
}

main();
