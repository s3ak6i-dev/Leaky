/**
 * All finding thresholds live here and nowhere else (TRD §3.2), so a future
 * calibration run is a one-file diff with the run ID in the commit message.
 * These are authored starting points, not calibrated values — see
 * Validation.md. No finding here has run through the calibration protocol
 * yet (Validation.md's calibration-records table is still empty), so every
 * finding currently ships as `status: "hypothesis"` / `confidence:
 * "uncalibrated"` regardless of how tautological its trigger looks.
 */
export const W2_MIN_REPEAT_COUNT = 3;
export const W2_HIGH_SEVERITY_COUNT = 6;

/**
 * W1's trigger is also the core open question Validation.md V-C exists to
 * answer: does cache_read_share separate wasteful from healthy sessions at
 * all? Until a calibration run answers that, this 40% is a guess, not a
 * finding — it ships hypothesis/uncalibrated like everything else here.
 */
export const W1_RESENT_SHARE_THRESHOLD = 0.4; // fraction, i.e. 40%
export const W1_HIGH_SEVERITY_THRESHOLD = 0.65;

/**
 * W4's trigger is nominally "turns without a context reset" (TRD §3.2), but
 * Leaky can't detect resets within a single session file yet — W6's
 * compaction detection is itself blocked (see w6 note below), and this
 * parser only ever sees one session file at a time. Until reset points are
 * detectable, this uses total turnCount as a proxy for stretch length,
 * which is a real simplification worth re-examining once W6 unblocks.
 */
export const W4_MARATHON_TURN_COUNT = 40;
export const W4_HIGH_SEVERITY_TURN_COUNT = 80;

/**
 * W5: opus-tier model used on turns whose only tool calls are pure
 * navigation (Read/Grep/Glob, nothing that edits or executes). Minimum
 * count before it's worth surfacing at all — a single such turn is noise.
 */
export const W5_MIN_NAVIGATION_TURN_COUNT = 3;
export const W5_HIGH_SEVERITY_TURN_COUNT = 10;
export const W5_NAVIGATION_TOOLS = ["Read", "Grep", "Glob"] as const;
