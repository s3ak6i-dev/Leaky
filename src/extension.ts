import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { locateSessionFile, defaultClaudeHome } from "./ingestion/sessionLocator";
import { Tailer } from "./ingestion/tailer";
import { SessionStats } from "./types";
import { BurndownPanel } from "./webview/burndownPanel";

let statusBarItem: vscode.StatusBarItem;
let pollHandle: ReturnType<typeof setInterval> | undefined;
let latestSessionPath: string | undefined;
let latestStats: SessionStats | undefined;
let extensionContext: vscode.ExtensionContext;

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

/** Starts (or restarts, for a manually-picked file) tailing a session path. */
function startTailing(sessionPath: string) {
  if (pollHandle) clearInterval(pollHandle);

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
}

/** Finds a workspace's session file without letting a filesystem error break activation (TRD §6 failure posture). */
function tryLocateSessionFile(workspacePath: string, claudeHome: string | undefined): string | undefined {
  try {
    return locateSessionFile(workspacePath, claudeHome);
  } catch (err) {
    console.error("Leaky: failed to locate session file", err);
    return undefined;
  }
}

interface SessionPickItem extends vscode.QuickPickItem {
  filePath?: string; // undefined only for the "Browse..." entry
  mtime?: number;
}

/** QP1 (UISpec §8): every .jsonl under Claude home, grouped by project dir, newest first. */
function listSessionFiles(claudeHome: string): SessionPickItem[] {
  const projectsDir = path.join(claudeHome, "projects");
  const items: SessionPickItem[] = [];
  try {
    if (!fs.existsSync(projectsDir)) return items;
    for (const projectDir of fs.readdirSync(projectsDir)) {
      const full = path.join(projectsDir, projectDir);
      let entries: string[];
      try {
        entries = fs.readdirSync(full).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of entries) {
        const filePath = path.join(full, file);
        const stat = fs.statSync(filePath);
        const minutesAgo = Math.round((Date.now() - stat.mtimeMs) / 60000);
        items.push({
          label: file,
          description: projectDir,
          detail: `modified ${minutesAgo} min ago · ${(stat.size / 1024 / 1024).toFixed(1)} MB`,
          filePath,
          mtime: stat.mtimeMs,
        });
      }
    }
  } catch (err) {
    console.error("Leaky: failed to list session files", err);
  }
  return items.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
}

async function selectSessionFileManually() {
  const claudeHomeOverride = vscode.workspace.getConfiguration("leaky").get<string>("claudeHome", "");
  const claudeHome = claudeHomeOverride || defaultClaudeHome();

  const items = listSessionFiles(claudeHome);
  const browseItem: SessionPickItem = { label: "$(folder-opened) Browse for file…" };
  const picked = await vscode.window.showQuickPick([...items, browseItem], {
    placeHolder: "Select a Claude Code session file",
    matchOnDescription: true,
  });
  if (!picked) return;

  let filePath = picked.filePath;
  if (!filePath) {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "JSONL files": ["jsonl"] },
    });
    filePath = uris?.[0]?.fsPath;
  }
  if (!filePath) return;

  startTailing(filePath);
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "leaky.showBurndown";
  context.subscriptions.push(statusBarItem);
  renderIdle();
  statusBarItem.show();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const claudeHomeOverride = vscode.workspace.getConfiguration("leaky").get<string>("claudeHome", "");
  const sessionPath = workspaceFolder
    ? tryLocateSessionFile(workspaceFolder, claudeHomeOverride || undefined)
    : undefined;

  if (sessionPath) {
    startTailing(sessionPath);
  }

  context.subscriptions.push({ dispose: () => pollHandle && clearInterval(pollHandle) });

  context.subscriptions.push(
    vscode.commands.registerCommand("leaky.showBurndown", () => {
      const panel = BurndownPanel.createOrShow(extensionContext.extensionUri);
      if (latestSessionPath && latestStats) {
        panel.update(latestSessionPath, latestStats);
      }
    }),
    vscode.commands.registerCommand("leaky.selectSessionFile", () => {
      selectSessionFileManually();
    })
  );
}

export function deactivate() {
  if (pollHandle) clearInterval(pollHandle);
}
