/**
 * Server-side authentication functions — powered by Supabase.
 * All DB calls use HTTP REST (no TCP sockets) — works perfectly on Cloudflare Workers.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as bcrypt from "bcrypt-ts";
import { getSupabase } from "./supabase";
import { hodDepartmentMatches } from "./dept-scope";
import { completedStageFromApproval } from "./atr-workflow";
import type {
  AtrAttachment,
  AtrReport,
  ChiefMentorValidationSnapshot,
  CoordinatorValidationSnapshot,
  HodValidationSnapshot,
  Role,
  AtrStatus,
  AtrTimelineEntry,
} from "./atr-types";

/** Higher = further in the approval pipeline. Used to avoid reverting status with stale saves. */
function atrWorkflowAdvanceRank(status: AtrStatus | string | undefined): number {
  const order: AtrStatus[] = [
    "draft",
    "submitted",
    "coordinator_review",
    "hod_review",
    "chief_mentor_review",
    "iqac_review",
    "iqac_pending_scan",
    "approved",
  ];
  const i = order.indexOf(status as AtrStatus);
  if (i >= 0) return i + 1;
  if (status === "rejected") return 200;
  return 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

export interface PendingSignup {
  id: string;
  name: string;
  email: string;
  role: Extract<Role, "mentor" | "coordinator" | "hod">;
  department: string;
  createdAt: string;
}

export interface ApprovedUser {
  id: string;
  name: string;
  email: string;
  role: Extract<Role, "mentor" | "coordinator" | "hod">;
  department: string;
  approvedAt: string | null;
}

export interface SignupApprovalSummary {
  pending: number;
  approved: number;
  rejected: number;
  approvedMentors: number;
  approvedCoordinators: number;
  pendingRequests: PendingSignup[];
  approvedUsers: ApprovedUser[];
}

export interface AdminManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  disabled?: boolean;
  approvalStatus?: string;
  approvedAt?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleSupabaseError(error: any): never {
  const msg = error?.message ?? String(error);
  throw new Error("Database error: " + msg);
}

const HOD_DUPLICATE_DEPT_MSG =
  "This department already has a Head of Department. Only one active HOD is allowed per department (including the same branch under different names, e.g. CSE and Computer Science).";

/** Block a new or newly approved HOD if an active approved HOD already exists for the same dept bucket. */
async function assertSingleActiveHodPerDepartment(sb: SupabaseClient, department: string): Promise<void> {
  const { data: rows, error } = await sb
    .from("users")
    .select("department, disabled")
    .eq("role", "hod")
    .eq("approval_status", "approved");

  if (error) handleSupabaseError(error);

  const dept = String(department).trim();
  for (const row of rows ?? []) {
    if (row.disabled === true) continue;
    if (hodDepartmentMatches(dept, String(row.department))) {
      throw new Error(HOD_DUPLICATE_DEPT_MSG);
    }
  }
}

// ── Auth Functions ────────────────────────────────────────────────────────────

export const loginFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    const sb = getSupabase();
    const email = data.email.toLowerCase().trim();

    const { data: doc, error } = await sb
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !doc) throw new Error("Invalid email or password");

    const valid = await bcrypt.compare(data.password, doc.password_hash as string);
    if (!valid) throw new Error("Invalid email or password");

    if (doc.disabled) throw new Error("Account is disabled. Contact admin.");
    if (doc.approval_status === "pending")
      throw new Error("Your account is pending Chief Proctor approval.");
    if (doc.approval_status === "rejected")
      throw new Error("Your signup request was rejected. Contact Chief Proctor.");

    return {
      id: doc.id as string,
      name: doc.name as string,
      email: doc.email as string,
      role: doc.role as Role,
      department: doc.department as string,
    } satisfies AuthUser;
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true };
});

export const getMeFn = createServerFn({ method: "GET" }).handler(async () => {
  return null;
});

