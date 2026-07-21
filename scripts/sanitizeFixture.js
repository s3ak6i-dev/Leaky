// One-off script: reads a real Claude Code session JSONL and writes a
// sanitized copy to fixtures/real/ — same line-by-line structure and usage
// numbers, all text/paths/commands stripped. Not part of the build.
const fs = require("fs");

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath) {
  console.error("usage: node sanitizeFixture.js <src.jsonl> <out.jsonl>");
  process.exit(1);
}

const lines = fs.readFileSync(srcPath, "utf-8").split("\n").filter(Boolean);
const out = [];

for (const line of lines) {
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    out.push("{not valid json"); // preserve a malformed-line case
    continue;
  }
  const type = d.type;
  if (type === "assistant") {
    const msg = d.message || {};
    const content = Array.isArray(msg.content) ? msg.content : [];
    const sanitizedContent = content.map((b) => {
      if (b && b.type === "tool_use") {
        return { type: "tool_use", id: "toolu_redacted", name: b.name, input: {} };
      }
      if (b && b.type === "text") return { type: "text", text: "" };
      if (b && b.type === "thinking") return { type: "thinking", thinking: "" };
      return { type: b?.type ?? "unknown" };
    });
    out.push(
      JSON.stringify({
        type: "assistant",
        timestamp: d.timestamp,
        message: {
          id: msg.id,
          model: msg.model,
          usage: msg.usage,
          content: sanitizedContent,
        },
      })
    );
  } else {
    // non-assistant lines: keep only the type tag, drop everything else
    out.push(JSON.stringify({ type: type ?? "unknown" }));
  }
}

fs.writeFileSync(outPath, out.join("\n") + "\n");
console.log(`wrote ${out.length} lines to ${outPath}`);
