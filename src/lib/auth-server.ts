/**
 * Server-side authentication functions — powered by Supabase.
 * All DB calls use HTTP REST (no TCP sockets) — works perfectly on Cloudflare Workers.
 */
import { createServerFn } from "@tanstack/react-start";
import * as bcrypt from "bcrypt-ts";
import { getSupabase } from "./supabase";
import type { Role, AtrStatus, AtrTimelineEntry } from "./atr-types";

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
  role: Extract<Role, "mentor" | "coordinator">;
  department: string;
  createdAt: string;
}

export interface ApprovedUser {
  id: string;
  name: string;
  email: string;
  role: Extract<Role, "mentor" | "coordinator">;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleSupabaseError(error: any): never {
  const msg = error?.message ?? String(error);
  throw new Error("Database error: " + msg);
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

    // Cost=10: secure and fast within Cloudflare's CPU limits
    const passwordHash = await bcrypt.hash(data.password, 10);

    const isHod = data.role === "hod";

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

// ── Admin/Approval Functions ──────────────────────────────────────────────────

export const getPendingSignupsFn = createServerFn({ method: "POST" }).handler(async () => {
  const sb = getSupabase();
  const { data: docs, error } = await sb
    .from("users")
    .select("*")
    .eq("approval_status", "pending")
    .in("role", ["mentor", "coordinator"])
    .order("created_at", { ascending: false });

  if (error) handleSupabaseError(error);

  return (docs ?? []).map((doc): PendingSignup => ({
    id: doc.id,
    name: String(doc.name),
    email: String(doc.email),
    role: doc.role as "mentor" | "coordinator",
    department: String(doc.department),
    createdAt: new Date(doc.created_at).toISOString(),
  }));
});

export const reviewSignupFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    const sb = getSupabase();
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
    .in("role", ["mentor", "coordinator"])
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
        role: role as "mentor" | "coordinator",
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
        role: role as "mentor" | "coordinator",
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
    
    let query = sb.from("atrs").select("*");

    if (user.role === "mentor") {
      // Mentors only see their own ATRs
      query = query.filter("payload->>mentorId", "eq", user.id);
    } else if (user.role === "coordinator") {
      // Coordinators only see assigned mentors' ATRs
      const { data: mappings } = await sb
        .from("mentor_mappings")
        .select("mentor_id")
        .eq("coordinator_id", user.id);
      
      const assignedMentorIds = (mappings ?? []).map(m => m.mentor_id);
      if (assignedMentorIds.length === 0) return [];
      
      query = query.filter("payload->>mentorId", "in", `(${assignedMentorIds.join(',')})`);
    } else if (user.role === "hod") {
      // HODs see all ATRs from their department
      query = query.filter("payload->>department", "eq", user.department);
    }
    // Admin and Chief Mentor see all ATRs (no filter)

    const { data: rows, error } = await query.order("created_at", { ascending: false });
    
    if (error) handleSupabaseError(error);
    return (rows ?? []).map(row => ({ ...(row.payload as object), id: row.id }));
  });

export const saveAtrFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    const sb = getSupabase();
    const { error } = await sb.from("atrs").upsert({
      id: data.id,
      payload: data,
      updated_at: new Date().toISOString(),
    });
    if (error) handleSupabaseError(error);
    return { ok: true };
  });

export const reviewAtrFn = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: { atrId: string; user: AuthUser; action: "approve" | "reject"; remark?: string } }) => {
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

    // 2. Determine next status
    let nextStatus: AtrStatus = report.status;
    const currentStatus = report.status as AtrStatus;

    if (action === "approve") {
      if (currentStatus === "submitted" || currentStatus === "coordinator_review") nextStatus = "hod_review";
      else if (currentStatus === "hod_review") nextStatus = "chief_mentor_review";
      else if (currentStatus === "chief_mentor_review") nextStatus = "approved";
    } else {
      nextStatus = "rejected";
    }

    // 3. Update timeline
    const newEntry: AtrTimelineEntry = {
      stage: nextStatus,
      actor: user.name,
      role: user.role,
      remark: remark || (action === "approve" ? "Approved and forwarded." : "Returned with concerns."),
      at: new Date().toISOString(),
    };

    const updatedTimeline = [...(report.timeline || []), newEntry];
    const updatedReport = {
      ...report,
      status: nextStatus,
      timeline: updatedTimeline,
    };

    // 4. Save
    const { error: saveError } = await sb
      .from("atrs")
      .update({
        payload: updatedReport,
        updated_at: new Date().toISOString(),
      })
      .eq("id", atrId);

    if (saveError) handleSupabaseError(saveError);
    return { ok: true, status: nextStatus };
  });

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
    const { data: rows, error } = await sb.from("mentor_mappings").select("*");
    if (error) handleSupabaseError(error);
    return rows ?? [];
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