export const signupFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    const sb = getSupabase();
    const email = data.email.toLowerCase().trim();

    // Check duplicate email
    const { data: existing } = await sb
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) throw new Error("An account with this email already exists");

    const passwordHash = await bcrypt.hash(data.password, 10);
    const isHod = data.role === "hod";

    if (isHod) {
      await assertSingleActiveHodPerDepartment(sb, data.department);
    }

    const { error } = await sb.from("users").insert({
      name: data.name.trim(),
      email,
      password_hash: passwordHash,
      role: data.role,
      department: data.department.trim(),
      disabled: false,
      approval_status: isHod ? "approved" : "pending",
      approved_at: isHod ? new Date().toISOString() : null,
    });

    if (error) handleSupabaseError(error);

    return {
      ok: true as const,
      message: "Signup request submitted. Please wait for Chief Proctor approval.",
    };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { userId: string } }) => {
    const sb = getSupabase();
    const { error } = await sb.from("users").delete().eq("id", data.userId);
    if (error) handleSupabaseError(error);
    return { ok: true };
  });

/** Admin-only: create a user directly (approved), bypassing pending signup queue. */
export const createUserByAdminFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    if (data?.actorRole !== "admin") throw new Error("Only admin can add users");
    const sb = getSupabase();
    const email = String(data.email ?? "").toLowerCase().trim();
    const name = String(data.name ?? "").trim();
    const role = String(data.role ?? "") as Role;
    const department = String(data.department ?? "").trim();
    const password = String(data.password ?? "");

    if (!email || !name || !department || !password) {
      throw new Error("Name, email, department and password are required");
    }
    if (!["mentor", "coordinator", "hod", "chief_mentor", "admin"].includes(role)) {
      throw new Error("Invalid role");
    }

    const { data: existing } = await sb
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) throw new Error("A user with this email already exists");

    if (role === "hod") {
      await assertSingleActiveHodPerDepartment(sb, department);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { error } = await sb.from("users").insert({
      name,
      email,
      password_hash: passwordHash,
      role,
      department,
      disabled: false,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    });
    if (error) handleSupabaseError(error);
    return { ok: true as const };
  });

/** Admin-only: list all users for direct create/remove management. */
export const getAllUsersForAdminFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    if (data?.actorRole !== "admin") throw new Error("Only admin can view all users");
    const sb = getSupabase();
    const { data: rows, error } = await sb
      .from("users")
      .select("id, name, email, role, department, disabled, approval_status, approved_at")
      .order("created_at", { ascending: false });
    if (error) handleSupabaseError(error);
    return (rows ?? []).map(
      (r): AdminManagedUser => ({
        id: String(r.id),
        name: String(r.name),
        email: String(r.email),
        role: r.role as Role,
        department: String(r.department ?? ""),
        disabled: r.disabled === true,
        approvalStatus: String(r.approval_status ?? ""),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
      }),
    );
  });

// ── Admin/Approval Functions ──────────────────────────────────────────────────

export const getPendingSignupsFn = createServerFn({ method: "POST" }).handler(async () => {
  const sb = getSupabase();
  const { data: docs, error } = await sb
    .from("users")
    .select("*")
    .eq("approval_status", "pending")
    .in("role", ["mentor", "coordinator", "hod"])
    .order("created_at", { ascending: false });

  if (error) handleSupabaseError(error);

  return (docs ?? []).map((doc): PendingSignup => ({
    id: doc.id,
    name: String(doc.name),
    email: String(doc.email),
    role: doc.role as "mentor" | "coordinator" | "hod",
    department: String(doc.department),
    createdAt: new Date(doc.created_at).toISOString(),
  }));
});

export const reviewSignupFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    const sb = getSupabase();

    if (data.action === "approve") {
      const { data: pendingRow, error: fetchErr } = await sb
        .from("users")
        .select("role, department")
        .eq("id", data.userId)
        .eq("approval_status", "pending")
        .maybeSingle();

      if (fetchErr) handleSupabaseError(fetchErr);
      if (pendingRow?.role === "hod") {
        await assertSingleActiveHodPerDepartment(sb, String(pendingRow.department));
      }
    }

    const { error } = await sb
      .from("users")
      .update({
        approval_status: data.action === "approve" ? "approved" : "rejected",
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.userId)
      .eq("approval_status", "pending");

    if (error) handleSupabaseError(error);
    return { ok: true as const };
  });

