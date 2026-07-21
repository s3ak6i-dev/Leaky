# Leaky — Product Requirements Document

**Version:** 2.0 (draft) · **Status:** Pre-launch, foundation unverified (see §0) · **Companion docs:** TRD.md, UI-SPEC.md, VALIDATION.md

> **§0 — Foundation status (read first).** Every number Leaky displays depends on the parser correctly reading real Claude Code JSONL. **Update 2026-07-21:** the two specific unknowns that gated correctness are now resolved against 3 real session logs (see `fixtures/real/RECONCILIATION.md`): (a) `usage` is confirmed **per-turn**, not cumulative — evidenced by `cache_creation_input_tokens` decreasing between turns, which a cumulative counter cannot do; (b) one logical turn maps to **multiple** JSONL lines (streaming/tool-loop re-emission sharing a `message.id`) — the parser now coalesces by id, without which totals overcounted ~1.7–2.2x on real sessions. What remains open: these totals are self-consistent regression baselines, not yet cross-checked against an external ground truth (Anthropic Console billing for a known session) — that check is still required before removing the B0 "unverified" banner in the shipped product.

---

## 1. Product summary

Leaky is a free, open-source VS Code extension that gives developers live visibility into what their AI coding sessions actually cost — in tokens and dollars — and, more importantly, *why*. Agentic coding tools resend accumulated context on every tool call; Leaky makes that context load visible per turn, live, inside the editor, the way a profiler makes a slow function visible.

The one-sentence pitch: **a live profiler for your AI coding agent's token burn.**

**A critical framing decision:** resent context (cache-read tokens) is *not automatically waste*. Prompt caching re-serving relevant context cheaply is the mechanism that makes agentic coding affordable — it is often the cache working correctly. Waste is specifically resent context that is *no longer relevant to the current task*. Leaky therefore separates two things everywhere in the product: **measurement** (exact, from the log: how much context is being carried and re-paid) and **diagnosis** (heuristic, calibrated, confidence-labeled: which portion of that is likely waste). Leaky never labels a raw number as waste; only validated findings do that. This distinction is the product's credibility, and it is enforced structurally (see §7a).

## 2. Problem statement

Agentic coding tools consume 10–100x more tokens than chat because full context is resent on every tool call. Individual developers see bills of $500–$2,000/month; teams see five-figure monthly line items appear with no visibility into where the tokens went. A documented case saw a 35-engineer team cut an $87k monthly bill to $24k purely by finding and removing waste — the waste was there all along, invisible. Existing cost tools are enterprise SaaS dashboards (Vantage, CloudZero, Exceeds) reviewed after the fact by finance/platform teams. Nothing shows the *developer, in the editor, during the session* what is burning and why.

## 3. Goals and non-goals

**Goals**

1. Make a session's token burn visible in real time with zero configuration for the default case (Claude Code on the current workspace).
2. Attribute burn to causes a developer can act on: stale resent context, repeated file reads, oversized tool results, long unbroken sessions, expensive model choice.
3. Convert visibility into action: every diagnosis pairs with a one-line recommendation ("start a fresh session," "this file was re-read 14 times — pin a summary instead").
4. Be shareable: a session summary a developer screenshots or exports, which is the product's primary growth loop.
5. Stay open-source, local-only, and privacy-clean: session logs never leave the machine.

**Non-goals (v1)**

- Not a billing/invoice reconciliation tool. Dollar figures are estimates; token counts are exact.
- Not an optimizer that changes agent behavior automatically. Leaky diagnoses; the developer acts.
- Not a transcript viewer. Other tools (claude-devtools, LM Assist) already render conversations; Leaky renders *economics*.
- Not multi-tool at launch. Claude Code first; Cursor/Copilot later (v2+).
- No accounts, telemetry, or cloud component.

## 4. User profiles

### P1 — The Vibe Coder (primary launch persona)
Hobbyist or indie builder using Claude Code daily on personal projects. Pays out of pocket (API or a capped plan). Feels the pain as "why did I hit my limit before lunch" rather than as an invoice. Low tolerance for setup; will uninstall anything that needs configuration. Success for them: install → open panel → immediately see a number that explains their week.

