# Leaky

A live profiler for your AI coding agent's token burn.

Leaky is a free, open-source VS Code extension that gives developers live visibility into what their Claude Code sessions actually cost — in tokens and dollars — and, more importantly, *why*. Agentic coding tools resend accumulated context on every tool call; Leaky makes that context load visible per turn, live, inside the editor, the way a profiler makes a slow function visible.

**Status:** pre-alpha, in active development. No packaged extension yet — see [Project status](#project-status) below.

## Why

Agentic coding tools consume far more tokens than chat because full context is resent on every tool call. Individual developers can see bills of hundreds to thousands of dollars a month with no visibility into where the tokens went. Existing cost tools are enterprise dashboards reviewed after the fact by finance teams — nothing shows the developer, in the editor, during the session, what is burning and why.

A critical framing: resent context (cache-read tokens) is **not automatically waste**. Prompt caching re-serving relevant context cheaply is the mechanism that makes agentic coding affordable. Waste is specifically resent context that's no longer relevant to the current task. Leaky separates **measurement** (exact, from the log) from **diagnosis** (heuristic, calibrated, confidence-labeled) everywhere in the product — see [PRD.md §7a](PRD.md) for the metric integrity model this is built around.

## Project docs

This repo started as a spec-first project. The full design lives in these companion docs:

- [PRD.md](PRD.md) — product vision, personas, features, release plan, risks
- [TRD.md](TRD.md) — architecture, parser design, findings engine, non-functional requirements
- [UISpec.md](UISpec.md) — every user-facing surface, spec'd element by element
- [Validation.md](Validation.md) — the statistical calibration protocol that gates any "this is waste" claim before it ships

## Project status

The foundation this whole product depends on is a parser that correctly reads Claude Code's undocumented, unversioned JSONL session format. That's not a given — see `fixtures/real/RECONCILIATION.md` for how the two core unknowns (is `usage` per-turn or cumulative? does one logical turn span one JSONL line or several?) were resolved empirically against real session logs.

Built so far:
- `src/ingestion/sessionLocator.ts` — finds a workspace's active Claude Code session file (F1)
- `src/ingestion/parser.ts` — defensive JSONL parser: never throws, coalesces multi-line turns by message id, resolves per-turn vs. cumulative usage semantics
- `src/extension.ts` — minimal status bar item wired to the parser
- `fixtures/real/` — a sanitized corpus of real session logs (no transcript text, paths, or commands — structure and usage numbers only) with regression tests locking in known-good totals

Not built yet: the tailer (incremental reads as the session grows), the burn-down webview panel, the findings/waste-detection engine, session history, and the share card. Follow the release plan in [PRD.md §8](PRD.md) for what's next and in what order.

## Development

```bash
npm install
npm run compile   # type-check + build
npm test          # run the test suite
```

## Privacy

Leaky reads session logs from `~/.claude/` (or `%USERPROFILE%\.claude` on Windows) read-only. No network calls at runtime, no accounts, no telemetry. Session logs never leave the machine.
