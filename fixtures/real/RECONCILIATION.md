# PARSER-RECON — reconciliation record

**Date:** 2026-07-21 · **Status:** usage-semantics and turn-granularity questions resolved. Dollar-total ground truth still open (see "What remains open" below).

## Corpus

Three real Claude Code session logs, sanitized (message text/paths/commands stripped; `type`, `timestamp`, `message.id`, `message.model`, `message.usage`, and tool-call shape retained) into `fixtures/real/`:

| File | Raw session | Lines | Unique turns |
|------|-------------|-------|--------------|
| `session-leaky.jsonl` | Leaky's own dev session | 129 | 31 |
| `session-locus.jsonl` | Locus project session | 3106 | 694 |
| `session-klados.jsonl` | klados project session | 1841 | 405 |

## Question 1 — is `usage` per-turn or cumulative?

**Resolved: per-turn.** The TRD's originally proposed heuristic ("monotonic non-decreasing `input_tokens` across a turn chain ⇒ cumulative") turned out to be insufficient on its own: per-turn `cache_read_input_tokens` is *expected* to trend upward as an agentic session's context grows, so a monotonic run doesn't discriminate between the two hypotheses — it's consistent with both.

The discriminating signal that actually worked: **`cache_creation_input_tokens` (and sometimes `cache_read_input_tokens`) decreases between consecutive turns** in every real session checked. A genuinely cumulative counter cannot decrease. Since it does, `usage` must be per-turn. Example from `session-leaky`: `cache_creation_input_tokens` sequence `9872 → 347 → 20341 → 935 → ...` — not monotonic, ruling out cumulative.

This is now encoded as `detectUsageMode()` in `src/ingestion/parser.ts`: any observed decrease in either field ⇒ `per-turn`/`confirmed`. No decrease observed (e.g. a very short session) ⇒ `per-turn`/`assumed`, since per-turn is what every real session in this corpus confirmed and cumulative has never been observed.

## Question 2 — one logical turn = one JSONL line, or several?

**Resolved: several.** Consecutive `assistant` lines frequently repeat the same `message.id` with byte-identical `usage`, interleaved with `user` lines carrying tool results (streaming / tool-loop re-emission of the same logical turn). Measured duplication rate:

| File | Raw assistant lines | Duplicate lines | Unique turns |
|------|---------------------|------------------|--------------|
| `session-leaky.jsonl` | — | — | 31 |
| `session-locus.jsonl` | 1203 | 509 (42%) | 694 |
| `session-klados.jsonl` | 889 | 484 (54%) | 405 |

Without coalescing by `message.id`, naive summation would overcount totals by roughly 1.7–2.2x on real sessions. The parser now takes the first-seen usage per `id` and skips repeats (`parseSession` in `src/ingestion/parser.ts`).

## Regression baseline

Known-good totals (computed by the reconciled parser against the sanitized fixtures above, locked into `src/ingestion/__tests__/parser.test.ts` as a regression guard):

| File | Turns | Total tokens | Skipped lines |
|------|-------|--------------|----------------|
| `session-leaky.jsonl` | 31 | 2,359,413 | 0 |
| `session-locus.jsonl` | 694 | 72,564,286 | 0 |
| `session-klados.jsonl` | 405 | 183,952,686 | 0 |

Any future parser change that shifts these numbers must be a deliberate, reviewed change — the test suite fails otherwise.

## What remains open

The TRD's original PARSER-RECON spec asked for reconciliation against "an authoritative total (Claude Code's own reporting or the API dashboard for that session)" — an external ground truth independent of this parser. That has **not** been obtained here: the known-good totals above are self-consistent (computed by the parser under test), which resolves the *usage-semantics* and *turn-granularity* unknowns empirically (both were falsifiable and were tested), but does not yet independently confirm the parser's dollar-total accuracy against a source outside the log itself. Before removing banner B0 in the shipped product, cross-check at least one session's total against Anthropic Console / API dashboard billing for that session.
