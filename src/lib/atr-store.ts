import { useEffect, useState } from "react";
import type {
  AtrAttachment,
  AtrReport,
  AtrStatus,
  ChiefMentorValidationSnapshot,
  CoordinatorValidationSnapshot,
  HodValidationSnapshot,
} from "./atr-types";
import type { AuthUser } from "./auth-store";
import { getCurrentUser } from "./auth-store";
import { departmentReferenceCode, hodDepartmentMatches } from "./dept-scope";
import { getAtrsFn, saveAtrFn, deleteAllAtrsFn, getMentorMappingsFn, reviewAtrFn } from "./auth-server";
import { completedStageFromApproval } from "./atr-workflow";

const KEY = "bcet-atr-reports-v4";
export const BCET_ATR_CHANGED_EVENT = "bcet-atr-changed";
const EVT = BCET_ATR_CHANGED_EVENT;

function seed(): AtrReport[] {
  return [];
}

/** Strip heavy base64 `dataUrl` before localStorage — keeps names/types/sizes only (~5MB quota). Full payload goes to saveAtrFn. */
export function attachmentMetaOnly(a: AtrAttachment): AtrAttachment {
  return { name: a.name, size: a.size, type: a.type };
}

export function sanitizeReportForStorage(report: AtrReport): AtrReport {
  return {
    ...report,
    attachments: (report.attachments ?? []).map(attachmentMetaOnly),
    actions: (report.actions ?? []).map((action) => ({
      ...action,
      evidenceFiles: (action.evidenceFiles ?? []).map(attachmentMetaOnly),
    })),
    ...(report.iqacSignedScan ? { iqacSignedScan: attachmentMetaOnly(report.iqacSignedScan) } : {}),
  };
}

function atrStatusAdvanceRank(status: AtrStatus | string | undefined): number {
  if (status === "rejected") return 200;
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
  return i >= 0 ? i + 1 : 0;
}

function coordValMerge(local: AtrReport, remote: AtrReport) {
  return remote.coordinatorValidation ?? local.coordinatorValidation;
}

function hodValMerge(local: AtrReport, remote: AtrReport) {
  return remote.hodValidation ?? local.hodValidation;
}

function chiefValMerge(local: AtrReport, remote: AtrReport) {
  return remote.chiefMentorValidation ?? local.chiefMentorValidation;
}

function iqacScanMerge(local: AtrReport, remote: AtrReport) {
  return remote.iqacSignedScan ?? local.iqacSignedScan;
}

/** Prefer server rejection; never let a phantom local REJECTED beat a progressed server row. */
function pickMoreAdvancedReport(local: AtrReport, remote: AtrReport): AtrReport {
  if (remote.status === "rejected") {
    return {
      ...remote,
      coordinatorValidation: coordValMerge(local, remote),
      hodValidation: hodValMerge(local, remote) ?? remote.hodValidation,
      chiefMentorValidation: chiefValMerge(local, remote) ?? remote.chiefMentorValidation,
      iqacSignedScan: iqacScanMerge(local, remote) ?? remote.iqacSignedScan,
    };
  }

  if (
    local.status === "rejected" &&
    remote.status !== "rejected" &&
    atrStatusAdvanceRank(remote.status) > atrStatusAdvanceRank("coordinator_review")
  ) {
    return {
      ...remote,
      coordinatorValidation: coordValMerge(local, remote),
      hodValidation: hodValMerge(local, remote) ?? remote.hodValidation,
      chiefMentorValidation: chiefValMerge(local, remote) ?? remote.chiefMentorValidation,
      iqacSignedScan: iqacScanMerge(local, remote) ?? remote.iqacSignedScan,
    };
  }

  if (local.status === "rejected") {
    return {
      ...local,
      coordinatorValidation: coordValMerge(local, remote),
      hodValidation: hodValMerge(local, remote) ?? local.hodValidation,
      chiefMentorValidation: chiefValMerge(local, remote) ?? local.chiefMentorValidation,
      iqacSignedScan: iqacScanMerge(local, remote) ?? local.iqacSignedScan,
    };
  }

  const rl = atrStatusAdvanceRank(local.status);
  const rr = atrStatusAdvanceRank(remote.status);

  let winner = remote;
  if (rl > rr) winner = local;
  else if (rl === rr) {
    const tl = local.timeline?.length ?? 0;
    const tr = remote.timeline?.length ?? 0;
    winner = tr >= tl ? remote : local;
  }

  return {
    ...winner,
    coordinatorValidation: coordValMerge(local, remote) ?? winner.coordinatorValidation,
    hodValidation: hodValMerge(local, remote) ?? winner.hodValidation,
    chiefMentorValidation: chiefValMerge(local, remote) ?? winner.chiefMentorValidation,
    iqacSignedScan: iqacScanMerge(local, remote) ?? winner.iqacSignedScan,
  };
}

