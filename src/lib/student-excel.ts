import type { ParsedStudent } from "./atr-types";

function normHeader(s: string): string {
  return String(s)
    .replace(/[\u2019'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Match spreadsheet cell using ordered header alias lists (longer phrases first). */
function pick(row: Record<string, unknown>, patterns: string[]): string {
  const keys = Object.keys(row);
  const sorted = [...patterns].sort((a, b) => b.length - a.length);
  for (const pat of sorted) {
    const pn = normHeader(pat);
    if (!pn) continue;
    for (const k of keys) {
      const kn = normHeader(k);
      if (!kn) continue;
      if (kn === pn || kn.includes(pn) || (pn.length >= 4 && kn.includes(pn))) {
        const v = row[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

const NAME = [
  "student name",
  "name",
  "full name",
  "student",
  "student full name",
];
const ROLL = [
  "roll no",
  "roll number",
  "rollno",
  "university roll",
  "college roll",
  "enrollment no",
  "enrollment number",
  "roll",
];
const REG = [
  "reg no",
  "registration no",
  "regno",
  "registration number",
  "reg number",
  "registration",
  "university registration",
];
const FATHER = [
  "father name",
  "fathers name",
  "fathers",
  "father",
  "parent name",
  "guardian name",
];
const BRANCH = ["branch", "stream", "department", "dept"];
const YEAR = ["year", "academic year", "batch", "class year"];
const SEM = ["semester", "sem", "semester no", "sem no"];
const CONTACT = [
  "contact number",
  "contact no",
  "phone",
  "mobile",
  "student mobile",
  "phone number",
  "mobile number",
];
const PARENT_CONTACT = [
  "parent contact number",
  "parent contact",
  "parent phone",
  "father contact",
  "guardian phone",
  "parents mobile",
  "parent mobile",
];
const ADDR = ["address", "full address", "residential address", "home address"];

export function parseStudentRowFromSheet(row: Record<string, unknown>): ParsedStudent | null {
  const name = pick(row, NAME) || "Unknown";
  const rollNo = pick(row, ROLL);
  if (!rollNo.trim()) return null;

  const br = pick(row, [...BRANCH, "discipline"]) || undefined;
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
    name,
    rollNo,
    regNo: pick(row, REG) || undefined,
    fatherName: pick(row, FATHER) || undefined,
    branch: br,
    year: pick(row, YEAR) || undefined,
    semester: pick(row, SEM) || undefined,
    contactNumber: pick(row, CONTACT) || undefined,
    parentContactNumber: pick(row, PARENT_CONTACT) || undefined,
    address: pick(row, ADDR) || undefined,
    department: br,
  };
}

export function parseStudentRowsFromSheet(rows: Record<string, unknown>[]): ParsedStudent[] {
  const out: ParsedStudent[] = [];
  for (const row of rows) {
    const s = parseStudentRowFromSheet(row);
    if (s) out.push(s);
  }
  return out;
}

export function createEmptyStudent(): ParsedStudent {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `st-${Date.now()}`,
    name: "",
    rollNo: "",
    semester: "",
    regNo: "",
    fatherName: "",
    branch: "",
    year: "",
    contactNumber: "",
    parentContactNumber: "",
    address: "",
  };
}

export function ensureStudentIds(students: ParsedStudent[]): ParsedStudent[] {
  return students.map((s) => ({
    ...s,
    id:
      s.id ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `st-${s.rollNo}-${Math.random().toString(36).slice(2, 9)}`),
  }));
}
