# Leaky — Technical Requirements Document

**Version:** 2.0 (draft) · **Companion docs:** PRD.md (see §0 foundation status), UI-SPEC.md, VALIDATION.md · **Maps to:** feature IDs F1–F11 in the PRD

> **PARSER-RECON status (2026-07-21):** core unknowns resolved against 3 real session logs — see `fixtures/real/RECONCILIATION.md`. `usage` is confirmed per-turn (not cumulative); one logical turn spans multiple JSONL lines and must be coalesced by `message.id`. Both are now implemented in `src/ingestion/parser.ts` and locked in by regression tests. Still open before this fully closes: cross-checking a total against an external ground truth (Anthropic Console billing), not just self-consistency.

---

## 1. Architecture overview

Leaky is a single VS Code extension with no external services. Four layers:

```
┌─────────────────────────────────────────────────────┐
│  UI layer                                           │
│  status bar item · webview panel · quick-pick menus │
├─────────────────────────────────────────────────────┤
│  Analysis layer                                     │
│  SessionStats · WasteFindings · Recommendations     │
├─────────────────────────────────────────────────────┤
│  Ingestion layer                                    │
│  SessionLocator · JSONL tailer · defensive parser   │
├─────────────────────────────────────────────────────┤
│  Storage layer (v0.3+)                              │
│  SQLite session summaries · settings                │
└─────────────────────────────────────────────────────┘
```

All computation is incremental: new JSONL lines are parsed as they arrive and folded into running aggregates; the full session is never re-parsed on each tick after initial load.

## 2. Ingestion layer

### 2.1 Session location (F1)
- Default root: `~/.claude/projects/` (override via `leaky.claudeHome`).
- Primary strategy: encode the workspace's absolute path by replacing path separators with `-`, look for that directory, take the most-recently-modified `.jsonl` inside it.
- Fallback strategy: scan all project directories, take the globally most-recent `.jsonl`. This handles encoding-scheme drift, since the scheme is reconstructed from observation, not documented.
- Manual override: `Leaky: Select Session File Manually` pins a file for the window's lifetime.
- **Requirement:** location logic must be isolated in `sessionLocator.ts` so encoding fixes are one-file patches.

### 2.2 Tailing
- Poll-based (default 1500ms, configurable `leaky.pollIntervalMs`); `fs.watch` is intentionally avoided because of cross-platform inconsistency on rapidly-appended files.
- Track last byte offset; on each tick read only the delta. If file size shrinks (rotation/truncation), reset state and re-read.
- Partial trailing lines (mid-write) must be buffered until a newline completes them, then parsed. (Current v0.0.1 skips malformed lines; v0.2 must buffer instead to avoid dropping the final line of each flush.)

### 2.4 Parser reconciliation (task PARSER-RECON)

**Status: core unknowns resolved (2026-07-21) against 3 real logs — see `fixtures/real/RECONCILIATION.md`.** What was established:

1. **Parse-at-all:** confirmed — all 3 real session files parse to non-empty `SessionStats` with 0 skipped lines.
2. **Usage semantics — the critical unknown.** Resolved: `message.usage` is **per-turn**. The originally proposed heuristic here ("monotonic non-decreasing `input_tokens` across a turn chain ⇒ cumulative") turned out to be insufficient — per-turn `cache_read_input_tokens` is *expected* to trend upward as an agentic session's context grows, so a monotonic run doesn't discriminate the two hypotheses. The signal that actually worked: `cache_creation_input_tokens` (and sometimes `cache_read_input_tokens`) **decreases** between consecutive turns on every real session checked — a cumulative counter cannot decrease, so usage must be per-turn. Implemented as `detectUsageMode()` in `src/ingestion/parser.ts`: any observed decrease ⇒ `per-turn`/`confirmed`; no decrease observed (e.g. very short session) ⇒ `per-turn`/`assumed`. `usageMode` is exposed on `SessionStats` as specified.
3. **Turn granularity:** resolved — one logical assistant turn spans **multiple** JSONL lines (streaming/tool-loop re-emission sharing `message.id`), confirmed at 42–54% duplicate-line rates on the two larger real sessions. The parser coalesces by `message.id`, taking the first-seen usage per id; without this, real-session totals overcounted ~1.7–2.2x.

**Output:** 3 real sessions added to `fixtures/real/` (sanitized — usage numbers and structure retained, message text/paths/commands stripped), each with a recorded known-good token total the parser matches exactly (regression-tested in `src/ingestion/__tests__/parser.test.ts`). **Remaining gap:** these totals are self-consistent (computed by the parser under test), not yet cross-checked against an external ground truth (Anthropic Console billing for a known session) — that check is still required before the B0 "unverified" banner can be removed in the shipped product.

