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

/** Parses a CSV written by toCsvRow (handles quoted fields with embedded commas/quotes). Returns rows of raw string cells, header included. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** Parses a CSV into an array of objects keyed by its header row. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const [header, ...rest] = rows;
  return rest.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}
