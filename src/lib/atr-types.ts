export type Role = "mentor" | "coordinator" | "hod" | "chief_mentor" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  mentor: "Mentor",
  coordinator: "Coordinator",
  hod: "HOD",
  chief_mentor: "Chief Mentor",
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

export const STATUS_LABELS: Record<AtrStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  coordinator_review: "Coordinator Review",
  hod_review: "HOD Review",
  chief_mentor_review: "Chief Mentor Review",
  iqac_review: "IQAC Audit",
  iqac_pending_scan: "IQAC — signed scan pending",
  approved: "Approved",
  rejected: "Rejected",
};

export interface ParsedStudent {
  name: string;
  rollNo: string;
  department?: string;
  [key: string]: string | undefined;
}

export interface AtrAttachment {
  name: string;
  size: number;
  type: string;
  /** data URL preview for images */
  dataUrl?: string;
}

export interface AtrTimelineEntry {
  stage: AtrStatus;
  actor: string;
  role: Role;
  remark?: string;
  at: string; // ISO
}

/** Persisted when HOD forwards to Chief Mentor — powers HOD departmental review PDF regeneration. */
export interface HodValidationSnapshot {
  hodName: string;
  hodDepartment: string;
  hodEmail?: string;
  checklist: {
    mentoringEffectiveAndCareerPrograms: boolean;
  };
  reviewRemarks?: string;
  /** ISO timestamp — set server-side when saved. */
  validatedAt?: string;
}

/** Persisted when Chief Mentor forwards to IQAC — Chief Mentor approval PDF. */
export interface ChiefMentorValidationSnapshot {
  chiefMentorName: string;
  chiefMentorDepartment?: string;
  chiefMentorEmail?: string;
  checklist: {
    endorsesInstitutionalProgression: boolean;
  };
  reviewRemarks?: string;
  validatedAt?: string;
}

/** Persisted when a coordinator forwards to HOD; used to regenerate the coordinator validation PDF. */
export interface CoordinatorValidationSnapshot {
  coordinatorName: string;
  coordinatorDepartment: string;
  coordinatorEmail?: string;
  checklist: {
    allParametersAddressed: boolean;
    mentorProactive: boolean;
    continuousMonitoringSuggested: boolean;
  };
  reviewRemarks?: string;
  /** ISO timestamp when coordinator approved — set server-side when saved. */
  validatedAt?: string;
}

export interface ActionItem {
  id: string;
  issue: string;
  studentCount: number;
  actionTaken: string;
  timeline: string;
  outcome: string;
  evidenceLink?: string;
  evidenceFiles?: AtrAttachment[];
}

export interface AtrReport {
  id: string;
  /** Legacy free-form title; new ATRs omit this — use {@link atrDisplayLabel} for UI/PDF. */
  title?: string;
  /** Normalized academic-year key, e.g. `2024-2025` (April–March cycle). Used for mentor quota (4 ATRs/year). */
  academicYear?: string;
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
  if (ay) return `Academic Year ${formatAcademicYearHuman(ay)}`;
  if (r.title?.trim()) return r.title.trim();
  return r.id;
}

/**
 * Headline student count for lists/summary: max of parsed beneficiary rows vs sum of per-issue
 * {@link ActionItem.studentCount} (mentors often fill framework counts without a beneficiary table).
 */
export function totalStudentsSummary(r: AtrReport): number {
  const listLen = r.students?.length ?? 0;
  const fromActions = (r.actions ?? []).reduce((sum, a) => {
    const n = Number(a.studentCount);
    const add = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    return sum + add;
  }, 0);
  return Math.max(listLen, fromActions);
}
