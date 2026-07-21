import { SessionStats, Turn } from "../types";
import { ratesForModel } from "../pricing";

export interface ChartBar {
  label: string;
  fresh: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  totalTokens: number;
  costUsd: number;
  toolNames: string[];
}

function barFromTurns(turns: Turn[], label: string): ChartBar {
  let fresh = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let output = 0;
  let costUsd = 0;
  const toolNames = new Set<string>();

  for (const turn of turns) {
    fresh += turn.usage.input;
    cacheWrite += turn.usage.cacheCreate;
    cacheRead += turn.usage.cacheRead;
    output += turn.usage.output;
    const rates = ratesForModel(turn.model);
    costUsd +=
      (turn.usage.input / 1_000_000) * rates.input +
      (turn.usage.cacheCreate / 1_000_000) * rates.cacheWrite +
      (turn.usage.cacheRead / 1_000_000) * rates.cacheRead +
      (turn.usage.output / 1_000_000) * rates.output;
    for (const call of turn.toolCalls) toolNames.add(call.name);
  }

  return {
    label,
    fresh,
    cacheWrite,
    cacheRead,
    output,
    totalTokens: fresh + cacheWrite + cacheRead + output,
    costUsd,
    toolNames: [...toolNames],
  };
}

/**
 * Builds the burn-down chart's bars from turns, applying the density rule
 * (UISpec §S2.b): at or below `threshold` turns, one bar per turn; above
 * it, adjacent turns are aggregated into buckets so the chart never renders
 * more than `threshold` bars.
 */
export function buildChartBars(stats: SessionStats, threshold = 300): ChartBar[] {
  const turns = stats.turns;
  if (turns.length <= threshold) {
    return turns.map((t, i) => barFromTurns([t], `Turn ${i + 1}`));
  }

  const bucketSize = Math.ceil(turns.length / threshold);
  const bars: ChartBar[] = [];
  for (let start = 0; start < turns.length; start += bucketSize) {
    const end = Math.min(start + bucketSize, turns.length);
    const label = end - start === 1 ? `Turn ${start + 1}` : `Turns ${start + 1}–${end}`;
    bars.push(barFromTurns(turns.slice(start, end), label));
  }
  return bars;
}