**Key needs:** zero-config detection, the % resent stat, "start a fresh session" nudges, limit-burn awareness.

### P2 — The Professional Developer
Employed engineer using Claude Code on company projects; may not pay directly but hits usage limits and cares about not looking wasteful. Comfortable with profilers and flame graphs; wants per-turn detail, per-tool breakdowns, and the ability to answer "what happened in that expensive session yesterday."

**Key needs:** turn-level drill-down, per-tool cost attribution, session history, subagent rollup.

### P3 — The Team Lead / Platform Engineer
Responsible for a team's AI tooling spend. Doesn't live in the panel daily but wants exportable summaries, cross-session trends, and a way to teach the team good context hygiene. In v1 they are served by the export/summary card; deeper team features (shared baselines, budget alerts) are explicitly v2+.

**Key needs:** exportable session reports, trends view, waste-pattern education.

### P4 — The Curious Onlooker (growth persona, not a user)
Sees a screenshot of someone's burn-down chart on X/HN/Reddit. The share card is designed for this person: self-explanatory, branded lightly, one shocking number front and center. They convert to P1.

## 5. Core features (v1)

| # | Feature | Persona | Priority |
|---|---------|---------|----------|
| F1 | Auto-detect current workspace's Claude Code session; manual picker fallback | P1 | P0 |
| F2 | Live status bar ticker: est. cost · total tokens · % resent context | P1, P2 | P0 |
| F3 | Burn-down panel: per-turn stacked chart (fresh input / cache write / cache read / output) | All | P0 |
| F4 | Headline stats: session cost, total tokens, % resent, turn count, duration | All | P0 |
| F5 | Waste findings list: repeated file reads, largest tool results, longest context stretch without a fresh session | P1, P2 | P0 |
| F6 | Turn drill-down: click a bar → see that turn's tools, targets, token split, cost | P2 | P1 |
| F7 | Recommendations: each finding carries one actionable suggestion | P1 | P1 |
| F8 | Session share card: export a PNG summary (cost, tokens, % resent, chart thumbnail) | P3, P4 | P1 |
| F9 | Session history: persist per-session summaries locally; simple trends list | P2, P3 | P2 |
| F10 | Subagent rollup: include subagent transcript costs in totals | P2 | P2 |
| F11 | Pricing table editor: user-adjustable per-model prices in settings | P2, P3 | P2 |

## 6. Success metrics

Because Leaky has no telemetry, metrics are proxy/external:

- GitHub stars and issues volume (target: meaningful organic traction within 90 days of launch, driven by share cards)
- VS Code Marketplace installs and rating
- Share-card sightings (qualitative: screenshots appearing organically)
- Time-to-first-insight in usability tests: a new user should see their % resent number within 60 seconds of install with zero configuration

## 7. Principles and constraints

1. **Exact where it can be, honest where it can't.** Token counts come straight from the log and are exact. Dollar figures are labeled "est." everywhere they appear.

### 7a. Metric integrity model (governs every number in the product)

Every displayed value belongs to exactly one tier, and its tier determines how the UI may present it:

| Tier | Definition | Presentation rules | Examples |
|------|------------|-------------------|----------|
| **T1 Exact** | Read directly from the session log | May be shown without qualification; always the primary number | token counts, turn counts, tool call counts, timestamps |
| **T2 Estimated** | Derived from T1 via a stated model with known error sources | Always carries "est."; error source documented in tooltip | dollar cost (pricing table), tool-result size (chars/4) |
| **T3 Diagnosed** | A judgment ("this is waste") produced by a heuristic | May only ship after passing the calibration gate (VALIDATION.md); always carries a confidence label; never rendered in amber unless calibrated | all W-findings |

Two hard rules follow: (1) a T3 claim may never be built solely on an unvalidated T2 input (this currently blocks W3, whose input is the chars/4 estimate); (2) the amber "leak" color is reserved for calibrated T3 findings — raw measurements, including % resent, render in neutral colors until the diagnosis layer earns amber.
2. **Diagnose, don't nag.** Findings appear once per session with a dismiss; no popups, no interruptions of flow.
3. **Local only.** No network calls at runtime. The only file access is read-only on `~/.claude/`.
4. **Resilient to an undocumented format.** Claude Code's JSONL schema is unversioned and evolves; unknown lines are skipped silently, and a parse-health indicator surfaces when skip rates are abnormal instead of failing loudly.
5. **The share card is the marketing department.** Every design decision on it optimizes for "screenshot-worthy and self-explanatory."

