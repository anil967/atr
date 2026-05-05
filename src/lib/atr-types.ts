export type Role = "mentor" | "coordinator" | "hod" | "chief_mentor" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  mentor: "Mentor",
  coordinator: "Coordinator",
  hod: "HOD",
  chief_mentor: "Chief Proctor",
  admin: "Admin",
};

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

export type AtrStatus =
  | "draft"
  | "submitted"
  | "coordinator_review"
  | "hod_review"
  | "chief_mentor_review"
  | "iqac_review"
  | "iqac_pending_scan"
  | "approved"
  | "rejected";

export type AtrSession = "session_1" | "session_2";

export const STATUS_LABELS: Record<AtrStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  coordinator_review: "Coordinator Review",
  hod_review: "HOD Review",
  chief_mentor_review: "Chief Proctor Review",
  iqac_review: "IQAC Audit",
  iqac_pending_scan: "IQAC — signed scan pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Mentor roster / ATR beneficiary row — Excel import + manual edit on My mentee. */
export interface ParsedStudent {
  /** Stable id for UI keys and edits (optional on legacy rows). */
  id?: string;
  name: string;
  rollNo: string;
  semester?: string;
  regNo?: string;
  fatherName?: string;
  branch?: string;
  year?: string;
  contactNumber?: string;
  parentContactNumber?: string;
  address?: string;
  /** Legacy / alternate label for branch */
  department?: string;
  email?: string;
}

export interface AtrAttachment {
  name: string;
  size: number;
  type: string;
  /** Supabase Storage path/URL (remote storage) */
  storagePath?: string;
  /** data URL preview (local cache / small thumbnails) */
  dataUrl?: string;
}

export interface AtrTimelineEntry {
  stage: AtrStatus;
  actor: string;
  role: Role;
  remark?: string;
  at: string; // ISO
}

/** HOD / Chief Mentor per-line response — Agree (tick) or Disagree (cross); stored on the PDF. */
export type HodLineDecision = "agreed" | "disagreed";

/** Persisted checklist when HOD forwards to Chief Mentor. */
export interface HodValidationChecklist {
  mentoringProcessEffective: HodLineDecision;
  allAtrsProperlyFilled: HodLineDecision;
  allDataVerified: HodLineDecision;
}

/** Persisted when HOD forwards to Chief Mentor — powers HOD departmental review PDF regeneration. */
export interface HodValidationSnapshot {
  hodName: string;
  hodDepartment: string;
  hodEmail?: string;
  checklist: HodValidationChecklist;
  reviewRemarks?: string;
  /** ISO timestamp — set server-side when saved. */
  validatedAt?: string;
}

/** Normalize stored checklist for PDF — supports legacy boolean rows and single-flag payloads. */
export function normalizeHodValidationChecklist(
  checklist: HodValidationSnapshot["checklist"] | Record<string, unknown> | undefined,
): HodValidationChecklist {
  const toDecision = (v: unknown): HodLineDecision => {
    if (v === "agreed" || v === "disagreed") return v;
    if (v === true) return "agreed";
    if (v === false) return "disagreed";
    return "agreed";
  };

  if (!checklist || typeof checklist !== "object") {
    return {
      mentoringProcessEffective: "agreed",
      allAtrsProperlyFilled: "agreed",
      allDataVerified: "agreed",
    };
  }
  const c = checklist as Record<string, unknown>;
  
  // Try new keys first, fall back to legacy keys
  const a = c.mentoringProcessEffective;
  const b = c.allAtrsProperlyFilled ?? c.careerGuidanceMoreStructured;
  const d = c.allDataVerified ?? c.deptCareerProgramsIntegrated;

  if (
    (a === "agreed" || a === "disagreed") &&
    (b === "agreed" || b === "disagreed") &&
    (d === "agreed" || d === "disagreed")
  ) {
    return {
      mentoringProcessEffective: a,
      allAtrsProperlyFilled: b,
      allDataVerified: d,
    };
  }
  if (typeof a === "boolean" && typeof b === "boolean" && typeof d === "boolean") {
    return {
      mentoringProcessEffective: toDecision(a),
      allAtrsProperlyFilled: toDecision(b),
      allDataVerified: toDecision(d),
    };
  }
  const legacy = !!(c as { mentoringEffectiveAndCareerPrograms?: boolean }).mentoringEffectiveAndCareerPrograms;
  const leg = toDecision(legacy);
  return {
    mentoringProcessEffective: leg,
    allAtrsProperlyFilled: leg,
    allDataVerified: leg,
  };
}