export const getSignupApprovalSummaryFn = createServerFn({ method: "POST" }).handler(async () => {
  const sb = getSupabase();

  // Single query — one HTTP request instead of 7 separate DB calls
  const { data: docs, error } = await sb
    .from("users")
    .select("*")
    .in("role", ["mentor", "coordinator", "hod"])
    .order("department", { ascending: true })
    .order("name", { ascending: true });

  if (error) handleSupabaseError(error);

  const pendingRequests: PendingSignup[] = [];
  const approvedUsers: ApprovedUser[] = [];
  let pending = 0, approved = 0, rejected = 0;
  let approvedMentors = 0, approvedCoordinators = 0;

  for (const doc of docs ?? []) {
    const status = doc.approval_status as string;
    const role = doc.role as string;

    if (status === "pending") {
      pending++;
      pendingRequests.push({
        id: doc.id,
        name: String(doc.name),
        email: String(doc.email),
        role: role as "mentor" | "coordinator" | "hod",
        department: String(doc.department),
        createdAt: new Date(doc.created_at).toISOString(),
      });
    } else if (status === "approved") {
      approved++;
      if (role === "mentor") approvedMentors++;
      if (role === "coordinator") approvedCoordinators++;
      approvedUsers.push({
        id: doc.id,
        name: String(doc.name),
        email: String(doc.email),
        role: role as "mentor" | "coordinator" | "hod",
        department: String(doc.department),
        approvedAt: doc.approved_at ? new Date(doc.approved_at).toISOString() : null,
      });
    } else if (status === "rejected") {
      rejected++;
    }
  }

  // Sort pending by newest first
  pendingRequests.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    pending, approved, rejected,
    approvedMentors, approvedCoordinators,
    pendingRequests, approvedUsers,
  } satisfies SignupApprovalSummary;
});

// ── Student Functions ─────────────────────────────────────────────────────────

export const getStudentsFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data?: { mentorId: string } }) => {
    if (!data?.mentorId) return [];
    const sb = getSupabase();
    const { data: row } = await sb
      .from("mentor_students")
      .select("students")
      .eq("mentor_id", data.mentorId)
      .maybeSingle();
    return row?.students ?? [];
  });

export const saveStudentsFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data: { mentorId: string; students: any[] } = ctx.data;
    const sb = getSupabase();
    const { error } = await sb.from("mentor_students").upsert({
      mentor_id: data.mentorId,
      students: data.students,
      updated_at: new Date().toISOString(),
    });
    if (error) handleSupabaseError(error);
    return { ok: true };
  });

// ── ATR Functions ─────────────────────────────────────────────────────────────

