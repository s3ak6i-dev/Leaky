import * as vscode from "vscode";
import * as fs from "fs";
import { locateSessionFile } from "./ingestion/sessionLocator";
import { parseSession } from "./ingestion/parser";

let statusBarItem: vscode.StatusBarItem;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function refresh(sessionPath: string | undefined) {
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    statusBarItem.text = "$(graph) Leaky: no session";
    statusBarItem.tooltip = "No Claude Code session found for this workspace.";
    return;
  }
  const stats = parseSession(fs.readFileSync(sessionPath, "utf-8"));
  const resent = stats.totals.total > 0 ? Math.round((stats.totals.cacheRead / stats.totals.total) * 100) : 0;
  statusBarItem.text = `$(flame) ${formatTokens(stats.totals.total)} tok · ${resent}% resent`;
  statusBarItem.tooltip = `${sessionPath}\n${stats.turnCount} turns · usageMode: ${stats.usageMode} (${stats.usageModeConfidence})`;
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "leaky.showBurndown";
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const sessionPath = workspaceFolder ? locateSessionFile(workspaceFolder) : undefined;
  refresh(sessionPath);

  context.subscriptions.push(
    vscode.commands.registerCommand("leaky.showBurndown", () => {
      vscode.window.showInformationMessage("Leaky burn-down panel: coming soon.");
    })
  );
}

export function deactivate() {}
