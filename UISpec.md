# Leaky — UI Specification

**Version:** 2.0 (draft) · **Companion docs:** PRD.md (personas P1–P4, features F1–F11, §0 foundation status), TRD.md, VALIDATION.md
**Scope:** every user-facing surface in v0.1–v0.3. Each element carries an ID for reference in issues and PRs.

> **Pre-reconciliation state (B0):** until PARSER-RECON (TRD §2.4) passes, every surface that shows a number also shows banner B0 (§5): "Numbers unverified — Leaky hasn't yet been reconciled against a real session on your setup." B0 outranks all other banners. This is removed per-install once reconciliation self-check passes (parser's `usageMode` resolved and totals within tolerance of a known figure the user confirms once).

---

## 1. Design language

**Voice:** a profiler, not a scold. Copy states facts and offers one action; it never moralizes ("wasteful," "bad") — the word is always "leak," which is mechanical, not judgmental.

**Theme integration:** all base colors come from VS Code theme variables so Leaky looks native in any theme. Four semantic colors are layered on top and are the only brand constants:

| Token | Hex | Meaning |
|-------|-----|---------|
| `--fresh` | `#4FB3A9` (teal) | fresh input tokens — new, productive work |
| `--cachewrite` | `#7C9CD6` (slate blue) | newly cached context |
| `--cacheread` | `#E0A336` (amber) | cache read — resent stale context, THE leak color |
| `--output` | `#D97757` (clay) | model output |

**The amber rule (revised, load-bearing):** amber means exactly one thing — *a calibrated finding has diagnosed likely waste*. Raw measurements never render amber, including the % resent stat, because resent context is frequently the cache working correctly (PRD §1, §7a). The % resent stat renders in the neutral `--cacheread`-swatch context of the chart legend but as plain foreground text in the headline. Amber appears only on: validated F-CARD severity dots, the findings-count badge when ≥ 1 validated finding is active, and the share card's finding line (if any). If the session has no validated findings, the UI contains zero amber — and that absence is itself information ("nothing diagnosably leaking").

**Typography:** the editor's own font stack (`--vscode-editor-font-family`) throughout — Leaky reads as an instrument panel inside the tool, not a website. Headline numbers 26px/700; section labels 11px uppercase letterspaced; body 12px.

**Signature element:** the per-turn stacked bar chart with amber "leak" segments visibly growing across the session — the image the product is remembered by, repeated on the share card.

---

## 2. Surface inventory (map)

```
S1  Status bar item ──click──▶ S2 Burn-down panel
                                ├── S2.a Headline strip
                                ├── S2.b Burn-down chart ──click bar──▶ M1 Turn drill-down modal
                                ├── S2.c Findings list ──▶ (inline actions)
                                ├── S2.d Re-read files table
                                └── S2.e Footer bar ──▶ M2 Share card modal
                                                    ──▶ S3 History view (v0.3)
CP  Command palette entries
QP1 Session picker (quick pick)
M3  Pricing editor modal (v0.3)
B1–B3 Banners (empty / degraded / stale)
W1–W6 Finding cards (spec'd in §6)
N1  One-time welcome notification
```

---

## 3. S1 — Status bar item

- **Position:** left-aligned, priority 100.
- **States:**
  - `S1.idle` — `$(graph) Leaky: no session` · tooltip: "No Claude Code session found for this workspace. Click to open Leaky, or run 'Leaky: Select Session File Manually'."
  - `S1.live` — `$(flame) $4.12 est · 1.3M tok · 46% resent` · tooltip shows full session file path + "Click for burn-down."
  - `S1.stale` — same text at 60% opacity when no new lines for > 10 min · tooltip appends "(session idle)".
  - `S1.degraded` — `$(warning)` replaces `$(flame)` when parse-health is degraded (TRD §2.3).
- **Interaction:** single click → opens/reveals S2. No context menu in v1.
- **Rules:** dollar always two decimals with "est"; tokens use k/M shortening; % resent is an integer.

## 4. S2 — Burn-down panel (webview)

Opens beside the editor (`ViewColumn.Beside`), retains context when hidden. Title: "Leaky — Session Burn-down".

### S2.a Headline strip
Four stat blocks in a row (wraps on narrow widths), each `{big number, small uppercase label}`:

| ID | Stat | Notes |
|----|------|-------|
| S2.a1 | Session cost | `$4.12` + superscript "est."; tooltip: "Estimated from the pricing table in settings. Token counts below are exact." |
| S2.a2 | Total tokens | k/M formatted |
| S2.a3 | **% resent context** | neutral color (see amber rule §1); label reads "resent context", NOT "wasted"; tooltip: "Share of this session's tokens that were previously-seen context re-served from cache. High values are normal for long sessions — see Leaks below for whether any of it looks like waste." |
| S2.a4 | Turns · duration | "38 turns · 1h 12m" |

Above the strip: `S2.a0` source line — truncated session file path, click-to-copy, with a small "change" link → QP1.

### S2.b Burn-down chart
- Stacked vertical bars, one per assistant turn, segments bottom-up: fresh → cachewrite → cacheread → output. X: turn order; Y: tokens (auto-scaled).
- Legend row beneath (four swatches + labels). Legend items are toggles: clicking one dims that segment across the chart (state resets on panel close).
- **Hover:** tooltip `Turn 23 · 41.2k tok · $0.31 est · Read, Bash` .
- **Click a bar:** opens M1 for that turn.
- **Density rule:** ≤ 300 turns → one bar each; > 300 → adjacent turns aggregated into buckets (tooltip shows "Turns 120–124").
- **Compaction markers (v0.2, behind flag):** a thin vertical dashed rule at detected compaction events, labeled "compaction" on hover.
- **A11y:** an offscreen-accessible table mirrors the chart data; chart is focusable, arrow keys move a bar cursor, Enter opens M1.

### S2.c Findings list ("Leaks" section)
- Section header: `LEAKS` + count badge. If none: empty-state line "No leaks detected yet — totals above are the whole story so far."
- Ordered by severity then magnitude; renders finding cards F-CARD (spec §6).

### S2.d Re-read files table
- Header: `FILES RE-READ MOST THIS SESSION`.
- Columns: File (mono, middle-truncated, click → `openFile` reveals in editor) · Re-reads (count) · Est. tokens/read.
- Max 8 rows + "show all (N)" expander. Empty state: "No file re-read more than once yet."

### S2.e Footer bar
Right-aligned buttons:

| ID | Button | Style | Action |
|----|--------|-------|--------|
| S2.e1 | `Share card` | primary (theme button color) | opens M2 |
| S2.e2 | `History` | secondary | opens S3 (v0.3; hidden before) |
| S2.e3 | `Refresh` | icon `$(refresh)` | full re-read of session file |
| S2.e4 | `⚙` | icon | opens VS Code settings filtered to `leaky.` |

## 5. Banners (top of S2, one at a time, dismissible per session)

Priority order when multiple could apply: **B0 > B2 > B1 > B3.** B0 is not dismissible — it clears only when reconciliation passes.

| ID | Trigger | Copy | Actions |
|----|---------|------|---------|
| B0 unverified | PARSER-RECON not yet passed on this install | "Numbers unverified. Leaky hasn't confirmed it reads your Claude Code logs correctly yet — totals may be wrong (possibly several-fold if usage is cumulative). Reconcile once to clear this." | `Reconcile now` → runs the self-check against the current session + asks the user to confirm one known total · `Learn why` → TRD §2.4 anchor |
| B1 empty | No session file found | "Leaky couldn't find a Claude Code session for this workspace. Start a Claude Code session here, or pick a file manually." | `Pick session file` → QP1 · `How detection works` → README anchor |
| B2 degraded | skip-rate > 20% | "Some of this session's log lines couldn't be parsed (N of M skipped). Totals may undercount. This usually means the log format changed — please open an issue with a sample line." | `Copy sample line` (sanitized: structure only, strings redacted) · `Open issue` → GitHub |
| B3 stale | No new lines > 10 min | "Session idle since HH:MM — showing final totals." | none (auto-clears on new activity) |

## 6. F-CARD — Finding card component (used by W1–W6)

Layout: `[severity dot] Title …………… [est. impact] [dismiss ×]` over one detail line, one amber-tinted recommendation line, and optional inline action.

- **Severity dot:** info = theme muted; warn = amber outline; high = solid amber. (Amber permitted here because only `validated` findings render — see §1 amber rule.)
- **Confidence label:** every card carries a small right-aligned tag: `calibrated` (default for validated findings; tooltip links the VALIDATION.md record) or `uncalibrated` (dev-flag-only hypothesis findings, rendered with muted dot regardless of severity). This label is how the product keeps its epistemic honesty visible instead of buried in docs.
- **Est. impact:** right-aligned, e.g. "~$1.90 est of this session" — always "est.", omitted when unmeasurable.
- **Dismiss:** removes card for this session (persists v0.3). No "don't show again forever" in v1 — findings are per-session by design.
- **Inline actions by finding:** W2/W6 → `Reveal file`; W3 → `Show turn` (opens M1 at that turn); W1/W4/W5 → none (recommendation is the action).
- Copy per finding follows TRD §3.2 table verbatim; copy lives in one `findings-copy.ts` file for easy tuning.

## 7. Modals

### M1 — Turn drill-down
- **Trigger:** chart bar click / Enter; `Show turn` on W3.
- **Layout (webview overlay, 420px, right-anchored):**
  - Header: `Turn 23 · assistant · 14:32:07` + close ×
  - Token split mini-table: four rows (fresh/cachewrite/cacheread/output) with count + % of turn, swatch-colored.
  - Cost line: `$0.31 est · claude-sonnet-4-6`
  - Tools list: each tool call as `Read — /repo/src/config.ts` (target mono, click → reveal file when it's a path).
  - Footer: `◀ Prev turn` `Next turn ▶` buttons; Esc closes.
- **States:** turns with zero usage (user turns are not openable — bars exist only for assistant turns).

### M2 — Share card
- **Trigger:** S2.e1.
- **Content:** a live preview of the exported PNG (1200×630):
  - Top: "my claude code session, profiled" (lowercase, muted) + Leaky wordmark bottom-right.
  - Hero: total tokens (huge) with `$X.XX est` beside it — T1-exact number leads, per the metric integrity model. The % resent renders as a labeled secondary stat ("N% resent context"), neutral color.
  - If ≥ 1 validated finding fired: one amber finding line beneath the stats (e.g. "1 leak found: same file read 14×"). If none, the line reads "no leaks diagnosed" in muted text — which is itself a shareable brag.
  - Second row: `N turns · Nh Nm · model mix`.
  - Bottom half: the session's burn-down chart re-rendered at card scale.
  - **Privacy rule:** the card contains NO file paths, project names, or transcript text — numbers and chart only. A caption under the preview states this: "Contains only totals — no file names or code."
- **Buttons:** `Save PNG…` (primary, native save dialog) · `Copy to clipboard` · `Cancel`.
- **Empty guard:** if < 3 assistant turns, button S2.e1 is disabled with tooltip "Need a few turns first."

### M3 — Pricing editor (v0.3)
- **Trigger:** link inside S2.a1 tooltip ("adjust pricing") or settings.
- **Layout:** table of model tiers × four rate columns, editable cells, `Reset to defaults` link, `Save` / `Cancel`.
- Validation: numeric ≥ 0; invalid cells outlined, Save disabled.
- On save: totals recompute immediately; a toast confirms "Pricing updated — totals recalculated."

## 8. QP1 — Session picker (native quick-pick)

- **Trigger:** command `Leaky: Select Session File Manually`, B1 action, S2.a0 "change".
- Items: one per `.jsonl` found under the Claude home, grouped by project directory, detail line = `modified 12 min ago · 4.2 MB`. Most recent first. Final item: `Browse for file…` → native open dialog (jsonl filter).
- Selecting pins the session for this window and resets tailer state.

## 9. S3 — History view (v0.3)

- **Entry:** S2.e2 or command `Leaky: Session History`.
- Replaces panel content (breadcrumb `← Live session` returns).
- **Layout:** list of session summary rows, newest first: `date · project · $cost est · tokens · %resent (amber if >40) · turns`. Click a row → read-only S2 rendered from the stored summary (chart omitted — summaries don't retain per-turn data; the headline strip, findings, and re-read table render from stored JSON).
- Header strip: 30-day aggregates (total est. spend, average % resent, session count) + a sparkline of per-session % resent.
- Empty state: "History starts now — finished sessions will appear here."

## 10. Command palette entries (CP)

| Command | Effect |
|---------|--------|
| `Leaky: Show Session Burn-down` | open/reveal S2 |
| `Leaky: Select Session File Manually` | QP1 |
| `Leaky: Refresh` | same as S2.e3 |
| `Leaky: Export Share Card` | opens S2 if needed, then M2 |
| `Leaky: Session History` | S3 (v0.3) |

## 11. N1 — First-run notification

Shown once ever (flag in globalState), only after a session is successfully detected:
> "Leaky is watching this workspace's Claude Code session. The status bar shows live cost — click it for the full burn-down."
> Buttons: `Open burn-down` · `Dismiss`

No notification is shown if no session is found (the status bar idle state covers it) — Leaky never announces itself before it has something to show.

## 12. Settings (VS Code contributions)

| Setting | Type | Default | Surface |
|---------|------|---------|---------|
| `leaky.claudeHome` | string | "" (→ `~/.claude`) | settings UI |
| `leaky.pollIntervalMs` | number | 1500 | settings UI |
| `leaky.pricingOverrides` | object | {} | M3 + settings JSON (v0.3) |
| `leaky.enableCompactionMarkers` | boolean | false | settings UI (v0.2, experimental) |
| `leaky.aggregateThreshold` | number | 300 | settings UI, advanced |

## 13. State matrix (per surface)

| Surface | Loading | Empty | Live | Idle/stale | Degraded | Error |
|---------|---------|-------|------|------------|----------|-------|
| S1 | idle text | idle text | live ticker | dimmed | warning icon | idle text |
| S2 | skeleton headline + "reading session…" | B1 banner + zeroed strip | full render | B3 banner, final totals | B2 banner + partial data | B2 covers; panel never blanks |
| S2.b | — | axis + "waiting on session activity…" | bars | frozen bars | bars from parsed subset | — |
| S2.c | — | empty-state line | cards | cards | cards + caveat line "computed from partially-parsed data" | — |
| M2 | spinner over preview | disabled entry | preview | preview | preview + caveat footer | toast "Export failed — try again" |

## 14. Persona → surface coverage check

- **P1 Vibe Coder:** S1 → S2.a3 (% resent) → W1/W4 cards with plain-language recommendations. Zero config path: install → N1 → click → insight. ✔
- **P2 Professional:** S2.b hover + M1 drill-down, S2.d, W3/W5, S3 history. ✔
- **P3 Team Lead:** M2 export, S3 aggregates strip. (Deeper team features deferred to v2 per PRD non-goals.) ✔
- **P4 Onlooker:** M2 card is self-explanatory with product name, hero stat, and no private data. ✔