export const getAtrsFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { user: AuthUser } }) => {
    const { user } = data;
    const sb = getSupabase();

    if (user.role === "hod") {
      const { data: rows, error } = await sb
        .from("atrs")
        .select(`
          id,
          payload->mentorName,
          payload->department,
          payload->status,
          payload->academicYear,
          payload->startDate,
          payload->endDate,
          payload->actions,
          payload->mentorId,
          created_at
        `)
        .order("created_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (rows ?? [])
        .filter((row: any) => {
          return (
            row.department != null && hodDepartmentMatches(row.department, user.department)
          );
        })
        .map((row: any) => ({ ...row }));
    }

    if (user.role === "coordinator") {
      const { data: mappings } = await sb
        .from("mentor_mappings")
        .select("mentor_id")
        .eq("coordinator_id", user.id);
      const mentorIds = new Set((mappings ?? []).map((m) => m.mentor_id));
      if (mentorIds.size === 0) return [];
      const { data: rows, error } = await sb
        .from("atrs")
        .select(`
          id,
          payload->mentorName,
          payload->department,
          payload->status,
          payload->academicYear,
          payload->startDate,
          payload->endDate,
          payload->actions,
          payload->mentorId,
          created_at
        `)
        .order("created_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (rows ?? [])
        .filter((row: any) => {
          return row.mentorId != null && mentorIds.has(row.mentorId);
        })
        .map((row: any) => ({ ...row }));
    }

    let query = sb.from("atrs").select(`
      id,
      payload->mentorName,
      payload->department,
      payload->status,
      payload->academicYear,
      payload->startDate,
      payload->endDate,
      payload->actions,
      payload->mentorId,
      created_at
    `);

    if (user.role === "mentor") {
      query = query.filter("payload->>mentorId", "eq", user.id);
    }

    const { data: rows, error } = await query.order("created_at", { ascending: false });

    if (error) handleSupabaseError(error);
    return (rows ?? []).map((row: any) => ({ ...row }));
  });

/** Full payload (includes attachment `dataUrl` when present). Local cache strips those to save quota. */
export const getAtrByIdFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { user: AuthUser; atrId: string } }) => {
    const { user, atrId } = data;
    const sb = getSupabase();
    const { data: row, error } = await sb.from("atrs").select("*").eq("id", atrId).maybeSingle();
    if (error) handleSupabaseError(error);
    if (!row) return null;

    const report = { ...(row.payload as object), id: row.id } as {
      mentorId?: string;
      department?: string;
    };

    const mentorId = report.mentorId;
    const department = report.department;

    if (user.role === "admin" || user.role === "chief_mentor") {
      return report;
    }
    if (user.role === "mentor" && mentorId === user.id) {
      return report;
    }
    if (user.role === "hod" && hodDepartmentMatches(department, user.department)) {
      return report;
    }
    if (user.role === "coordinator") {
      const { data: mappings } = await sb
        .from("mentor_mappings")
        .select("mentor_id")
        .eq("coordinator_id", user.id);
      const assignedMentorIds = (mappings ?? []).map((m) => m.mentor_id);
      if (mentorId && assignedMentorIds.includes(mentorId)) {
        return report;
      }
      return null;
    }
    return null;
  },
);

export const saveAtrFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: AtrReport }) => {
    const sb = getSupabase();
    const clientPayload = data;

    const { data: existingRow, error: fetchErr } = await sb
      .from("atrs")
      .select("payload")
      .eq("id", clientPayload.id)
      .maybeSingle();
    if (fetchErr) handleSupabaseError(fetchErr);

    if (existingRow?.payload) {
      const serverPayload = existingRow.payload as AtrReport;
      const sRank = atrWorkflowAdvanceRank(serverPayload.status);
      const cRank = atrWorkflowAdvanceRank(clientPayload.status);
      // Mentor createReport fires saveAtrFn async; if coordinator approves first, the DB is ahead —
      // do not upsert the older "submitted" payload and wipe hod_review.
      if (sRank > cRank) {
        return { ok: true };
      }
    }

    const { error } = await sb.from("atrs").upsert({
      id: clientPayload.id,
      payload: clientPayload,
      updated_at: new Date().toISOString(),
    });
    if (error) handleSupabaseError(error);
    return { ok: true };
  });