function shouldRetainLocalWithoutRemote(localRow: AtrReport, user: AuthUser): boolean {
  switch (user.role) {
    case "mentor":
      return localRow.mentorId === user.id;
    case "hod":
      return hodDepartmentMatches(localRow.department, user.department);
    default:
      return true;
  }
}

/**
 * Combine server list with cached rows. Critical for coordinators/HOD:
 * stale in-flight GET must not rewind `hod_review` back to `submitted`.
 */
export function mergeServerAndLocalCaches(local: AtrReport[], remote: AtrReport[], user: AuthUser): AtrReport[] {
  const remoteIds = new Set(remote.map((r) => r.id));

  const mergedCore = remote.map((r) => {
    const l = local.find((x) => x.id === r.id);
    return l ? pickMoreAdvancedReport(l, r) : r;
  });

  const orphans = local.filter((l) => !remoteIds.has(l.id) && shouldRetainLocalWithoutRemote(l, user));

  return [...mergedCore, ...orphans].sort((a, b) => {
    const tb = Date.parse(b.createdAt) || 0;
    const ta = Date.parse(a.createdAt) || 0;
    return tb - ta;
  });
}

function read(): AtrReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as AtrReport[];
  } catch {
    return seed();
  }
}

function write(items: AtrReport[]) {
  const payload = JSON.stringify(items);
  const lean = items.map(sanitizeReportForStorage);
  try {
    localStorage.setItem(KEY, payload);
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      try {
        // Fallback mode for storage pressure: keep recent ATR metadata only.
        localStorage.removeItem(KEY);
        localStorage.setItem(KEY, JSON.stringify(lean.slice(0, 15)));
      } catch {
        try {
          localStorage.setItem(KEY, JSON.stringify(lean.slice(0, 5)));
        } catch {
          throw new Error(
            "Browser storage is full. Clear site data for this origin or remove old ATRs, then submit again.",
          );
        }
      }
    } else {
      throw e;
    }
  }
  window.dispatchEvent(new Event(EVT));
}

export function listReports(): AtrReport[] {
  const items = read();
  const user = getCurrentUser();
  if (!user) return [];
  if (user.role === "mentor") {
    return items.filter((r) => r.mentorId === user.id);
  }
  return items;
}

export function getReport(id: string): AtrReport | undefined {
  return read().find((r) => r.id === id);
}

/** Mentor quota for Create ATR — enforced in {@link createReport}. */
export const MAX_ATR_PER_ACADEMIC_YEAR = 4;

export async function createReport(input: Omit<AtrReport, "id" | "status" | "timeline" | "createdAt">): Promise<AtrReport> {
  const items = read();
  const ay = input.academicYear?.trim();
  if (ay && input.mentorId) {
    const usedThisYear = items.filter(
      (r) => r.mentorId === input.mentorId && (r.academicYear ?? "").trim() === ay,
    ).length;
    if (usedThisYear >= MAX_ATR_PER_ACADEMIC_YEAR) {
      throw new Error(
        `You can create at most ${MAX_ATR_PER_ACADEMIC_YEAR} ATRs per academic year. Choose another year or complete existing reports first.`,
      );
    }
  }
  const year = new Date().getFullYear();
  const deptSeg = departmentReferenceCode(input.department).toLowerCase();
  const count =
    items.filter((r) => departmentReferenceCode(r.department).toLowerCase() === deptSeg).length + 1;
  const id = `bcet${year}${deptSeg}-${String(count).padStart(2, "0")}`;
  const nowIso = new Date().toISOString();

  // Lookup assigned coordinator
  let coordinatorId: string | undefined;
  let coordinatorName = "Pending Assignment";
  try {
    const mappings = await getMentorMappingsFn();
    const mapping = mappings?.find((m: any) => m.mentorId === input.mentorId);
    if (mapping) {
      coordinatorId = mapping.coordinatorId;
      coordinatorName = mapping.coordinatorName;
    }
  } catch (e) {
    console.error("Mapping lookup failed", e);
  }

  const report: AtrReport = {
    ...input,
    id,
    coordinatorId,
    coordinatorName,
    status: "submitted",
    createdAt: nowIso,
    timeline: [
      {
        stage: "submitted",
        actor: input.mentorName,
        role: "mentor",
        at: nowIso,
        remark: "Submitted for coordinator review.",
      },
    ],
  };

  const next = [report, ...items];
  write(next);

  // Persist immediately so downstream review actions don't race against a missing server row.
  await saveAtrFn({ data: report });

  return report;
}

export async function clearAllAtrs() {
  localStorage.setItem(KEY, JSON.stringify([]));
  window.dispatchEvent(new Event(EVT));
  await deleteAllAtrsFn();
}

