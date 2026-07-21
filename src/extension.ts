import * as vscode from "vscode";
import { locateSessionFile } from "./ingestion/sessionLocator";
import { Tailer } from "./ingestion/tailer";
import { SessionStats } from "./types";
import { BurndownPanel } from "./webview/burndownPanel";

let statusBarItem: vscode.StatusBarItem;
let pollHandle: ReturnType<typeof setInterval> | undefined;
let latestSessionPath: string | undefined;
let latestStats: SessionStats | undefined;

const STALE_MS = 10 * 60 * 1000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function renderIdle() {
  statusBarItem.text = "$(graph) Leaky: no session";
  statusBarItem.tooltip =
    "No Claude Code session found for this workspace. Click to open Leaky, or run 'Leaky: Select Session File Manually'.";
  statusBarItem.backgroundColor = undefined;
}

function renderLive(sessionPath: string, stats: SessionStats, lastActivityAt: number) {
  const resent = stats.totals.total > 0 ? Math.round((stats.totals.cacheRead / stats.totals.total) * 100) : 0;
  const isStale = Date.now() - lastActivityAt > STALE_MS;
  const degraded = stats.totalLines > 0 && stats.skippedLines / stats.totalLines > 0.2;

  const icon = degraded ? "$(warning)" : "$(flame)";
  statusBarItem.text = `${icon} ${formatTokens(stats.totals.total)} tok · ${resent}% resent`;
  if (isStale) statusBarItem.text += " (idle)";

  const lines = [
    sessionPath,
    `${stats.turnCount} turns · usageMode: ${stats.usageMode} (${stats.usageModeConfidence})`,
  ];
  if (degraded) lines.push(`degraded parse: ${stats.skippedLines}/${stats.totalLines} lines skipped`);
  statusBarItem.tooltip = lines.join("\n");
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "leaky.showBurndown";
  context.subscriptions.push(statusBarItem);
  renderIdle();
  statusBarItem.show();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const claudeHomeOverride = vscode.workspace.getConfiguration("leaky").get<string>("claudeHome", "");
  const sessionPath = workspaceFolder
    ? locateSessionFile(workspaceFolder, claudeHomeOverride || undefined)
    : undefined;

  if (sessionPath) {
    const tailer = new Tailer(sessionPath);
    let lastActivityAt = Date.now();
    let lastTurnCount = 0;

    const poll = () => {
      const found = tailer.tick();
      if (!found) {
        renderIdle();
        return;
      }
      const stats = tailer.getStats();
      if (stats.turnCount > lastTurnCount) lastActivityAt = Date.now();
      lastTurnCount = stats.turnCount;
      renderLive(sessionPath, stats, lastActivityAt);

      latestSessionPath = sessionPath;
      latestStats = stats;
      BurndownPanel.getOpen()?.update(sessionPath, stats);
    };

    poll();
    const intervalMs = vscode.workspace.getConfiguration("leaky").get<number>("pollIntervalMs", 1500);
    pollHandle = setInterval(poll, intervalMs);
    context.subscriptions.push({ dispose: () => pollHandle && clearInterval(pollHandle) });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("leaky.showBurndown", () => {
      const panel = BurndownPanel.createOrShow(context.extensionUri);
      if (latestSessionPath && latestStats) {
        panel.update(latestSessionPath, latestStats);
      }
    })
  );
}

export function deactivate() {
  if (pollHandle) clearInterval(pollHandle);
}