## 8. Release plan

- **v0.1.0 — PARSER RECONCILIATION (blocks literally everything):** reconcile the parser against ≥ 3 real sessions with known token totals; resolve the per-turn-vs-cumulative `usage` question; add real logs to the fixture corpus. Until this passes, no number ships. (TRD §2.4)
- **v0.1 — measurement layer:** F1–F4 (chart, ticker, headline stats, re-read table *as data*) — but only after PARSER-RECON. Ships with zero diagnostic claims; the re-read table shows counts, not judgments.
- **v0.1.5 — one validated finding:** ship *only* W2 (repeated file reads), because it is near-tautological — "you read this file 14 times" is an observation, barely a heuristic, and needs minimal calibration. Everything else in the findings engine stays behind the dev flag. This tests whether users even want diagnosis before we build six of them.
- **v0.2 — calibration gate for the rest:** run the full calibration protocol (VALIDATION.md) against a corpus large enough to have statistical power (see VALIDATION.md §power). W1/W4/W5 ship only if they clear the bar on an adequately-sized corpus; W3/W6 remain blocked on their specific validations. Plus F6–F8 (drill-down, share card — measurement features, not gated). Public launch here.
- **v0.3:** F9–F11; community fixture corpus hardens the parser.
- **v1.0:** stability — parser reconciled across a real-world corpus; every shipped finding has a calibration record with a corpus large enough to support it.
- **v2 (north star):** **diff-aware waste detection** — the only thing that makes waste detection *correct* rather than proxy: distinguishes cache re-serving live context (healthy) from dead context (waste). Until this exists, treat all findings as approximate proxies, and say so in-product.

**Scope philosophy (added in v2.0):** the temptation with a doc set this complete is to build all of it. Resist. The measurement layer is the product; the findings engine is an experiment layered on top, shipped one finding at a time, each earning its place with evidence. If users love the measurement layer and ignore findings, that is a valid and cheaper product.

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Parser is wrong about the real log format** — every number is confidently incorrect; if `usage` is cumulative, totals overcount several-fold | **Critical / unresolved** | PARSER-RECON (v0.1.0) blocks all releases until reconciled against real sessions with known totals; real logs added to fixture corpus |
| **Circular calibration** — sessions labeled "wasteful" because the bill was high, then used to validate a cost-derived signal, so Leaky just re-predicts the bill it already shows | **High** | Labeling guidance forbids using cost as the label basis (VALIDATION.md §labeling); prefer labels grounded in remembered *rework/frustration*, not spend; report label-vs-cost correlation and flag if too high |
| **Calibration corpus too small for statistical power** — precision/recall on ~20 sessions have huge confidence intervals; a finding passes by luck | **High** | Minimum corpus sizes per finding + confidence intervals reported, not point estimates (VALIDATION.md §power); findings on thin corpora ship as `uncalibrated` at most |
| **Findings cry wolf** — uncalibrated thresholds fire on healthy sessions | High | Calibration gate; ship one near-tautological finding (W2) first; rest behind evidence |
| **Hero metric misframes healthy caching as waste** | High | Metric integrity model (§7a): % resent renders neutral; only calibrated findings claim waste; diff-aware detection is the v2 north star |
| Claude Code changes JSONL schema and breaks parsing | High | Defensive parser, parse-health indicator, fast community patch loop |
| Anthropic ships equivalent first-party visibility | Medium | Move fast; multi-tool support is the durable moat first-party tools won't have |
| Pricing drift makes $ figures misleading | Medium | "est." labeling, user-editable pricing table (F11), token counts always primary |
| Existing tools (claude-devtools) expand into economics view | Medium | Differentiate on live/actionable/shareable, not on transcript rendering |
| Path-encoding guess for session detection fails on some systems | Low | Manual picker fallback (F1) already shipped; fix encoding from real user reports |