/** Persisted checklist when Chief Mentor forwards to IQAC. */
export interface ChiefMentorValidationChecklist {
  disciplineIssuesHandledWell: HodLineDecision;
  coordinationWithMentorsContinued: HodLineDecision;
  sustainedEffortsBehaviorImprovement: HodLineDecision;
}

/** Persisted when Chief Mentor forwards to IQAC — Chief Mentor approval PDF. */
export interface ChiefMentorValidationSnapshot {
  chiefMentorName: string;
  chiefMentorDepartment?: string;
  chiefMentorEmail?: string;
  checklist: ChiefMentorValidationChecklist;
  reviewRemarks?: string;
  validatedAt?: string;
}

/** Normalize stored Chief Mentor checklist — supports legacy single boolean. */
export function normalizeChiefMentorValidationChecklist(
  checklist: ChiefMentorValidationSnapshot["checklist"] | Record<string, unknown> | undefined,
): ChiefMentorValidationChecklist {
  const toDecision = (v: unknown): HodLineDecision => {
    if (v === "agreed" || v === "disagreed") return v;
    if (v === true) return "agreed";
    if (v === false) return "disagreed";
    return "agreed";
  };

  if (!checklist || typeof checklist !== "object") {
    return {
      disciplineIssuesHandledWell: "agreed",
      coordinationWithMentorsContinued: "agreed",
      sustainedEffortsBehaviorImprovement: "agreed",
    };
  }
  const c = checklist as Record<string, unknown>;
  const a = c.disciplineIssuesHandledWell;
  const b = c.coordinationWithMentorsContinued;
  const d = c.sustainedEffortsBehaviorImprovement;
  if (
    (a === "agreed" || a === "disagreed") &&
    (b === "agreed" || b === "disagreed") &&
    (d === "agreed" || d === "disagreed")
  ) {
    return {
      disciplineIssuesHandledWell: a,
      coordinationWithMentorsContinued: b,
      sustainedEffortsBehaviorImprovement: d,
    };
  }
  const legacy = !!(c as { endorsesInstitutionalProgression?: boolean }).endorsesInstitutionalProgression;
  const leg = toDecision(legacy);
  return {
    disciplineIssuesHandledWell: leg,
    coordinationWithMentorsContinued: leg,
    sustainedEffortsBehaviorImprovement: leg,
  };
}

/** Coordinator checklist — Agree / Disagree per line (same persisted shape as HOD / Chief Mentor). */
export interface CoordinatorValidationChecklist {
  allParametersAddressed: HodLineDecision;
  mentorProactive: HodLineDecision;
  continuousMonitoringSuggested: HodLineDecision;
}

/** Persisted when a coordinator forwards to HOD; used to regenerate the coordinator validation PDF. */
export interface CoordinatorValidationSnapshot {
  coordinatorName: string;
  coordinatorDepartment: string;
  coordinatorEmail?: string;
  checklist: CoordinatorValidationChecklist;
  reviewRemarks?: string;
  /** ISO timestamp when coordinator approved — set server-side when saved. */
  validatedAt?: string;
}

/** Normalize coordinator checklist — supports legacy three-boolean payloads from older clients. */
export function normalizeCoordinatorValidationChecklist(
  checklist: CoordinatorValidationSnapshot["checklist"] | Record<string, unknown> | undefined,
): CoordinatorValidationChecklist {
  const toDecision = (v: unknown): HodLineDecision => {
    if (v === "agreed" || v === "disagreed") return v;
    if (v === true) return "agreed";
    if (v === false) return "disagreed";
    return "agreed";
  };

  if (!checklist || typeof checklist !== "object") {
    return {
      allParametersAddressed: "agreed",
      mentorProactive: "agreed",
      continuousMonitoringSuggested: "agreed",
    };
  }
  const c = checklist as Record<string, unknown>;
  const a = c.allParametersAddressed;
  const b = c.mentorProactive;
  const d = c.continuousMonitoringSuggested;
  if (
    (a === "agreed" || a === "disagreed") &&
    (b === "agreed" || b === "disagreed") &&
    (d === "agreed" || d === "disagreed")
  ) {
    return {
      allParametersAddressed: a,
      mentorProactive: b,
      continuousMonitoringSuggested: d,
    };
  }
  if (typeof a === "boolean" && typeof b === "boolean" && typeof d === "boolean") {
    return {
      allParametersAddressed: toDecision(a),
      mentorProactive: toDecision(b),
      continuousMonitoringSuggested: toDecision(d),
    };
  }
  return {
    allParametersAddressed: toDecision(a),
    mentorProactive: toDecision(b),
    continuousMonitoringSuggested: toDecision(d),
  };
}

