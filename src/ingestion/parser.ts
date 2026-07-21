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
 * Parses a full Claude Code session JSONL text into SessionStats.
 * Never throws: malformed lines are skipped and counted.
 */
export function parseSession(jsonlText: string): SessionStats {
  const lines = jsonlText.split("\n").filter((l) => l.trim().length > 0);
  const linesByType: Record<string, number> = {};
  let skippedLines = 0;

  const turnsById = new Map<string, Turn>();
  const cacheCreateSeq: number[] = [];
  const cacheReadSeq: number[] = [];

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      skippedLines++;
      continue;
    }

    const type = typeof parsed?.type === "string" ? parsed.type : "unknown";
    linesByType[type] = (linesByType[type] ?? 0) + 1;

    if (type !== "assistant") continue;

    const message = parsed.message ?? {};
    const id = message.id;
    if (!id || typeof id !== "string") continue;
    if (turnsById.has(id)) continue; // coalesce: same turn re-emitted across streaming/tool-loop lines

    const usage = toUsage(message.usage);
    turnsById.set(id, {
      id,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
      model: typeof message.model === "string" ? message.model : "unknown",
      usage,
      toolCalls: extractToolCalls(message.content),
    });
    cacheCreateSeq.push(usage.cacheCreate);
    cacheReadSeq.push(usage.cacheRead);
  }

  const turns = [...turnsById.values()];
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

  const { mode, confidence } = detectUsageMode(cacheCreateSeq, cacheReadSeq);

  return {
    turns,
    totals: { ...totals, total: totals.input + totals.cacheCreate + totals.cacheRead + totals.output },
    turnCount: turns.length,
    totalLines: lines.length,
    skippedLines,
    linesByType,
    usageMode: mode,
    usageModeConfidence: confidence,
  };
}
