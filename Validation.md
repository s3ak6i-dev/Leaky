# Leaky — Validation & Calibration Protocol

**Status:** ACTIVE GATE — no diagnostic feature ships without a record in this file.
**Companion docs:** PRD.md §7a (metric integrity model), TRD.md §3.4 (engineering contract)

---

## Why this file exists

Leaky's measurement layer (tokens, costs, charts) is exact or honestly estimated. Its diagnosis layer (the W-findings that say "this is waste") is heuristic. A heuristic that fires on healthy sessions teaches users to ignore it, and an ignored diagnosis layer means Leaky is just a pretty chart. Every threshold in the findings engine was initially authored by intuition; this protocol is how each one earns the right to ship — or gets cut.

## The protocol

### Step 1 — Corpus collection
Target: ≥ 20 real Claude Code session logs spanning short/long sessions, single-file/multi-file work, and at least two model tiers. Sources, in order: maintainer's own logs; opt-in contributions from early users. **Contributors run the calibration script locally and donate only the resulting stats CSV — never transcript content.** The CSV schema contains no file paths (paths are hashed) and no text.

### Step 2 — Labeling (anti-circular)

Before viewing any computed signals, the session's owner labels it. **The label must NOT be based on cost or token count** — those are what Leaky already measures, and labeling on them then validating a cost-derived signal is circular (Leaky would just re-predict the bill it already shows). Label instead on remembered *experience*:
- `wasteful` — "I remember redoing work, the agent thrashed, it re-read things it already knew, I got a worse result than the effort implied"
- `healthy` — "the effort felt proportionate to what I got, regardless of what it cost"
- `unsure` — excluded from scoring

After labeling, compute the correlation between labels and session cost. **If |correlation| > 0.7, the labels are effectively cost in disguise** — the calibration is circular and its results are discarded. This check is mandatory and recorded in each run.

### Step 2b — Statistical power (why corpus size matters)

Precision/recall on a tiny corpus are nearly meaningless: with ~10 wasteful sessions, a finding can hit 0.8 precision by chance. Rules:
- **Minimum 40 sessions with ≥ 15 labeled `wasteful`** before any finding may be marked `validated` (not the earlier "20"; that was an authored guess with no power behind it — the exact mistake this protocol exists to prevent).
- Report **Wilson confidence intervals**, not point estimates. A finding qualifies only if the *lower* bound of its precision CI clears the bar.
- Findings validated on smaller corpora may ship at most as `uncalibrated` (dev-flag / muted), never as `calibrated` amber.
- These corpus sizes are themselves provisional and should be revisited once real data exists; they are floors, not ceilings.

### Step 3 — Signal extraction
Run `npm run calibrate -- <dir-of-jsonl-files>`. One CSV row per session:

| Column | Tier | Candidate for |
|--------|------|---------------|
| total_tokens, turns, duration_min | T1 | context |
| cache_read_share | T1 | W1 |
| max_repeat_read_count, repeat_read_files | T1 | W2 |
| largest_tool_result_chars, total_tool_result_chars | T2 (chars-based) | W3 |
| longest_stretch_turns | T1 | W4 |
| opus_share_of_navigation_turns | T1 | W5 |
| compaction_events_detected | T1 (if detectable at all) | W6 feasibility |
| est_cost_usd | T2 | context |

### Step 4 — Threshold scoring
For each candidate finding, sweep the threshold across the corpus and record precision/recall against labels.

**Acceptance criterion: the LOWER BOUND of the Wilson 90% confidence interval for precision ≥ 0.8, AND recall point estimate ≥ 0.5**, on a corpus meeting the §2b power floor.
Precision is deliberately weighted over recall: a missed leak costs one insight; a false alarm spends credibility, which does not refill.
**Honesty note:** the 0.8 / 0.5 figures are themselves authored starting points, not empirically derived — the same class of number this protocol distrusts. They are provisional and should be pressure-tested once a real corpus exists; if most findings cluster just under or over them, that is a signal the bar itself needs re-derivation, not that the findings are exactly good or bad.

### Step 5 — Verdicts
Each finding gets exactly one verdict recorded below:
- **VALIDATED** — threshold locked into `thresholds.ts` with the run ID; finding ships.
- **REDESIGN** — signal shows promise but the current formulation fails; a redesign hypothesis is written before any new implementation.
- **CUT** — signal does not separate wasteful from healthy sessions; finding removed from the roadmap with a one-line post-mortem.

### Step 6 — Standing re-calibration triggers
A validated finding reverts to `hypothesis` if: (a) the parser's schema handling changes materially, (b) ≥ 2 independent user reports of a false positive, or (c) the corpus doubles (re-score everything on the larger corpus).

## Special validations (blockers for specific findings)

**V-A: chars/4 tool-result estimate (blocks W3).** For sessions where consecutive turns' `input_tokens + cache_creation` deltas isolate a single tool result, compare delta-inferred true size vs chars/4 estimate. W3 unblocks if median absolute error < 25%. Record the measured error rate here.

**V-B: compaction detectability (blocks W6).** Inventory the corpus for any line type/field that marks compaction. W6 unblocks only if compaction is identifiable with zero false positives on the corpus; otherwise W6 is CUT until the log format provides it.

> **Update 2026-07-21 — resolved, zero false positives observed.** Real session logs contain an unambiguous marker: `{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"auto","preTokens":N,"durationMs":N,...}}`. Checked across 3 real sessions (klados: 0 occurrences, Locus: 14 occurrences, Leaky: 0 occurrences) — every hit was a genuine compaction event, no false positives from unrelated content. This unblocks W6 pending the calibration run itself, and also means W4's "turns without a context reset" trigger (currently approximated by raw turnCount — see `src/findings/thresholds.ts`) can be implemented properly against real reset points as a fast-follow. `scripts/calibrate.ts` now extracts `compaction_events_detected` using this marker.

**V-C: does cache_read_share separate at all (the core question).** If no threshold on cache_read_share meets the criterion, W1 is redesigned around whichever corpus signal *does* separate — and the PRD's hero framing is revisited in the same PR. The product does not keep a flagship story its own data contradicts.

## Calibration records

*(empty — this section fills as runs complete; each entry: date, corpus size, finding, threshold, precision, recall, verdict, known failure modes)*

| Date | Corpus n | Finding | Threshold | Precision | Recall | Verdict | Notes |
|------|----------|---------|-----------|-----------|--------|---------|-------|
| — | — | — | — | — | — | — | awaiting first run 