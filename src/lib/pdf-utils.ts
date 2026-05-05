import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  actionItemEffectiveStudentCount,
  normalizeChiefMentorValidationChecklist,
  normalizeCoordinatorValidationChecklist,
  normalizeHodValidationChecklist,
  formatAcademicYearHuman,
  type AtrReport,
  type ChiefMentorValidationSnapshot,
  type CoordinatorValidationSnapshot,
  type HodLineDecision,
  type HodValidationSnapshot,
} from "./atr-types";
import { departmentReferenceCode } from "./dept-scope";

// ─────────────────────────────────────────────────────────────────────────────
// 🎨  DESIGN TOKENS  — single source of truth for every layout constant
// ─────────────────────────────────────────────────────────────────────────────

/** Page margin / border inset (mm). */
const PAGE_MARGIN_L = 6;
const PAGE_MARGIN_T = 4;

/** Inner content margins (mm from physical edge). */
const ML = 18;       // left  content edge
const MR_PAD = 18;  // right padding from page edge (MR = pageWidth - MR_PAD)

/** Colour palette — all as [R,G,B] tuples for jsPDF. */
const C = {
  primary:    [22,  101,  52] as [number, number, number], // deep green
  accent:     [15,   76, 129] as [number, number, number], // institutional blue
  dark:       [30,   41,  59] as [number, number, number], // near-black text
  muted:      [71,   85, 105] as [number, number, number], // secondary labels
  light:      [226, 232, 240] as [number, number, number], // divider / border
  tableHead:  [29,   38,  54] as [number, number, number], // table header bg
  red:        [210,   0,   0] as [number, number, number], // institution name
  blue:       [0,   51, 153] as [number, number, number],  // italic subtitle
  grey:       [150, 150, 150] as [number, number, number], // footer / faint
  dimGrey:    [100, 100, 100] as [number, number, number], // timestamps
  white:      [255, 255, 255] as [number, number, number],
  disagree:   [158, 158, 158] as [number, number, number], // cross icon
  sigLine:    [55,   65,  81] as [number, number, number], // signature rule
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function pdfPageCount(doc: jsPDF): number {
  try {
    const d = doc as unknown as {
      getNumberOfPages?: () => number;
      internal?: { getNumberOfPages?: () => number };
    };
    if (typeof d.getNumberOfPages === "function") return d.getNumberOfPages();
    if (d.internal?.getNumberOfPages) return d.internal.getNumberOfPages();
  } catch { /* ignore */ }
  return 1;
}

/** Draw the thin institutional border on one page. */
function drawPageBorder(doc: jsPDF): void {
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(PAGE_MARGIN_L, PAGE_MARGIN_T, w - PAGE_MARGIN_L * 2, h - PAGE_MARGIN_T * 2);
}

/** Stamp borders on every page after the full document is composed. */
function applyMarginBorderAllPages(doc: jsPDF): void {
  const total = pdfPageCount(doc);
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawPageBorder(doc);
  }
}

/** Vector tick-mark (✓) drawn without relying on font glyphs. */
function drawTick(
  doc: jsPDF,
  xLeft: number,
  baselineY: number,
  size: number,
  rgb: readonly [number, number, number],
): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.5);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const s = size;
  const xCorner = xLeft + s * 0.38;
  const yCorner = baselineY - s * 0.22;
  doc.line(xLeft + s * 0.06, yCorner - s * 0.30, xCorner, yCorner);
  doc.line(xCorner, yCorner, xLeft + s * 0.94, baselineY - s * 0.80);
  doc.setLineWidth(0.2);
  doc.setLineCap("butt");
  doc.setLineJoin("miter");
  doc.setDrawColor(0, 0, 0);
}

/** Vector cross-mark (✗) drawn without relying on font glyphs. */
function drawCross(
  doc: jsPDF,
  xLeft: number,
  baselineY: number,
  size: number,
  rgb: readonly [number, number, number],
): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.5);
  doc.setLineCap("round");
  const s   = size;
  const pad = s * 0.18;
  const yTop = baselineY - s + pad * 0.4;
  const yBot = baselineY - pad * 0.7;
  doc.line(xLeft + pad,     yTop, xLeft + s - pad, yBot);
  doc.line(xLeft + s - pad, yTop, xLeft + pad,     yBot);
  doc.setLineWidth(0.2);
  doc.setLineCap("butt");
  doc.setDrawColor(0, 0, 0);
}