### 2.3 Defensive JSONL parsing
- The schema is undocumented and versionless. Parsing rules:
  - Any line failing `JSON.parse` → skip, increment `skippedLines` counter.
  - Only `type: "user" | "assistant"` lines contribute turns; all other types skipped but counted by type for diagnostics.
  - All field access is optional-chained with zero-defaults; a missing `usage` object yields a zero-usage turn, never a throw.
- **Parse-health requirement:** expose `skippedLines / totalLines`; if > 20% over a rolling window, the UI shows a degraded-parse warning (see UI-SPEC, banner B2) instead of silently showing wrong totals.
- Subagent transcripts (F10): additional `.jsonl` files under `<session-id>/subagents/`; each parsed with the same parser and rolled up under a `subagentCosts` bucket keyed by agent file.

## 3. Analysis layer

### 3.1 Per-turn model
Each assistant turn carries: `usage {input, output, cache_creation_input, cache_read_input}`, model id, timestamp, tool calls (name + extracted target: file_path | path | command). Cost per turn computed from the pricing table (§3.3).

### 3.2 Waste findings engine (F5, F7)

**Status: every finding below is a HYPOTHESIS until it passes the calibration gate (§3.4).** The thresholds shown are authored starting points for calibration, not shipped values — they exist to be tested, moved, or killed by data. A finding reaches production only with `status: validated` and a calibration record in VALIDATION.md. Engine rules:

- Each finding declares `status: hypothesis | validated | blocked` in code; the UI renders only `validated` findings (a dev flag `leaky.showHypothesisFindings` renders the rest with an explicit "uncalibrated" badge, for calibration work only).
- Per the PRD's metric integrity model, a finding may not depend solely on an unvalidated T2 estimate. **W3 is therefore `blocked` on validating the chars/4 tool-result estimate; W6 is `blocked` on confirming compaction events are identifiable in logs.**
- All thresholds live in one `thresholds.ts` constants file, imported nowhere else, so calibration updates are one-file diffs with the calibration run ID in the commit message.

Findings are pure functions of `SessionStats`, each returning `{id, status, severity, title, detail, recommendation, evidence, confidence}`:

| ID | Finding | Trigger heuristic | Recommendation copy |
|----|---------|-------------------|---------------------|
| W1 | High resent-context share | cacheRead / totalTokens > 40% | "Over N% of this session's tokens are previously-seen context being resent. Starting a fresh session for the next task would reset this." |
| W2 | Repeated file reads | same path Read/Edit ≥ 3 times | "`<file>` was read N times. If it isn't changing, consider summarizing it into CLAUDE.md so it's sent once." |
| W3 | Oversized tool result | single tool result est. > 25k tokens | "One `<tool>` call returned ~Nk tokens. Narrowing the command (e.g. head/grep filters) shrinks every subsequent turn." |
| W4 | Marathon session | > 40 assistant turns without context reset | "This session is N turns deep; every new turn re-pays the whole history. A fresh session preserves the leak savings." |
| W5 | Premium model on routine turns | opus-tier model on turns whose only tools are Read/Grep/Glob | "N turns used an Opus-tier model for file navigation. Routing routine turns to a cheaper model cuts their cost ~80%." |
| W6 | Post-compaction rework | file Read again within 3 turns after a compaction event | "`<file>` was re-read right after context compaction — a sign the compaction dropped something needed." |

- Severity: `info | warn | high`, derived from magnitude thresholds per finding.
- Findings are recomputed incrementally but surfaced at most once per session per ID (dismissal state kept in memory; persisted in v0.3).
- Tool-result token sizes are estimated (chars/4) since the log doesn't itemize them; estimates are labeled as such in the UI.

### 3.3 Pricing (F11)
- Static table in `pricing.ts` keyed by model-tier substring match (opus/sonnet/haiku/unknown), covering input, output, cacheWrite, cacheRead rates per million tokens.
- v0.3: user-editable overrides via `leaky.pricingOverrides` setting (JSON object merged over defaults).
- **Requirement:** every rendered dollar figure passes through one formatting function that appends the "est." treatment, so honesty labeling can't be forgotten in a new surface.

### 3.4 Calibration methodology (the v0.1.5 gate)

The full protocol lives in VALIDATION.md; the engineering contract is:

1. **Corpus:** ≥ 20 real session logs (start with the maintainer's own; grow via opt-in community donations of *stats CSVs only* — the calibration script never asks anyone to share transcript content).
2. **Instrument:** `scripts` target `calibrate` — a CLI that ingests a directory of `.jsonl` files and emits one CSV row per session containing every candidate signal (totals, cache-read share, max repeated-read count, turn count, longest inter-reset stretch, largest tool-result chars, per-model turn mix). This script shares the production parser — calibration and product can never drift apart.
3. **Labels:** the human labels each session `wasteful | healthy | unsure` from memory/receipts *before* looking at the signals (blind labeling, to avoid the signals contaminating the judgment).
4. **Separation criterion:** a finding's threshold is accepted if, on the labeled corpus, it achieves **precision ≥ 0.8** (of sessions it flags, ≥ 80% were labeled wasteful) with **recall ≥ 0.5**. Precision is weighted over recall deliberately: a missed leak costs an insight; a false alarm costs the product's credibility.
5. **Record:** each accepted threshold gets a dated entry in VALIDATION.md: corpus size, threshold value, precision/recall achieved, known failure modes. Each rejected finding gets a post-mortem line: why it failed, whether a redesign is worth attempting.
6. **Re-calibration trigger:** any parser schema change or ≥ 2 user reports of a false-positive finding reopens that finding's status to `hypothesis`.

## 4. Storage layer (v0.3, F9)

- SQLite via `better-sqlite3`, single DB at extension `globalStorageUri`.
- Tables:
  - `sessions(id TEXT PK, project TEXT, started_at INT, ended_at INT, total_tokens INT, cache_read_tokens INT, est_cost_usd REAL, turn_count INT, model_mix TEXT, findings_json TEXT)`
  - `dismissals(session_id TEXT, finding_id TEXT, PRIMARY KEY(session_id, finding_id))`
- Only summaries are stored — never transcript content. This keeps the DB tiny and the privacy story simple.
- Written on session-end detection (no new lines for 10 minutes, or file superseded by a newer session file).

## 5. UI layer contracts

- Status bar (F2): updated every tick; text format `$(flame) $X.XX · Nk tok · P% resent`; click opens panel.
- Webview panel (F3–F8): receives full serialized `SessionStats` snapshots via `postMessage({type:'update'})`; the webview is stateless and re-renders from each snapshot. Message types: `update`, `historyList` (v0.3), `exportResult`.
- Webview → extension messages: `requestExport`, `dismissFinding {id}`, `selectTurn {index}` (drill-down data already present client-side; message reserved for future), `openFile {path}` (reveals a finding's file in the editor).
- Share card export (F8): rendered to an offscreen canvas inside the webview, `toDataURL('image/png')`, sent to the extension host, written via save dialog. No external renderer.
- All styling uses VS Code theme variables with Leaky's four semantic colors layered on top (see UI-SPEC §1).

## 6. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Tick processing < 10ms for typical deltas; initial load of a 10MB session < 2s; webview render < 100ms per update at 500 turns (aggregate bars beyond 300 turns) |
| Memory | Extension host retains aggregates + per-turn summaries only, not raw lines; target < 50MB for a 10MB session |
| Privacy | Zero network calls at runtime; read-only access outside extension storage; no transcript text ever persisted |
| Compatibility | VS Code ≥ 1.85; macOS/Linux/Windows (`%USERPROFILE%\.claude` on Windows); no native modules in v0.1–v0.2 (better-sqlite3 arrives v0.3 with prebuilds) |
| Failure posture | Parser never throws to the event loop; every failure path degrades to "less data shown + health indicator," never to a broken panel |
| Accessibility | Panel fully keyboard-navigable; chart data mirrored in an accessible table; respects reduced-motion |

## 7. Testing strategy

- **Parser corpus tests:** a `fixtures/` directory of real-world-shaped JSONL samples (normal turns, subagents, compaction events, truncated lines, unknown types, schema variants) with snapshot-tested `SessionStats` output. This corpus is the project's most valuable asset; every user-reported parse bug adds a fixture.
- **Findings engine:** table-driven unit tests per finding ID against synthetic stats.
- **Tailer:** simulated append/truncate/rotate sequences against temp files.
- **Webview:** golden-image test of the chart at 3 sizes (manual in v0.1, automated later).

## 8. Open technical questions

1. Exact confirmation of the project-path encoding scheme (needs samples from real machines; tracked as the first community issue).
2. Whether compaction events are reliably identifiable in the log — **W6 is `blocked` on this**; the calibration corpus doubles as the evidence base.
3. Token-estimation accuracy for tool results (chars/4) — **W3 is `blocked` on this**; validate against turns where consecutive usage deltas make the true size inferable, during the calibration pass.
4. Whether cache-read share separates wasteful from healthy sessions *at all* — the core open question the calibration gate exists to answer. If it doesn't separate, the hero diagnosis shifts to whatever signal does (candidates: repeated-read counts, inter-reset stretch, cost-per-accepted-change).
5. Cursor/Copilot log formats for v2 adapters — research spike, out of v1 scope.