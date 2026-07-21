import * as fs from "fs";
import { SessionStats } from "../types";
import { SessionAccumulator } from "./sessionAccumulator";

/**
 * Incrementally follows a growing JSONL session file (TRD §2.2).
 *
 * Poll-driven by design (call `tick()` on a timer) rather than fs.watch,
 * which is intentionally avoided for cross-platform inconsistency on
 * rapidly-appended files. Each tick reads only the byte delta since the
 * last tick and folds newly-completed lines into a running SessionAccumulator
 * — the file is never fully re-read after the first tick, except when
 * truncation/rotation is detected.
 */
export class Tailer {
  private offset = 0;
  private partialLine = "";
  private accumulator = new SessionAccumulator();

  constructor(private readonly filePath: string) {}

  /**
   * Reads and ingests any new complete lines since the last tick.
   * Returns true if the file was accessible this tick (false if missing —
   * e.g. no session started yet), matching the "never throw" posture.
   */
  tick(): boolean {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      return false;
    }

    if (stat.size < this.offset) {
      // File shrank: rotation or truncation. Reset and re-read from scratch.
      this.offset = 0;
      this.partialLine = "";
      this.accumulator = new SessionAccumulator();
    }

    if (stat.size === this.offset) return true; // no new bytes

    const length = stat.size - this.offset;
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(this.filePath, "r");
    try {
      fs.readSync(fd, buffer, 0, length, this.offset);
    } finally {
      fs.closeSync(fd);
    }
    this.offset = stat.size;

    const chunk = this.partialLine + buffer.toString("utf-8");
    const lines = chunk.split("\n");
    // The last element is only complete if the chunk ended in a newline;
    // split() always makes it the tail, complete or not, so buffer it and
    // let a future tick finish it once the rest of the line is written.
    this.partialLine = lines.pop() ?? "";

    for (const line of lines) {
      this.accumulator.ingestLine(line.endsWith("\r") ? line.slice(0, -1) : line);
    }

    return true;
  }

  getStats(): SessionStats {
    return this.accumulator.getStats();
  }
}
