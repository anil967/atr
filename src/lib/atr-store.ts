import { useEffect, useState } from "react";
import type { AtrReport, AtrStatus } from "./atr-types";
import { getCurrentUser } from "./auth-store";
import { getAtrsFn, saveAtrFn, deleteAllAtrsFn, getMentorMappingsFn, reviewAtrFn } from "./auth-server";

const KEY = "bcet-atr-reports-v4";
const EVT = "bcet-atr-changed";

function seed(): AtrReport[] {
  return [];
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
  localStorage.setItem(KEY, JSON.stringify(items));
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

export async function createReport(input: Omit<AtrReport, "id" | "status" | "timeline" | "createdAt">): Promise<AtrReport> {
  const items = read();
  const year = new Date().getFullYear();
  const dept = input.department.toLowerCase();
  const count = items.filter(r => r.department.toLowerCase() === dept).length + 1;
  const id = `bcet${year}${dept}-${String(count).padStart(2, "0")}`;
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
      { stage: "submitted", actor: input.mentorName, role: "mentor", at: nowIso, remark: "Submitted for coordinator review." },
      { stage: "coordinator_review", actor: coordinatorName, role: "coordinator", at: nowIso },
    ],
  };

  const next = [report, ...items];
  write(next);
  
  // Async background sync
  saveAtrFn({ data: report }).catch(console.error);
  
  return report;
}

export async function clearAllAtrs() {
  localStorage.setItem(KEY, JSON.stringify([]));
  window.dispatchEvent(new Event(EVT));
  await deleteAllAtrsFn();
}

export async function reviewReport(atrId: string, action: "approve" | "reject", remark?: string) {
  const user = getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  
  const result = await reviewAtrFn({ data: { atrId, user, action, remark } });
  
  // Update local storage if needed
  const items = read();
  const next = items.map(r => {
    if (r.id === atrId) {
      // We don't have the full updated report here easily without refetching or duplicating logic,
      // but getAtrsFn will sync it eventually. For immediate UI update:
      return { 
        ...r, 
        status: result.status,
        timeline: [
          ...(r.timeline || []), 
          { stage: result.status, actor: user.name, role: user.role, remark, at: new Date().toISOString() }
        ]
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
    // Initial load from localStorage
    setItems(listReports());

    // Background sync from MongoDB
    const user = getCurrentUser();
    if (user) {
      getAtrsFn({ data: { user } }).then((remote) => {
        if (remote && Array.isArray(remote)) {
          write(remote); // This will trigger EVT and update UI
        }
      }).catch(console.error);
    }

    const handler = () => setItems(listReports());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
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