export const reviewAtrFn = createServerFn({ method: "POST" })
  .handler(
    async ({
      data,
    }: {
      data: {
        atrId: string;
        user: AuthUser;
        action: "approve" | "reject" | "iqac_finalize";
        remark?: string;
        coordinatorValidation?: CoordinatorValidationSnapshot;
        hodValidation?: HodValidationSnapshot;
        chiefMentorValidation?: ChiefMentorValidationSnapshot;
        iqacSignedScan?: AtrAttachment;
      };
    }) => {
    const { atrId, user, action, remark } = data;
    const sb = getSupabase();

    // 1. Fetch current ATR
    const { data: row, error: fetchError } = await sb
      .from("atrs")
      .select("*")
      .eq("id", atrId)
      .single();

    if (fetchError || !row) throw new Error("ATR not found");
    const report = row.payload as any;
    const currentStatus = report.status as AtrStatus;

    // IQAC terminal step: uploaded countersigned scan → approved (separate from first IQAC approve)
    if (action === "iqac_finalize") {
      if (user.role !== "admin") throw new Error("Only IQAC (admin) can finalize with a signed scan");
      if (currentStatus !== "iqac_pending_scan") throw new Error("ATR is not awaiting the countersigned scan upload");
      const scan = data.iqacSignedScan;
      if (!scan?.name?.trim() || !scan.dataUrl?.trim()) {
        throw new Error("Upload the scanned signed and stamped institutional package before submitting");
      }

      const nextStatus: AtrStatus = "approved";
      const timelineStage = completedStageFromApproval("iqac_finalize", user.role, nextStatus);
      const newEntry: AtrTimelineEntry = {
        stage: timelineStage,
        actor: user.name,
        role: user.role,
        remark: remark?.trim() || "Filed IQAC countersigned scan — ATR cycle complete.",
        at: new Date().toISOString(),
      };

      const updatedReport = {
        ...report,
        status: nextStatus,
        timeline: [...(report.timeline || []), newEntry],
        iqacSignedScan: {
          name: scan.name,
          size: scan.size ?? 0,
          type: scan.type || "application/pdf",
          dataUrl: scan.dataUrl,
        },
      };

      const { error: saveError } = await sb
        .from("atrs")
        .update({
          payload: updatedReport,
          updated_at: new Date().toISOString(),
        })
        .eq("id", atrId);

      if (saveError) handleSupabaseError(saveError);

      return {
        ok: true,
        status: nextStatus,
        coordinatorValidation: report.coordinatorValidation,
        hodValidation: report.hodValidation,
        chiefMentorValidation: report.chiefMentorValidation,
        iqacSignedScan: updatedReport.iqacSignedScan,
      };
    }

    // 2. Role/stage guardrails so users can only act on their own queue stage.
    if (action === "approve" || action === "reject") {
      const canReview =
        (user.role === "coordinator" &&
          (currentStatus === "submitted" || currentStatus === "coordinator_review")) ||
        (user.role === "hod" && currentStatus === "hod_review") ||
        (user.role === "chief_mentor" && currentStatus === "chief_mentor_review") ||
        (user.role === "admin" &&
          (currentStatus === "iqac_review" || currentStatus === "iqac_pending_scan"));
      if (!canReview) {
        throw new Error(`You cannot ${action} this ATR at "${currentStatus}" stage.`);
      }
    }

    // 3. Approve / reject (non-terminal IQAC paths)
    let nextStatus: AtrStatus = report.status;

    if (action === "approve") {
      // Mentor submit uses `submitted`; coordinator validates once — do not stall in an extra pseudo-step.
      // `coordinator_review` kept for backwards compatibility with older payloads.
      if (currentStatus === "submitted" || currentStatus === "coordinator_review") {
        nextStatus = "hod_review";
      } else if (currentStatus === "hod_review") nextStatus = "chief_mentor_review";
      else if (currentStatus === "chief_mentor_review") nextStatus = "iqac_review";
      else if (currentStatus === "iqac_review") nextStatus = "iqac_pending_scan";
    } else {
      nextStatus = "rejected";
    }

    // 4. Update timeline — store the *completed* step (closing actor matches column), not inbox destination.
    const timelineStage: AtrTimelineEntry["stage"] = completedStageFromApproval(
      action,
      user.role,
      nextStatus,
    );

    const newEntry: AtrTimelineEntry = {
      stage: timelineStage,
      actor: user.name,
      role: user.role,
      remark:
        remark || (action === "approve" ? "Approved and forwarded." : "Returned with concerns."),
      at: new Date().toISOString(),
    };

    const updatedTimeline = [...(report.timeline || []), newEntry];

    const isCoordinatorForward =
      action === "approve" &&
      user.role === "coordinator" &&
      (currentStatus === "submitted" || currentStatus === "coordinator_review");

    const coordinatorValidationNext: CoordinatorValidationSnapshot | undefined =
      isCoordinatorForward && data.coordinatorValidation
        ? {
            ...data.coordinatorValidation,
            validatedAt: new Date().toISOString(),
          }
        : (report.coordinatorValidation as CoordinatorValidationSnapshot | undefined);

    const isHodForward =
      action === "approve" && user.role === "hod" && currentStatus === "hod_review";

    const hodValidationNext: HodValidationSnapshot | undefined =
      isHodForward && data.hodValidation
        ? {
            ...data.hodValidation,
            validatedAt: new Date().toISOString(),
          }
        : (report.hodValidation as HodValidationSnapshot | undefined);

    const isChiefMentorForward =
      action === "approve" && user.role === "chief_mentor" && currentStatus === "chief_mentor_review";

    const chiefMentorValidationNext: ChiefMentorValidationSnapshot | undefined =
      isChiefMentorForward && data.chiefMentorValidation
        ? {
            ...data.chiefMentorValidation,
            validatedAt: new Date().toISOString(),
          }
        : (report.chiefMentorValidation as ChiefMentorValidationSnapshot | undefined);

    const updatedReport = {
      ...report,
      status: nextStatus,
      timeline: updatedTimeline,
      ...(coordinatorValidationNext !== undefined ? { coordinatorValidation: coordinatorValidationNext } : {}),
      ...(hodValidationNext !== undefined ? { hodValidation: hodValidationNext } : {}),
      ...(chiefMentorValidationNext !== undefined ? { chiefMentorValidation: chiefMentorValidationNext } : {}),
    };

    // 5. Save
    const { error: saveError } = await sb
      .from("atrs")
      .update({
        payload: updatedReport,
        updated_at: new Date().toISOString(),
      })
      .eq("id", atrId);

    if (saveError) handleSupabaseError(saveError);
    return {
      ok: true,
      status: nextStatus,
      coordinatorValidation: coordinatorValidationNext,
      hodValidation: hodValidationNext,
      chiefMentorValidation: chiefMentorValidationNext,
    };
  },
  );

