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
