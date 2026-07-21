import * as vscode from "vscode";
import { SessionStats } from "../types";
import { estimateCostUsd, formatCostUsd } from "../pricing";
import { buildChartBars } from "./chartData";
import { getWebviewHtml } from "./html";
import { visibleFindings } from "../findings";

function nonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

function formatDuration(turns: SessionStats["turns"]): string {
  const timestamps = turns.map((t) => Date.parse(t.timestamp)).filter((ms) => !Number.isNaN(ms));
  if (timestamps.length < 2) return "0m";
  const spanMs = Math.max(...timestamps) - Math.min(...timestamps);
  const totalMinutes = Math.round(spanMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Manages the singleton burn-down webview panel (S2, UISpec §4). Only one
 * instance is shown at a time; showing it again reveals the existing panel
 * rather than creating a second one (VS Code convention for singleton
 * panels, e.g. output channels).
 */
export class BurndownPanel {
  private static current: BurndownPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel("leakyBurndown", "Leaky — Session Burn-down", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.webview.html = getWebviewHtml(nonce(), this.panel.webview.cspSource);
    this.panel.onDidDispose(() => this.disposeInternal(), null, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): BurndownPanel {
    if (BurndownPanel.current) {
      BurndownPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return BurndownPanel.current;
    }
    const instance = new BurndownPanel(extensionUri);
    BurndownPanel.current = instance;
    return instance;
  }

  /** The open panel instance, if any — for pushing live updates without stealing focus by revealing it. */
  static getOpen(): BurndownPanel | undefined {
    return BurndownPanel.current;
  }

  update(sessionPath: string, stats: SessionStats): void {
    const costUsd = estimateCostUsd(stats);
    const resentPct = stats.totals.total > 0 ? Math.round((stats.totals.cacheRead / stats.totals.total) * 100) : 0;
    const degraded = stats.totalLines > 0 && stats.skippedLines / stats.totalLines > 0.2;
    const showHypothesisFindings = vscode.workspace
      .getConfiguration("leaky")
      .get<boolean>("showHypothesisFindings", false);

    this.panel.webview.postMessage({
      type: "update",
      sessionPath,
      totals: stats.totals,
      turnCount: stats.turnCount,
      costLabel: formatCostUsd(costUsd),
      resentPct,
      durationLabel: formatDuration(stats.turns),
      bars: buildChartBars(stats),
      degraded,
      skippedLines: stats.skippedLines,
      totalLines: stats.totalLines,
      findings: visibleFindings(stats, showHypothesisFindings),
    });
  }

  private disposeInternal(): void {
    BurndownPanel.current = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
