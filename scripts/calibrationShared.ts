import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/** Same one-way hash used by calibrate.ts and generateLabelingSheet.ts, so their outputs join on session_id. */
export function hashSessionId(relativePath: string): string {
  return crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 16);
}

export function findSessionFiles(projectsDir: string): Array<{ filePath: string; relativePath: string; projectDir: string }> {
  const results: Array<{ filePath: string; relativePath: string; projectDir: string }> = [];
  if (!fs.existsSync(projectsDir)) return results;

  for (const projectDir of fs.readdirSync(projectsDir)) {
    const full = path.join(projectsDir, projectDir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith(".jsonl")) continue;
      results.push({ filePath: path.join(full, file), relativePath: path.join(projectDir, file), projectDir });
    }
  }
  return results;
}

export function toCsvRow(values: (string | number)[]): string {
  return values
    .map((v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}