/** Mentee tagged on an action row (from mentor roster via @ mention). */
export interface TaggedMentee {
  rollNo: string;
  name: string;
}

export interface ActionItem {
  id: string;
  issue: string;
  studentCount: number;
  /** Selected mentees for this issue; when present, `studentCount` should match `taggedStudents.length`. */
  taggedStudents?: TaggedMentee[];
  actionTaken: string;
  timeline: string;
  outcome: string;
  evidenceLink?: string;
  evidenceFiles?: AtrAttachment[];
}

/** Count for validation / PDF: prefers tagged list, else legacy numeric `studentCount`. */
export function actionItemEffectiveStudentCount(
  row: Pick<ActionItem, "studentCount" | "taggedStudents">,
): number {
  const tags = row.taggedStudents;
  if (Array.isArray(tags) && tags.length > 0) return tags.length;
  const sc = Number(row.studentCount ?? 0);
  if (Number.isNaN(sc) || sc < 1) return 0;
  return Math.floor(sc);
}

export interface AtrReport {
  id: string;
  /** Legacy free-form title; new ATRs omit this — use {@link atrDisplayLabel} for UI/PDF. */
  title?: string;
  /** Normalized academic-year key, e.g. `2024-2025` (April–March cycle). Used for mentor quota (4 ATRs/year). */
  academicYear?: string;
  /** Academic-year half: session 1 (Apr-Sep) or session 2 (Oct-Mar). */
  session?: AtrSession;
  /** ATR number inside the chosen session: 1 or 2. */
  atrNo?: 1 | 2;
  startDate: string; // ISO date or string
  endDate: string;   // ISO date or string
  mentorId: string;
  mentorName: string;
  department: string;
  students: ParsedStudent[];
  actions: ActionItem[];
  attachments: AtrAttachment[];
  description?: string;
  coordinatorId?: string;
  coordinatorName?: string;
  /** Present after coordinator approves and forwards — powers coordinator PDF regeneration. */
  coordinatorValidation?: CoordinatorValidationSnapshot;
  hodValidation?: HodValidationSnapshot;
  chiefMentorValidation?: ChiefMentorValidationSnapshot;
  /** Scanned signed/stamped institutional package — saved when IQAC completes the cycle. */
  iqacSignedScan?: AtrAttachment;
  status: AtrStatus;
  timeline: AtrTimelineEntry[];
  createdAt: string;
}

/** Human-readable academic year from stored key `2024-2025`. */
export function formatAcademicYearHuman(key: string): string {
  const parts = key.trim().split("-");
  if (parts.length >= 2 && parts[0] && parts[1]) return `${parts[0]}–${parts[1]}`;
  return key.trim();
}

/** List/detail heading: academic year when present; legacy title or reference id. */
export function atrDisplayLabel(r: AtrReport): string {
  const ay = r.academicYear?.trim();
  if (ay) {
    const sessionLabel =
      r.session === "session_1" ? "Session 1" : r.session === "session_2" ? "Session 2" : "";
    const atrNoLabel = r.atrNo ? `ATR ${r.atrNo}` : "";
    const parts = [sessionLabel, atrNoLabel].filter(Boolean);
    if (parts.length > 0) return `Academic Year ${formatAcademicYearHuman(ay)} · ${parts.join(" · ")}`;
    return `Academic Year ${formatAcademicYearHuman(ay)}`;
  }
  if (r.title?.trim()) return r.title.trim();
  return r.id;
}

/**
 * Headline student count for lists/summary: sum of students attached to each action row (tags or
 * legacy `studentCount`). If that sum is zero, falls back to mentor roster length on the report
 * (older ATRs that only carried the beneficiary table).
 */
export function totalStudentsSummary(r: AtrReport): number {
  const listLen = r.students?.length ?? 0;
  const fromActions = (r.actions ?? []).reduce((sum, a) => sum + actionItemEffectiveStudentCount(a), 0);
  if (fromActions > 0) return fromActions;
  return listLen;
}

/** Report-level uploads plus every file under each issue’s supporting evidence. */
export function totalAtrStoredFiles(r: AtrReport): number {
  const top = r.attachments?.length ?? 0;
  const perIssue = (r.actions ?? []).reduce((sum, a) => sum + (a.evidenceFiles?.length ?? 0), 0);
  return top + perIssue;
}
