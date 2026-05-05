import type { AtrStatus, AtrTimelineEntry, Role } from "./atr-types";

/** Canonical order shown in Validation Sequence — must match inbox statuses. */
export const PIPELINE_STAGES = [
  "submitted",
  "coordinator_review",
  "hod_review",
  "chief_mentor_review",
  "iqac_review",
  "iqac_pending_scan",
  "approved",
] as const satisfies readonly AtrStatus[];

export function pipelineIndex(status: AtrStatus): number {
  if (status === "rejected" || status === "draft") return -999;
  const pipe = PIPELINE_STAGES as readonly AtrStatus[];
  const i = pipe.indexOf(status);
  return i >= 0 ? i : -999;
}

/**
 * When a reviewer approves, the timeline row records which lane they cleared (never the downstream inbox —
 * otherwise the Chief Mentor slot showed “completed” as soon as the HOD forwarded).
 */
export function completedStageFromApproval(
  action: "approve" | "reject" | "iqac_finalize",
  role: Role,
  nextStatus: AtrStatus,
): AtrTimelineEntry["stage"] {
  if (action === "reject") return "rejected";
  if (action === "iqac_finalize") return "approved";
  if (role === "admin" && nextStatus === "approved") return "approved";
  if (role === "admin" && nextStatus === "iqac_pending_scan") return "iqac_review";

  switch (role) {
    case "coordinator":
      return "coordinator_review";
    case "hod":
      return "hod_review";
    case "chief_mentor":
      return "chief_mentor_review";
    case "admin":
      return "iqac_review";
    default:
      return "iqac_review";
  }
}

/** Canonical actor role for rows stored under each timeline stage key (reject legacy mismatched payloads). */
const STAGE_EXPECTED_ROLE: Partial<Record<AtrStatus, Role>> = {
  submitted: "mentor",
  coordinator_review: "coordinator",
  hod_review: "hod",
  chief_mentor_review: "chief_mentor",
  iqac_review: "admin",
  iqac_pending_scan: "admin",
  approved: "admin",
};

/**
 * Prefer the newest timeline row whose role matches who should own this step.
 * Old rows wrongly used destination stage + forwarding actor — those get ignored until re-approved.
 */
export function entryForDisplayedStage(
  timeline: AtrTimelineEntry[] | undefined | null,
  stageKey: AtrTimelineEntry["stage"],
): AtrTimelineEntry | undefined {
  if (stageKey === "rejected" || stageKey === "draft") return undefined;

  const want = STAGE_EXPECTED_ROLE[stageKey];
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const hits = safeTimeline.filter((t) => t.stage === stageKey);
  for (let i = hits.length - 1; i >= 0; i--) {
    const e = hits[i]!;
    if (!want || e.role === want) return e;
  }
  return undefined;
}

export function isPipelineStatus(status: AtrStatus): boolean {
  return pipelineIndex(status) >= 0;
}