export const deleteAllAtrsFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const sb = getSupabase();
    const { error } = await sb.from("atrs").delete().neq("id", "");
    if (error) handleSupabaseError(error);
    return { ok: true };
  });

// ── Mentor/Coordinator Mapping Functions ──────────────────────────────────────

export const getAllUsersByRoleFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data: { role: Role } = ctx.data;
    const sb = getSupabase();
    const { data: rows, error } = await sb
      .from("users")
      .select("id, name, department")
      .eq("role", data.role)
      .eq("approval_status", "approved")
      .order("name", { ascending: true });
    if (error) handleSupabaseError(error);
    return (rows ?? []).map(r => ({ id: r.id, name: r.name, department: r.department }));
  });

export const getMentorMappingsFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const sb = getSupabase();
    // Fetch mappings with coordinator names joined from users table
    const { data: rows, error } = await sb
      .from("mentor_mappings")
      .select(`
        mentor_id,
        coordinator_id,
        users!coordinator_id (
          name
        )
      `);
    
    if (error) handleSupabaseError(error);
    
    return (rows ?? []).map((r: any) => ({
      mentorId: r.mentor_id,
      coordinatorId: r.coordinator_id,
      coordinatorName: r.users?.name || "Unknown Coordinator"
    }));
  });

export const saveMentorMappingFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data: { mentorId: string; coordinatorId: string } = ctx.data;
    const sb = getSupabase();
    const { error } = await sb.from("mentor_mappings").upsert({
      mentor_id: data.mentorId,
      coordinator_id: data.coordinatorId,
      updated_at: new Date().toISOString(),
    });
    if (error) handleSupabaseError(error);
    return { ok: true };
  });
export const uploadAtrFileFn = createServerFn({ method: "POST" })
  .handler(async (ctx: { data: FormData }) => {
    const file = ctx.data.get("file") as File;
    const mentorId = ctx.data.get("mentorId") as string;
    
    if (!file || !mentorId) {
      throw new Error("Missing file or mentorId");
    }

    const sb = getSupabase();
    const bucket = "atr-evidence";
    
    // Sanitize filename and create a unique path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `${mentorId}/${timestamp}-${safeName}`;

    const { data, error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      console.error("Storage upload error:", error);
      handleSupabaseError(error);
    }

    const { data: { publicUrl } } = sb.storage.from(bucket).getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: publicUrl,
    };
  });
