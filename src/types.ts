export interface ToolCall {
  name: string;
  target?: string;
}

export interface Usage {
  input: number;
  cacheCreate: number;
  cacheRead: number;
  output: number;
}

export interface Turn {
  id: string;
  timestamp: string;
  model: string;
  usage: Usage;
  toolCalls: ToolCall[];
}

export type UsageMode = "per-turn" | "cumulative";

export interface SessionStats {
  turns: Turn[];
  totals: Usage & { total: number };
  turnCount: number;
  totalLines: number;
  skippedLines: number;
  linesByType: Record<string, number>;
  usageMode: UsageMode;
  usageModeConfidence: "confirmed" | "assumed";
}
