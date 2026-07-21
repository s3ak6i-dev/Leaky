import { parseSession } from "../src/ingestion/parser";
import { estimateCostUsd, formatCostUsd } from "../src/pricing";
import { buildChartBars } from "../src/webview/chartData";
import { getWebviewHtml } from "../src/webview/html";
import * as fs from "fs";

const text = fs.readFileSync("fixtures/real/session-klados.jsonl", "utf-8");
const stats = parseSession(text);
const costUsd = estimateCostUsd(stats);
const resentPct = Math.round((stats.totals.cacheRead / stats.totals.total) * 100);
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
};
fs.writeFileSync("scripts/.smoketest-payload.json", JSON.stringify(payload));
fs.writeFileSync("scripts/.smoketest-html.html", getWebviewHtml("testnonce", "'self'"));
console.log("payload + html written");