/** Horizontal rule with optional label above. */
function sectionDivider(
  doc: jsPDF,
  y: number,
  left: number,
  right: number,
  weight = 0.3,
): void {
  doc.setDrawColor(...C.light);
  doc.setLineWidth(weight);
  doc.line(left, y, right, y);
  doc.setDrawColor(0, 0, 0);
}

/** Two-line double rule (thick + thin) used under the college header. */
function doubleRule(doc: jsPDF, y: number, left: number, right: number): void {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.9);
  doc.line(left, y, right, y);
  doc.setLineWidth(0.25);
  doc.line(left, y + 1.5, right, y + 1.5);
}

/** Labelled metadata column helper — bold label + normal value below. */
function metaCol(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  align: "left" | "center" | "right" = "left",
  maxWidth = 70,
): void {
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.muted);
  doc.text(label, x, y, { align });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text(value, x, y + 5, { align, maxWidth });
}

/** Signature block: rule + role label + name + optional timestamp. */
function signatureBlock(
  doc: jsPDF,
  x: number,
  y: number,
  roleLabel: string,
  name: string,
  timestamp?: string,
  width = 65,
): number {
  doc.setDrawColor(...C.sigLine);
  doc.setLineWidth(0.25);
  doc.line(x, y, x + width, y);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.muted);
  doc.text(roleLabel, x, y + 4.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.dark);
  doc.text(name, x, y + 10);
  if (timestamp) {
    doc.setFontSize(7);
    doc.setTextColor(...C.dimGrey);
    doc.text(timestamp, x, y + 15.5);
    return y + 22;
  }
  return y + 17;
}

