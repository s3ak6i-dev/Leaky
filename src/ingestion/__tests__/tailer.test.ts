import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Tailer } from "../tailer";

function turnLine(id: string, cacheCreate: number, cacheRead: number): string {
  return JSON.stringify({
    type: "assistant",
    message: { id, model: "claude-sonnet-5", usage: { cache_creation_input_tokens: cacheCreate, cache_read_input_tokens: cacheRead } },
  });
}

describe("Tailer", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "leaky-tailer-"));
    filePath = path.join(dir, "session.jsonl");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns false and reports zero stats when the file doesn't exist yet", () => {
    const tailer = new Tailer(filePath);
    expect(tailer.tick()).toBe(false);
    expect(tailer.getStats().turnCount).toBe(0);
  });

  it("ingests complete lines written before the first tick", () => {
    fs.writeFileSync(filePath, turnLine("a", 10, 5) + "\n" + turnLine("b", 20, 15) + "\n");
    const tailer = new Tailer(filePath);
    expect(tailer.tick()).toBe(true);
    expect(tailer.getStats().turnCount).toBe(2);
  });

  it("holds back a partial trailing line until it's completed by a later append", () => {
    fs.writeFileSync(filePath, turnLine("a", 10, 5)); // no trailing newline: mid-write
    const tailer = new Tailer(filePath);
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(0); // held back, not yet parsed

    fs.appendFileSync(filePath, "\n" + turnLine("b", 20, 15) + "\n");
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(2); // both lines now complete
  });

  it("only reads the delta on each tick, not the whole file", () => {
    fs.writeFileSync(filePath, turnLine("a", 10, 5) + "\n");
    const tailer = new Tailer(filePath);
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(1);

    fs.appendFileSync(filePath, turnLine("b", 20, 15) + "\n");
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(2);

    fs.appendFileSync(filePath, turnLine("c", 30, 25) + "\n");
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(3);
  });

  it("does not double-count a turn re-emitted across multiple lines with the same id", () => {
    fs.writeFileSync(filePath, turnLine("a", 10, 5) + "\n");
    const tailer = new Tailer(filePath);
    tailer.tick();

    fs.appendFileSync(filePath, turnLine("a", 10, 5) + "\n"); // same id, streamed re-emission
    tailer.tick();

    expect(tailer.getStats().turnCount).toBe(1);
  });

  it("resets and re-reads from scratch when the file shrinks (rotation/truncation)", () => {
    fs.writeFileSync(filePath, turnLine("a", 10, 5) + "\n" + turnLine("b", 20, 15) + "\n");
    const tailer = new Tailer(filePath);
    tailer.tick();
    expect(tailer.getStats().turnCount).toBe(2);

    // Simulate rotation: a new, shorter session file appears at the same path.
    fs.writeFileSync(filePath, turnLine("c", 1, 1) + "\n");
    tailer.tick();

    expect(tailer.getStats().turnCount).toBe(1);
    expect(tailer.getStats().turns[0].id).toBe("c");
  });

  it("never throws across a realistic append/truncate sequence", () => {
    const tailer = new Tailer(filePath);
    expect(() => {
      tailer.tick(); // missing file
      fs.writeFileSync(filePath, "not json\n");
      tailer.tick(); // malformed line
      fs.appendFileSync(filePath, turnLine("a", 10, 5));
      tailer.tick(); // partial line (no trailing newline)
      fs.appendFileSync(filePath, "\n");
      tailer.tick(); // completes it
      fs.writeFileSync(filePath, "");
      tailer.tick(); // truncated to empty
    }).not.toThrow();
    expect(tailer.getStats().turnCount).toBe(0);
  });
});
