/** Trim + lowercase for comparisons. */
export function deptNormalize(dept: string | undefined): string {
  return (dept ?? "").trim().toLowerCase();
}

/**
 * Maps mentor-facing department labels ↔ HOD profile labels within the same school.
 * e.g. ATR payloads say "Computer Science" while signup uses "CSE".
 */
const ALIAS_TO_BUCKET: Record<string, string> = (() => {
  const pairs: [string, string][] = [];

  /** Register every spelling variant onto the same bucket id. */
  const bucket = (id: string, labels: string[]) => {
    for (const lbl of labels) {
      pairs.push([deptNormalize(lbl), id]);
    }
  };

  bucket("branch_csc", ["CSE", "CS", "Computer Science", "Computer-Science"]);

  bucket("branch_ece", ["ECE", "Electronics", "Electronics & Communication"]);

  bucket("branch_eee", ["EEE", "Electrical", "Electrical Engineering"]);

  bucket("branch_mech", ["ME", "MECH", "Mechanical", "Mechanical Engineering"]);

  bucket("branch_civil", ["CE", "Civil", "Civil Engineering"]);

  bucket("branch_mca", ["MCA"]);

  bucket("branch_mba", ["MBA"]);

  bucket("branch_chemical", ["Chemical", "Chemical Engineering"]);

  bucket("branch_it", ["IT", "Information Technology"]);

  const m: Record<string, string> = {};
  for (const [alias, bucketId] of pairs) {
    m[alias] = bucketId;
  }
  return m;
})();

/** Short uppercase token embedded in new ATR reference ids (e.g. `bcet2026cse-01`). */
const BUCKET_TO_REFERENCE_CODE: Record<string, string> = {
  branch_csc: "CSE",
  branch_ece: "ECE",
  branch_eee: "EEE",
  branch_mech: "ME",
  branch_civil: "CE",
  branch_mca: "MCA",
  branch_mba: "MBA",
  branch_chemical: "CHEM",
  branch_it: "IT",
};

/**
 * Department segment for stored ATR reference ids — always a compact code (CSE, ECE, …), never a full name.
 * Unknown labels fall back to a short alphanumeric slug from the trimmed name.
 */
export function departmentReferenceCode(dept: string | undefined): string {
  const n = deptNormalize(dept);
  if (!n) return "DEPT";
  const b = ALIAS_TO_BUCKET[n];
  if (b && BUCKET_TO_REFERENCE_CODE[b]) return BUCKET_TO_REFERENCE_CODE[b];
  const compact = n.replace(/[^a-z0-9]+/g, "");
  const slug = compact.slice(0, 10);
  return (slug || "dept").toUpperCase();
}

/**
 * Whether an HOD user may scope an ATR for their departmental queue/detail access.
 */
export function hodDepartmentMatches(reportDept: string | undefined, hodDept: string | undefined): boolean {
  const r = deptNormalize(reportDept);
  const h = deptNormalize(hodDept);
  if (!r || !h) return false;
  if (r === h) return true;

  const br = ALIAS_TO_BUCKET[r];
  const bh = ALIAS_TO_BUCKET[h];
  return br !== undefined && bh !== undefined && br === bh;
}
