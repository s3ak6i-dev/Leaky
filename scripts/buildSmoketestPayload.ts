import { parseSession } from "../src/ingestion/parser";
import { estimateCostUsd, formatCostUsd } from "../src/pricing";
import { buildChartBars } from "../src/webview/chartData";
import { getWebviewHtml } from "../src/webview/html";
import { visibleFindings } from "../src/findings";
import * as fs from "fs";

const text = fs.readFileSync("fixtures/real/session-klados.jsonl", "utf-8");
const stats = parseSession(text);
const costUsd = estimateCostUsd(stats);
const resentPct = Math.round((stats.totals.cacheRead / stats.totals.total) * 100);

// fixtures/real/ has tool_use targets redacted for privacy (see
// scripts/sanitizeFixture.js), so W2 can never fire against them. Splice in
// a synthetic repeated-read turn just for this render check.
stats.turns.push(
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `synthetic-${i}`,
    timestamp: "",
    model: "claude-sonnet-5",
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    toolCalls: [{ name: "Read", target: "src/config.ts" }],
  }))
);

const payload = {
  type: "update",
  sessionPath: "fixtures/real/session-klados.jsonl",
  totals: stats.totals,
  turnCount: stats.turnCount,
  costLabel: formatCostUsd(costUsd),
  resentPct,
  durationLabel: "1h 2m",
  bars: buildChartBars(stats),
  degraded: false,
  skippedLines: stats.skippedLines,
  totalLines: stats.totalLines,
  findings: visibleFindings(stats, true), // showHypothesisFindings=true, so this render check sees everything
};
fs.writeFileSync("scripts/.smoketest-payload.json", JSON.stringify(payload));
fs.writeFileSync("scripts/.smoketest-html.html", getWebviewHtml("testnonce", "'self'"));
console.log("payload + html written");
