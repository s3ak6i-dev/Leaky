import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export function defaultClaudeHome(): string {
  return path.join(os.homedir(), ".claude");
}

function encodeWorkspacePath(workspacePath: string): string {
  return workspacePath.replace(/[\\/:]/g, "-");
}

function newestJsonl(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.full;
}

/**
 * F1: locate the most-recent session JSONL for a workspace.
 * Primary: encode the workspace path into the project-dir naming scheme.
 * Fallback: scan all project dirs for the globally most-recent .jsonl,
 * since the encoding scheme is reconstructed from observation (TRD §2.1).
 */
export function locateSessionFile(workspacePath: string, claudeHome = defaultClaudeHome()): string | undefined {
  const projectsDir = path.join(claudeHome, "projects");

  const encoded = encodeWorkspacePath(workspacePath);
  const primary = newestJsonl(path.join(projectsDir, encoded));
  if (primary) return primary;

  if (!fs.existsSync(projectsDir)) return undefined;
  let best: { full: string; mtime: number } | undefined;
  for (const dir of fs.readdirSync(projectsDir)) {
    const full = newestJsonl(path.join(projectsDir, dir));
    if (!full) continue;
    const mtime = fs.statSync(full).mtimeMs;
    if (!best || mtime > best.mtime) best = { full, mtime };
  }
  return best?.full;
}