export async function reviewReport(
  atrId: string,
  action: "approve" | "reject",
  remark?: string,
  coordinatorValidation?: CoordinatorValidationSnapshot,
  hodValidation?: HodValidationSnapshot,
  chiefMentorValidation?: ChiefMentorValidationSnapshot,
) {
  const user = getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const requestData = {
    atrId,
    user,
    action,
    remark,
    ...(coordinatorValidation ? { coordinatorValidation } : {}),
    ...(hodValidation ? { hodValidation } : {}),
    ...(chiefMentorValidation ? { chiefMentorValidation } : {}),
  };

  let result: Awaited<ReturnType<typeof reviewAtrFn>>;
  try {
    result = await reviewAtrFn({ data: requestData });
  } catch (err) {
    // Some ATRs can exist only in local cache briefly (or from older local-only sessions).
    // If server row is missing, force an upsert from local cache and retry once.
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (!/ATR not found/i.test(message)) throw err;

    const local = read().find((r) => r.id === atrId);
    if (!local) throw err;

    await saveAtrFn({ data: local });
    result = await reviewAtrFn({ data: requestData });
  }

  const items = read();
  const next = items.map((r) => {
    if (r.id === atrId) {
      return {
        ...r,
        status: result.status,
        coordinatorValidation:
          (result.coordinatorValidation as CoordinatorValidationSnapshot | undefined) ??
          coordinatorValidation ??
          r.coordinatorValidation,
        hodValidation:
          (result.hodValidation as HodValidationSnapshot | undefined) ??
          hodValidation ??
          r.hodValidation,
        chiefMentorValidation:
          (result.chiefMentorValidation as ChiefMentorValidationSnapshot | undefined) ??
          chiefMentorValidation ??
          r.chiefMentorValidation,
        timeline: [
          ...(r.timeline || []),
          {
            stage: completedStageFromApproval(action, user.role, result.status),
            actor: user.name,
            role: user.role,
            remark,
            at: new Date().toISOString(),
          },
        ],
      } as AtrReport;
    }
    return r;
  });
  write(next);

  return result;
}

export async function finalizeIqacWithSignedScan(atrId: string, iqacSignedScan: AtrAttachment, remark?: string) {
  const user = getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const result = await reviewAtrFn({
    data: {
      atrId,
      user,
      action: "iqac_finalize",
      remark,
      iqacSignedScan,
    },
  });

  const scan = result.iqacSignedScan as AtrAttachment | undefined;
  const items = read();
  const next = items.map((r) => {
    if (r.id === atrId) {
      return {
        ...r,
        status: result.status,
        iqacSignedScan: scan ?? iqacSignedScan ?? r.iqacSignedScan,
        timeline: [
          ...(r.timeline || []),
          {
            stage: completedStageFromApproval("iqac_finalize", user.role, result.status),
            actor: user.name,
            role: user.role,
            remark,
            at: new Date().toISOString(),
          },
        ],
      } as AtrReport;
    }
    return r;
  });
  write(next);

  return result;
}

export function useReports(): AtrReport[] {
  const [items, setItems] = useState<AtrReport[]>([]);

  useEffect(() => {
    const refreshList = () => setItems(listReports());

    /** Pull authoritative server list merged with cache (handles stale RPC + orphans). */
    const pullRemote = () => {
      refreshList();
      const user = getCurrentUser();
      if (!user) return;
      getAtrsFn({ data: { user } })
        .then((remote) => {
          if (!Array.isArray(remote)) return;
          const merged = mergeServerAndLocalCaches(read(), remote, user);
          write(merged);
        })
        .catch(console.error);
    };

    pullRemote();

    const onStoreChanged = () => refreshList();

    /** When logging in/out as another role — full resync */
    window.addEventListener("bcet-auth-changed", pullRemote);

    /** Tab foreground — pick up approvals from coordinators on other devices */
    const onVisible = () => {
      if (document.visibilityState === "visible") pullRemote();
    };

    window.addEventListener(EVT, onStoreChanged);
    window.addEventListener("storage", onStoreChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(EVT, onStoreChanged);
      window.removeEventListener("storage", onStoreChanged);
      window.removeEventListener("bcet-auth-changed", pullRemote);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return items;
}

export function statusToneClasses(status: AtrStatus): string {
  switch (status) {
    case "approved":
      return "bg-success/10 text-success border-success/20";
    case "rejected":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "submitted":
      return "bg-muted text-muted-foreground border-border";
    case "coordinator_review":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    case "hod_review":
      return "bg-accent/10 text-accent border-accent/20";
    case "chief_mentor_review":
      return "bg-primary/10 text-primary border-primary/20";
    case "iqac_review":
      return "bg-amber-100/90 text-amber-950 dark:bg-amber-950/35 dark:text-amber-50 border-amber-200/70 dark:border-amber-800/80";
    case "iqac_pending_scan":
      return "bg-orange-50 text-orange-900 dark:bg-orange-950/45 dark:text-orange-50 border-orange-200/80 dark:border-orange-800/60";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function progressOf(status: AtrStatus): number {
  const order: AtrStatus[] = [
    "submitted",
    "coordinator_review",
    "hod_review",
    "chief_mentor_review",
    "approved",
  ];
  if (status === "rejected") return 0;
  if (status === "draft") return 0;
  const idx = order.indexOf(status);
  return ((idx + 1) / order.length) * 100;
}
