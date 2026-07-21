import { SessionStats } from "../types";
import { SessionAccumulator } from "./sessionAccumulator";

/**
 * Parses a full Claude Code session JSONL text into SessionStats.
 * Never throws: malformed lines are skipped and counted.
 *
 * This is a thin wrapper over SessionAccumulator, the same engine the live
 * Tailer uses, so one-shot and incremental parsing can never drift apart.
 */
export function parseSession(jsonlText: string): SessionStats {
  const accumulator = new SessionAccumulator();
  for (const line of jsonlText.split("\n")) {
    accumulator.ingestLine(line);
  }
  return accumulator.getStats();
}
