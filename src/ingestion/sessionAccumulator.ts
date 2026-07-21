import { SessionStats, Turn, ToolCall, Usage } from "../types";

/**
 * PARSER-RECON verdict (see fixtures/real/RECONCILIATION.md):
 * usage is per-turn, not cumulative. Evidence: cache_creation_input_tokens
 * (and occasionally cache_read_input_tokens) DECREASES between consecutive
 * turns in every real session checked — a cumulative counter cannot decrease.
 * The TRD's original "monotonic non-decreasing => cumulative" heuristic is
 * insufficient on its own: per-turn cache_read is *expected* to trend upward
 * as an agentic session's context grows, so a monotonic run is inconclusive.
 * A single observed decrease, however, positively falsifies "cumulative".
 */
function detectUsageMode(cacheCreateSeq: number[], cacheReadSeq: number[]): {
  mode: "per-turn" | "cumulative";
  confidence: "confirmed" | "assumed";
} {
  for (let i = 1; i < cacheCreateSeq.length; i++) {
    if (cacheCreateSeq[i] < cacheCreateSeq[i - 1] || cacheReadSeq[i] < cacheReadSeq[i - 1]) {
      return { mode: "per-turn", confidence: "confirmed" };
    }
  }
  // No decrease observed (short or unusually monotonic session): can't rule
  // out cumulative from this signal alone. Default to per-turn (the
  // confirmed behavior on every real session studied) but flag as assumed.
  return { mode: "per-turn", confidence: "assumed" };
}

function extractToolCalls(content: unknown): ToolCall[] {
  if (!Array.isArray(content)) return [];
  const calls: ToolCall[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as any).type === "tool_use") {
      const name = (block as any).name as string;
      const input = (block as any).input ?? {};
      const target = input.file_path ?? input.path ?? input.command ?? undefined;
      calls.push({ name, target });
    }
  }
  return calls;
}

function toUsage(raw: any): Usage {
  return {
    input: raw?.input_tokens ?? 0,
    cacheCreate: raw?.cache_creation_input_tokens ?? 0,
    cacheRead: raw?.cache_read_input_tokens ?? 0,
    output: raw?.output_tokens ?? 0,
  };
}

/**
 * Holds running SessionStats state and folds new JSONL lines into it one at
 * a time. This is the single source of truth for line-parsing rules (TRD
 * §2.3) — both the one-shot `parseSession` and the incremental `Tailer` are
 * built on top of it, so they can never drift apart.
 *
 * All computation here is incremental: ingestLine is O(1) amortized, and the
 * full line history is never re-walked (TRD §1) — turns are keyed by id in a
 * Map, and totals/usage-mode are recomputed from the (small) turn list on
 * getStats(), not from raw lines.
 */
export class SessionAccumulator {
  private turnsById = new Map<string, Turn>();
  private linesByType: Record<string, number> = {};
  private skippedLines = 0;
  private totalLines = 0;
  private cacheCreateSeq: number[] = [];
  private cacheReadSeq: number[] = [];

  /** Never throws: malformed lines are skipped and counted. */
  ingestLine(line: string): void {
    if (line.trim().length === 0) return;
    this.totalLines++;

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.skippedLines++;
      return;
    }

    const type = typeof parsed?.type === "string" ? parsed.type : "unknown";
    this.linesByType[type] = (this.linesByType[type] ?? 0) + 1;

    if (type !== "assistant") return;

    const message = parsed.message ?? {};
    const id = message.id;
    if (!id || typeof id !== "string") return;
    if (this.turnsById.has(id)) return; // coalesce: same turn re-emitted across streaming/tool-loop lines

    const usage = toUsage(message.usage);
    this.turnsById.set(id, {
      id,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
      model: typeof message.model === "string" ? message.model : "unknown",
      usage,
      toolCalls: extractToolCalls(message.content),
    });
    this.cacheCreateSeq.push(usage.cacheCreate);
    this.cacheReadSeq.push(usage.cacheRead);
  }

  getStats(): SessionStats {
    const turns = [...this.turnsById.values()];
    const totals = turns.reduce(
      (acc, t) => {
        acc.input += t.usage.input;
        acc.cacheCreate += t.usage.cacheCreate;
        acc.cacheRead += t.usage.cacheRead;
        acc.output += t.usage.output;
        return acc;
      },
      { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 }
    );

    const { mode, confidence } = detectUsageMode(this.cacheCreateSeq, this.cacheReadSeq);

    return {
      turns,
      totals: { ...totals, total: totals.input + totals.cacheCreate + totals.cacheRead + totals.output },
      turnCount: turns.length,
      totalLines: this.totalLines,
      skippedLines: this.skippedLines,
      linesByType: this.linesByType,
      usageMode: mode,
      usageModeConfidence: confidence,
    };
  }
}
