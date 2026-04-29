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
  | "approved"
  | "rejected";

export const STATUS_LABELS: Record<AtrStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  coordinator_review: "Coordinator Review",
  hod_review: "HOD Review",
  chief_mentor_review: "Chief Mentor Review",
  iqac_review: "IQAC Audit",
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
  title: string;
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
  status: AtrStatus;
  timeline: AtrTimelineEntry[];
  createdAt: string;
}