/** Section heading (green bold label with optional numeric prefix). */
function sectionHeading(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
): void {
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.primary);
  doc.text(text, x, y);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API types (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export type CoordinatorPdfAudit   = CoordinatorValidationSnapshot;
export type HodPdfAudit           = HodValidationSnapshot;
export type ChiefMentorPdfAudit   = ChiefMentorValidationSnapshot;

export interface GenerateAtrPdfOptions {
  /** IQAC consolidated export — coordinator + HOD + Chief Mentor chain. */
  iqacMergedChain?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main generator  (all logic / flow / exports identical to original)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateAtrPdf(
  report: AtrReport,
  coordinatorAudit?: CoordinatorPdfAudit | null,
  hodAudit?: HodPdfAudit | null,
  chiefMentorAudit?: ChiefMentorPdfAudit | null,
  opts?: GenerateAtrPdfOptions,
): Promise<void> {
  const doc       = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const MR        = pageWidth - MR_PAD;   // right content edge
  const CX        = pageWidth / 2;        // page centre

  // ── Image loader ───────────────────────────────────────────────────────────
  const loadImg = (path: string) =>
    new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.src = path;
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null as unknown as HTMLImageElement);
    });

  const [logoLeft, logoRight] = await Promise.all([
    loadImg("/bcet-logo.jpg"),
    loadImg("/anni.png"),
  ]);

  // ── Odia subtitle via off-screen canvas ────────────────────────────────────
  const renderOdia = (): string | null => {
    const canvas = document.createElement("canvas");
    canvas.width  = 1600;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font      = "bold 40px 'Noto Sans Odia','Segoe UI',Tahoma,sans-serif";
    ctx.fillStyle = "#00b4d8";
    ctx.textAlign = "center";
    ctx.fillText("ବାଲେଶ୍ୱର ବୈଷୟିକ ଓ ପ୍ରଯୁକ୍ତି ମହାବିଦ୍ୟାଳୟ", 800, 52);
    return canvas.toDataURL("image/png");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1.  COLLEGE HEADER
  //      ┌──────────────────────────────────────────────────────────┐
  //      │ [BCET logo]   Institution block (centred)   [Anni logo] │
  //      └──────────────────────────────────────────────────────────┘
  // Logos are vertically centred against the 6-line text block.
  // ══════════════════════════════════════════════════════════════════════════

  const LOGO_L_W = 24, LOGO_L_H = 24;   // BCET logo
  const LOGO_R_W = 22, LOGO_R_H = 22;   // Anniversary logo
  const LOGO_L_X = 10;
  const LOGO_R_X = pageWidth - 10 - LOGO_R_W;

  // Text block: lines 1–6 sit between Y = 9 … 36
  const HDR_TEXT_TOP = 9;
  const HDR_TEXT_BOT = 36;
  const HDR_BLOCK_H  = HDR_TEXT_BOT - HDR_TEXT_TOP;

  const LOGO_L_Y = HDR_TEXT_TOP + (HDR_BLOCK_H - LOGO_L_H) / 2;   // ≈ 9.5
  const LOGO_R_Y = HDR_TEXT_TOP + (HDR_BLOCK_H - LOGO_R_H) / 2;   // ≈ 10.5

  if (logoLeft)  doc.addImage(logoLeft,  "JPEG", LOGO_L_X, LOGO_L_Y, LOGO_L_W, LOGO_L_H);
  if (logoRight) doc.addImage(logoRight, "PNG",  LOGO_R_X, LOGO_R_Y, LOGO_R_W, LOGO_R_H);

  // Text column (2 mm gap each side of logos)
  const TL  = LOGO_L_X + LOGO_L_W + 2;       // ≈ 36
  const TR  = LOGO_R_X - 2;                  // ≈ 166
  const TCX = (TL + TR) / 2;

  // Line 1 — Institution name (red bold)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.red);
  doc.text(
    "BALASORE COLLEGE OF ENGINEERING AND TECHNOLOGY",
    TCX, HDR_TEXT_TOP + 4,
    { align: "center", maxWidth: TR - TL },
  );

  // Line 2 — Odia subtitle (canvas image)
  const odiaUrl = renderOdia();
  if (odiaUrl) {
    const iw = TR - TL - 2;
    doc.addImage(odiaUrl, "PNG", TL + 1, 14.5, iw, 6);
  }

  // Line 3 — Managed by (blue italic)
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.blue);
  doc.text("(Managed by Fakir Mohan Educational & Charitable Trust)", TCX, 23, { align: "center" });

  // Line 4 — Affiliations (black bold)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("[Approved by AICTE, New Delhi and Affiliated to BPUT, Odisha]", TCX, 27.5, { align: "center" });

  // Line 5 — Address
  doc.setFontSize(7.5);
  doc.text("Sergarh, Balasore - 756060, Odisha.  PH: 9777938474", TCX, 31.5, { align: "center" });

  // Line 6 — Web / email (normal, smaller)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    "Website: www.bcetodisha.ac.in  |  Mail: bcetbalasore@yahoo.com / principal@bcetodisha.ac.in",
    CX, 36, { align: "center" },
  );

  // Double rule under header
  doubleRule(doc, 39.5, 8, pageWidth - 8);

  // ══════════════════════════════════════════════════════════════════════════
  // 2.  REPORT FLAGS (same logic as original — no changes)
  // ══════════════════════════════════════════════════════════════════════════

  const chiefPdf   = chiefMentorAudit ?? null;
  const coordPassed = coordinatorAudit ?? null;
  const hodPassed   = hodAudit ?? null;
  const iqacMergedChain = opts?.iqacMergedChain === true && !!chiefPdf;

  const hodForFront =
    hodPassed ?? (iqacMergedChain ? report.hodValidation ?? null : null);
  const coordForFront =
    coordPassed ?? (iqacMergedChain ? report.coordinatorValidation ?? null : null);

  const annexStyle = !!(coordForFront || hodForFront || chiefPdf);
  const standaloneCoordinatorValidationPdf =
    !!coordForFront && !chiefPdf && !hodForFront;
  const standaloneHodValidationPdf =
    !!hodForFront && !chiefPdf && !coordForFront;
  const standaloneChiefMentorValidationPdf =
    !!chiefPdf && !hodForFront && !coordForFront && !iqacMergedChain;

  // ══════════════════════════════════════════════════════════════════════════
  // 3.  REPORT TITLE BAND
  //     Teal coloured pill-strip for visual hierarchy.
  // ══════════════════════════════════════════════════════════════════════════

  let metadataYOffset = 0;

  /** Renders a two-row title band: large title + optional subtitle. */
  const renderTitleBand = (title: string, subtitle?: string): void => {
    // Coloured background strip
    doc.setFillColor(22, 101, 52);
    doc.roundedRect(ML - 2, 42, pageWidth - ML * 2 + 4, subtitle ? 16 : 12, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(subtitle ? 12 : 13);
    doc.setTextColor(...C.white);
    doc.text(title, CX, subtitle ? 48 : 50, { align: "center" });

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(200, 240, 220);
      doc.text(subtitle, CX, 55, { align: "center" });
      metadataYOffset = 4;
    }
  };

  if (iqacMergedChain) {
    renderTitleBand("Mentor-Mentees Report");
  } else if (chiefPdf) {
    renderTitleBand(
      "CHIEF MENTOR REVIEW REPORT",
      "Level 3 institutional endorsement — forwarded to IQAC audit",
    );
  } else if (hodForFront) {
    renderTitleBand(
      "HOD DEPARTMENTAL REVIEW REPORT",
      "Level 2 departmental review — forwarded toward Chief Mentor / institutional chain",
    );
  } else if (coordForFront) {
    renderTitleBand(
      "COORDINATOR VALIDATION REPORT",
      "Level 1 institutional review linked to mentor ATR submission",
    );
  } else {
    renderTitleBand("ACTION TAKEN REPORT (ATR)");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4.  METADATA ROWS  (Reference / Academic Year / Status + Mentor line)
  // ══════════════════════════════════════════════════════════════════════════

  let y = 63 + metadataYOffset;

  // Light background pill for metadata band
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(ML - 2, y - 5, pageWidth - ML * 2 + 4, 14, 1, 1, "F");
  sectionDivider(doc, y - 5,  ML - 2, MR + 2, 0.2);
  sectionDivider(doc, y + 9, ML - 2, MR + 2, 0.2);

  metaCol(doc, "REFERENCE NO.", report.id.toUpperCase(), ML, y);
  metaCol(
    doc,
    "ACADEMIC YEAR",
    report.academicYear?.trim() ? formatAcademicYearHuman(report.academicYear.trim()) : "—",
    CX, y, "center",
  );

  // Status pill
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text("STATUS", MR, y, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.primary);
  doc.text(report.status.toUpperCase(), MR, y + 5, { align: "right" });

  y += 18;

  // Second metadata row: Mentor / Department / Timeline
  if (!standaloneCoordinatorValidationPdf) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(ML - 2, y - 5, pageWidth - ML * 2 + 4, 14, 1, 1, "F");
    sectionDivider(doc, y - 5,  ML - 2, MR + 2, 0.2);
    sectionDivider(doc, y + 9, ML - 2, MR + 2, 0.2);

    if (standaloneChiefMentorValidationPdf && chiefPdf) {
      metaCol(doc, "CHIEF MENTOR",   chiefPdf.chiefMentorName, ML, y);
      metaCol(
        doc, "CYCLE TIMELINE",
        `${format(new Date(report.startDate), "MMM d")} – ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR, y, "right",
      );
    } else if (standaloneHodValidationPdf) {
      metaCol(
        doc, "CYCLE TIMELINE",
        `${format(new Date(report.startDate), "MMM d")} – ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR, y, "right",
      );
    } else {
      metaCol(doc, "MENTOR NAME",  report.mentorName,                              ML,  y);
      metaCol(doc, "DEPARTMENT",   departmentReferenceCode(report.department),     CX,  y, "center");
      metaCol(
        doc, "CYCLE TIMELINE",
        `${format(new Date(report.startDate), "MMM d")} – ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR, y, "right",
      );
    }

    y += 18;
  }

  y += 4;

  const actions = report.actions ?? [];

  // ══════════════════════════════════════════════════════════════════════════
  // 5.  SECTION COMPOSERS  (same logic as original; layout improved)
  // ══════════════════════════════════════════════════════════════════════════

  // ── 5a. Mentor annex (action plan + description + signature) ──────────────
  const appendMentorAnnex = (): void => {
    if (iqacMergedChain) {
      if (y > pageHeight - 90) { doc.addPage(); y = 25; }
      else { y += 10; }

      sectionDivider(doc, y - 3, ML, MR);
      y += 8;
      sectionHeading(doc, "Mentor — Action Taken Report", ML, y);
      y += 10;
    }

    sectionHeading(doc, "1.  ACTION PLAN EXECUTED", ML, y);

    const actionRows = actions.map((a, i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      a.issue,
      { content: String(actionItemEffectiveStudentCount(a)), styles: { halign: "center" as const } },
      a.actionTaken,
      a.timeline,
      a.outcome,
    ]);

    autoTable(doc, {
      startY: y + 5,
      head: [["SL.", "ISSUE IDENTIFIED", "STU.", "ACTION TAKEN", "TIMELINE", "MEASURABLE OUTCOME"]],
      body: actionRows,
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        valign: "middle",
        overflow: "linebreak",
        lineColor: [210, 215, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.tableHead,
        textColor: C.white,
        fontStyle: "bold",
        halign: "center",
        fontSize: 7.5,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        2: { cellWidth: 11, halign: "center" },
        4: { cellWidth: 22, halign: "center" },
        5: { cellWidth: 34 },
      },
      margin: { left: ML, right: MR_PAD },
    });

    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 10;
    if (y > pageHeight - 58) { doc.addPage(); y = 25; }

    // Description block
    const descText = report.description?.trim();
    if (descText) {
      sectionHeading(doc, "2.  REPORT DESCRIPTION", ML, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const splitDesc = doc.splitTextToSize(descText, MR - ML);
      // Light bg for description
      const descH = splitDesc.length * 4.2 + 6;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(ML - 2, y - 2, MR - ML + 4, descH, 1, 1, "F");
      sectionDivider(doc, y - 2,  ML - 2, MR + 2, 0.15);
      sectionDivider(doc, y + descH - 2, ML - 2, MR + 2, 0.15);
      doc.text(splitDesc, ML, y + 3);
      y += descH + 8;
    }

    if (y > pageHeight - 52) { doc.addPage(); y = 35; }
    else { y += 18; }

    y = signatureBlock(doc, ML, y, "Mentor Signature", report.mentorName);
    y += 4;
  };

  // ── 5b. IQAC / Principal sign-off block (IQAC merged export only) ─────────
  const appendIqacPrincipalSignatureBlock = (): void => {
    if (!iqacMergedChain) return;

    if (y > pageHeight - 92) { doc.addPage(); y = 25; }
    else { y += 14; }

    sectionDivider(doc, y - 3, ML, MR);
    y += 8;

    sectionHeading(doc, "IQAC / Institutional Completion", ML, y);
    y += 7;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 70, 70);
    const instrText = doc.splitTextToSize(
      "Print, sign, and stamp where required. Upload the scanned countersigned file in the portal to close the cycle.",
      MR - ML,
    );
    doc.text(instrText, ML, y);
    y += instrText.length * 4.5 + 12;

    // Two signature boxes side by side
    const boxW = (MR - ML - 10) / 2;
    const boxH = 32;

    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML,           y, boxW, boxH, 1.5, 1.5);
    doc.roundedRect(ML + boxW + 10, y, boxW, boxH, 1.5, 1.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text("IQAC / Quality Cell — Signature & Stamp", ML + 4, y + 6);
    doc.text("Principal — Signature & Stamp",           ML + boxW + 14, y + 6);

    doc.setDrawColor(...C.sigLine);
    doc.setLineWidth(0.2);
    doc.line(ML + 4, y + boxH - 8, ML + boxW - 4, y + boxH - 8);
    doc.line(ML + boxW + 14, y + boxH - 8, ML + boxW * 2 + 6, y + boxH - 8);

    y += boxH + 8;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...C.dimGrey);
    doc.text(`Date: ${format(new Date(), "PPP")}`, ML, y);
    y += 8;
  };

  // ── 5c. Validation checklist table (shared by HOD / Coordinator / Chief) ──
  const renderChecklistTable = (
    items: [HodLineDecision, string][],
    startY: number,
  ): number => {
    const tableBody = items.map(([, label], i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      label,
      { content: "", styles: { halign: "center" as const } },
    ]);

    autoTable(doc, {
      startY,
      head: [["SL.", "VALIDATION CRITERIA", "RESULT"]],
      body: tableBody,
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
        valign: "middle",
        overflow: "linebreak",
        lineColor: [210, 215, 220],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.tableHead,
        textColor: C.white,
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 28, halign: "center" },
      },
      margin: { left: ML, right: MR_PAD },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const decision = items[data.row.index]![0];
        const agreed   = decision === "agreed";
        const cell     = data.cell;
        const icon     = 3.2;
        const bY       = cell.y + cell.height - 2.6;
        const xL       = cell.x + (cell.width - icon) / 2;
        if (agreed) drawTick(doc,  xL, bY, icon, C.primary);
        else        drawCross(doc, xL, bY, icon, C.disagree);
      },
    });

    return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY;
  };

  // ── 5d. HOD validation block ──────────────────────────────────────────────
  const appendHodAuditFront = (): void => {
    if (!hodForFront) return;

    if (y > pageHeight - 125) { doc.addPage(); y = 25; }
    else { y += 10; }

    sectionDivider(doc, y - 3, ML, MR);
    y += 8;

    sectionHeading(doc, "1.  HOD VALIDATION CHECKLIST", ML, y);
    y += 8;

    const validatedDisplay = hodForFront.validatedAt
      ? format(new Date(hodForFront.validatedAt), "PPP p")
      : format(new Date(), "PPP p");

    // Identity + meta strip
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(ML - 2, y - 4, MR - ML + 4, 16, 1, 1, "F");
    sectionDivider(doc, y - 4,  ML - 2, MR + 2, 0.15);
    sectionDivider(doc, y + 12, ML - 2, MR + 2, 0.15);

    metaCol(doc, "HOD NAME",   hodForFront.hodName, ML, y);
    metaCol(doc, "VALIDATION REF", report.id.toUpperCase(), MR, y, "right");
    y += 10;

    const metaParts = [
      `Department: ${hodForFront.hodDepartment}`,
      `Reviewed: ${validatedDisplay}`,
      hodForFront.hodEmail ? `Email: ${hodForFront.hodEmail}` : null,
    ].filter(Boolean) as string[];

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.dimGrey);
    doc.text(metaParts.join("   ·   "), ML, y + 5, { maxWidth: MR - ML });
    y += 12;

    const hodCh = normalizeHodValidationChecklist(hodForFront.checklist);
    const hodItems: [HodLineDecision, string][] = [
      [hodCh.mentoringProcessEffective,       "The mentoring process is effective."],
      [hodCh.careerGuidanceMoreStructured,    "Career guidance activities should be more structured."],
      [hodCh.deptCareerProgramsIntegrated,    "Department-level career development programs should be integrated."],
    ];

    y = renderChecklistTable(hodItems, y + 2) + 8;

    // Summary pill
    const allAgreed = hodItems.every(([d]) => d === "agreed");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.primary);
    doc.text("HOD VALIDATION SUMMARY", ML, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    const summaryText = allAgreed
      ? "Validation record certified based on institutional workflow completion."
      : "Review completed with one or more criteria not affirmed; see checklist above and departmental remarks.";
    const summarySplit = doc.splitTextToSize(summaryText, MR - ML);
    doc.text(summarySplit, ML, y);
    y += summarySplit.length * 4.2 + 6;

    if (hodForFront.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.muted);
      doc.text("HOD REMARKS / FEEDBACK", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const remarksSplit = doc.splitTextToSize(hodForFront.reviewRemarks.trim(), MR - ML);
      const remH = remarksSplit.length * 4.2 + 8;
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(ML - 2, y + 2, MR - ML + 4, remH, 1, 1, "F");
      doc.text(remarksSplit, ML, y + 6);
      y += remH + 8;
    }

    if (y > pageHeight - 40) { doc.addPage(); y = 25; }
    else { y += 12; }

    y = signatureBlock(doc, ML, y, "Head of Department (Signature)", hodForFront.hodName, validatedDisplay);
    y += 4;
  };

  // ── 5e. Chief Mentor validation block ─────────────────────────────────────
  const appendChiefMentorAuditFront = (): void => {
    if (!chiefPdf) return;

    if (y > pageHeight - 125) { doc.addPage(); y = 25; }
    else { y += 10; }

    sectionDivider(doc, y - 3, ML, MR);
    y += 8;

    const validatedDisplay = chiefPdf.validatedAt
      ? format(new Date(chiefPdf.validatedAt), "PPP p")
      : format(new Date(), "PPP p");

    // Identity strip
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(ML - 2, y - 4, MR - ML + 4, 14, 1, 1, "F");
    sectionDivider(doc, y - 4,  ML - 2, MR + 2, 0.15);
    sectionDivider(doc, y + 10, ML - 2, MR + 2, 0.15);

    metaCol(doc, "CHIEF MENTOR NAME", chiefPdf.chiefMentorName, ML, y);
    y += 16;

    const chiefCh = normalizeChiefMentorValidationChecklist(chiefPdf.checklist);
    const chiefItems: [HodLineDecision, string][] = [
      [chiefCh.disciplineIssuesHandledWell,         "Discipline issues have been handled well."],
      [chiefCh.coordinationWithMentorsContinued,    "Coordination with mentors should be continued."],
      [chiefCh.sustainedEffortsBehaviorImprovement, "Sustained efforts are recommended for behavior improvement."],
    ];

    y = renderChecklistTable(chiefItems, y + 2) + 8;

    if (chiefPdf.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.muted);
      doc.text("CHIEF MENTOR REMARKS / FEEDBACK", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const remarksSplit = doc.splitTextToSize(chiefPdf.reviewRemarks.trim(), MR - ML);
      const remH = remarksSplit.length * 4.2 + 8;
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(ML - 2, y + 2, MR - ML + 4, remH, 1, 1, "F");
      doc.text(remarksSplit, ML, y + 6);
      y += remH + 8;
    }

    if (y > pageHeight - 40) { doc.addPage(); y = 25; }
    else { y += 12; }

    y = signatureBlock(doc, ML, y, "Chief Mentor (Signature)", chiefPdf.chiefMentorName, validatedDisplay);
    y += 4;
  };

  // ── 5f. Coordinator validation block ──────────────────────────────────────
  const appendCoordinatorAuditFront = (): void => {
    if (!coordForFront) return;

    if (y > pageHeight - 96) { doc.addPage(); y = 25; }
    else { y += 10; }

    sectionDivider(doc, y - 3, ML, MR);
    y += 8;

    const validatedDisplay = coordForFront.validatedAt
      ? format(new Date(coordForFront.validatedAt), "PPP p")
      : format(new Date(), "PPP p");

    // Identity strip
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(ML - 2, y - 4, MR - ML + 4, 16, 1, 1, "F");
    sectionDivider(doc, y - 4,  ML - 2, MR + 2, 0.15);
    sectionDivider(doc, y + 12, ML - 2, MR + 2, 0.15);

    metaCol(doc, "COORDINATOR",  coordForFront.coordinatorName,       ML,  y);
    metaCol(doc, "DEPARTMENT",   coordForFront.coordinatorDepartment, CX,  y, "center", 70);
    metaCol(doc, "VALIDATED ON", validatedDisplay,                    MR,  y, "right");
    y += 18;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.dark);
    doc.text("Mandatory Confirmation Checklist:", ML, y);
    y += 6;

    const coordCh = normalizeCoordinatorValidationChecklist(coordForFront.checklist);
    const coordItems: [HodLineDecision, string][] = [
      [coordCh.allParametersAddressed,         "All parameters are properly addressed."],
      [coordCh.mentorProactive,                "Mentor has taken proactive steps."],
      [coordCh.continuousMonitoringSuggested,  "Suggested continuous monitoring for communication and career guidance."],
    ];

    y = renderChecklistTable(coordItems, y + 2) + 8;

    if (coordForFront.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.muted);
      doc.text("COORDINATOR DESCRIPTION", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.dark);
      const remarksSplit = doc.splitTextToSize(coordForFront.reviewRemarks.trim(), MR - ML);
      const remH = remarksSplit.length * 4.2 + 8;
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(ML - 2, y + 2, MR - ML + 4, remH, 1, 1, "F");
      doc.text(remarksSplit, ML, y + 6);
      y += remH + 8;
    }

    if (y > pageHeight - 40) { doc.addPage(); y = 25; }
    else { y += 12; }

    y = signatureBlock(doc, ML, y, "Coordinator Signature", coordForFront.coordinatorName, validatedDisplay);
    y += 4;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 6.  COMPOSITION ORDER  (identical to original)
  // ══════════════════════════════════════════════════════════════════════════

  if (iqacMergedChain) appendMentorAnnex();

  const showCoordinatorFront =
    !!coordForFront &&
    (iqacMergedChain || !!chiefPdf || (!hodPassed && !!coordPassed));

  if (showCoordinatorFront) appendCoordinatorAuditFront();
  if (hodForFront)          appendHodAuditFront();
  if (chiefPdf)             appendChiefMentorAuditFront();
  if (iqacMergedChain)      appendIqacPrincipalSignatureBlock();
  if (!annexStyle)          appendMentorAnnex();

  // ══════════════════════════════════════════════════════════════════════════
  // 7.  FOOTER — stamped on every page after composition
  // ══════════════════════════════════════════════════════════════════════════

  const totalPages = pdfPageCount(doc);
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 6.5;

    // Thin rule above footer
    doc.setDrawColor(...C.light);
    doc.setLineWidth(0.2);
    doc.line(ML, footerY - 3, MR, footerY - 3);

    const footerLabel = iqacMergedChain
      ? `IQAC merged institutional package (mentor–chief mentor chain) — ${format(new Date(), "PPP p")} | Confidential`
      : chiefMentorAudit
      ? `Chief Mentor review snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
      : hodAudit
      ? `HOD departmental review snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
      : coordinatorAudit
      ? `Coordinator validation snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
      : `Generated on ${format(new Date(), "PPP p")} | Institutional Record - Confidential`;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.grey);
    doc.text(footerLabel,                 CX,  footerY, { align: "center" });
    doc.text(`Page ${p} of ${totalPages}`, MR, footerY, { align: "right" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8.  BORDER + SAVE  (identical filenames to original)
  // ══════════════════════════════════════════════════════════════════════════

  applyMarginBorderAllPages(doc);

  doc.save(
    iqacMergedChain
      ? `${report.id}_IQAC_Merged_Mentor_to_ChiefMentor.pdf`
      : chiefMentorAudit
      ? `${report.id}_ChiefMentor_Validation.pdf`
      : hodAudit
      ? `${report.id}_HOD_Dept_Review.pdf`
      : coordinatorAudit
      ? `${report.id}_Coordinator_Validation.pdf`
      : `${report.id}_Official_Report.pdf`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience exports  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

/** True when coordinator, HOD, and Chief Mentor snapshots exist (required for IQAC merged download). */
export function iqacMergedChainSnapshotsReady(report: AtrReport): boolean {
  return !!(report.coordinatorValidation && report.hodValidation && report.chiefMentorValidation);
}

/** Full-chain PDF from mentor annex through Chief Mentor validations — for IQAC print/sign/scan workflow. */
export async function generateIqacMergedValidationPdf(report: AtrReport): Promise<void> {
  if (!iqacMergedChainSnapshotsReady(report)) {
    throw new Error("Missing coordinator, HOD, or Chief Mentor validation snapshots for this ATR.");
  }
  await generateAtrPdf(
    report,
    report.coordinatorValidation ?? null,
    report.hodValidation          ?? null,
    report.chiefMentorValidation  ?? null,
    { iqacMergedChain: true },
  );
}