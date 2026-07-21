export type FindingStatus = "hypothesis" | "validated" | "blocked";
export type Severity = "info" | "warn" | "high";
export type Confidence = "calibrated" | "uncalibrated";

/**
 * A waste diagnosis (TRD §3.2). Per the PRD §7a metric integrity model, a
 * Finding is a T3 judgment, never a raw measurement — every one carries a
 * status and confidence so the UI can never present an unvalidated guess as
 * fact. Only `status: "validated"` findings render by default; anything
 * else needs `leaky.showHypothesisFindings` and always shows "uncalibrated".
 */
export interface Finding {
  id: string;
  status: FindingStatus;
  severity: Severity;
  title: string;
  detail: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  confidence: Confidence;
}
