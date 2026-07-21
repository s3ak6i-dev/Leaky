import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { locateSessionFile } from "../sessionLocator";

describe("locateSessionFile", () => {
  let claudeHome: string;

  beforeEach(() => {
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "leaky-test-"));
  });

  afterEach(() => {
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  it("finds the newest jsonl in the encoded workspace directory", () => {
    const workspace = "C:\\Users\\dev\\myproj";
    const encoded = workspace.replace(/[\\/:]/g, "-");
    const projectDir = path.join(claudeHome, "projects", encoded);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "old.jsonl"), "{}");
    fs.writeFileSync(path.join(projectDir, "new.jsonl"), "{}");
    // ensure distinct mtimes
    const now = Date.now();
    fs.utimesSync(path.join(projectDir, "old.jsonl"), now / 1000 - 100, now / 1000 - 100);
    fs.utimesSync(path.join(projectDir, "new.jsonl"), now / 1000, now / 1000);

    const found = locateSessionFile(workspace, claudeHome);
    expect(found).toBe(path.join(projectDir, "new.jsonl"));
  });

  it("falls back to the globally newest jsonl when the encoded dir doesn't exist", () => {
    const otherDir = path.join(claudeHome, "projects", "some-other-project");
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(path.join(otherDir, "session.jsonl"), "{}");

    const found = locateSessionFile("C:\\Users\\dev\\unrelated", claudeHome);
    expect(found).toBe(path.join(otherDir, "session.jsonl"));
  });

  it("returns undefined when no session files exist anywhere", () => {
    fs.mkdirSync(path.join(claudeHome, "projects"), { recursive: true });
    const found = locateSessionFile("C:\\Users\\dev\\unrelated", claudeHome);
    expect(found).toBeUndefined();
  });
});
