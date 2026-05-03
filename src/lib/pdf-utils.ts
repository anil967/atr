import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
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

function pdfPageCount(doc: jsPDF): number {
  try {
    const d = doc as unknown as {
      getNumberOfPages?: () => number;
      internal?: { getNumberOfPages?: () => number };
    };
    if (typeof d.getNumberOfPages === "function") return d.getNumberOfPages();
    if (d.internal && typeof d.internal.getNumberOfPages === "function") return d.internal.getNumberOfPages();
  } catch {
    /* ignore */
  }
  return 1;
}

/** Inset from physical edges (mm) — matches institutional cover layout comments in {@link generateAtrPdf}. */
const PDF_PAGE_MARGIN_L = 6;
const PDF_PAGE_MARGIN_T = 4;

/** Thin black frame on every page — same geometry as the original single-page rect. */
function drawPdfPageMarginBorder(doc: jsPDF): void {
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(PDF_PAGE_MARGIN_L, PDF_PAGE_MARGIN_T, w - 12, h - 8);
}

function applyMarginBorderAllPages(doc: jsPDF): void {
  const total = pdfPageCount(doc);
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawPdfPageMarginBorder(doc);
  }
}

/** jsPDF Helvetica has no reliable ✓/✗ glyphs — draw tick/cross with vectors next to the label. */
function pdfDrawHodTick(
  doc: jsPDF,
  xLeft: number,
  baselineY: number,
  sizeMm: number,
  rgb: readonly [number, number, number],
): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.48);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const s = sizeMm;
  const by = baselineY;
  const x0 = xLeft;
  const xCorner = x0 + s * 0.4;
  const yCorner = by - s * 0.2;
  doc.line(x0 + s * 0.06, yCorner - s * 0.32, xCorner, yCorner);
  doc.line(xCorner, yCorner, x0 + s * 0.94, by - s * 0.78);
  doc.setLineWidth(0.2);
  doc.setLineCap("butt");
  doc.setLineJoin("miter");
  doc.setDrawColor(0, 0, 0);
}

function pdfDrawHodCross(
  doc: jsPDF,
  xLeft: number,
  baselineY: number,
  sizeMm: number,
  rgb: readonly [number, number, number],
): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.48);
  doc.setLineCap("round");
  const s = sizeMm;
  const by = baselineY;
  const x0 = xLeft;
  const pad = s * 0.18;
  const yTop = by - s + pad * 0.4;
  const yBot = by - pad * 0.7;
  doc.line(x0 + pad, yTop, x0 + s - pad, yBot);
  doc.line(x0 + s - pad, yTop, x0 + pad, yBot);
  doc.setLineWidth(0.2);
  doc.setLineCap("butt");
  doc.setDrawColor(0, 0, 0);
}

/** Passed into PDF generation — same shape as {@link CoordinatorValidationSnapshot}. */
export type CoordinatorPdfAudit = CoordinatorValidationSnapshot;

export type HodPdfAudit = HodValidationSnapshot;

export type ChiefMentorPdfAudit = ChiefMentorValidationSnapshot;

export interface GenerateAtrPdfOptions {
  /** IQAC consolidated export: coordinator + HOD + Chief Mentor sections with distinct title/filename. */
  iqacMergedChain?: boolean;
}

export async function generateAtrPdf(
  report: AtrReport,
  coordinatorAudit?: CoordinatorPdfAudit | null,
  hodAudit?: HodPdfAudit | null,
  chiefMentorAudit?: ChiefMentorPdfAudit | null,
  opts?: GenerateAtrPdfOptions,
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  const loadImg = (path: string) =>
    new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.src = path;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null as any);
    });

  const [logoLeft, logoRight] = await Promise.all([
    loadImg("/bcet-logo.jpg"),
    loadImg("/anni.png"),
  ]);

  // ─────────────────────────────────────────────────────────────
  // 🏛️  HEADER  — zero wasted space, logos flush with text block
  //
  //  Layout (all Y in mm from top of page):
  //
  //   6 ┬─ page border top
  //   8 │  Institution name baseline        ← line 1
  //  14 │  Odia text                        ← line 2
  //  20 │  Managed by                       ← line 3
  //  25 │  Affiliations                     ← line 4
  //  30 │  Address                          ← line 5
  //  35 │  Website/email                    ← line 6
  //     │
  //  Text block height = 35 - 8 = 27 mm
  //  Left  logo: 24×24 → logoY = 8 + (27-24)/2 = 9.5
  //  Right logo: 22×22 → logoY = 8 + (27-22)/2 = 10.5
  // ─────────────────────────────────────────────────────────────

  // ── Logo geometry ──────────────────────────────────────────
  const LW = 24, LH = 24;   // left  logo (BCET)
  const RW = 22, RH = 22;   // right logo (25 Years)
  const LX = 10;             // left  logo X
  const RX = pageWidth - 10 - RW;  // right logo X  (flush right)

  const TEXT_TOP = 8;        // Y where first text line sits
  const TEXT_BOT = 35;       // Y where last  text line sits
  const BLOCK_H = TEXT_BOT - TEXT_TOP;   // 27 mm

  const LY = TEXT_TOP + (BLOCK_H - LH) / 2;   // ~9.5
  const RY = TEXT_TOP + (BLOCK_H - RH) / 2;   // ~10.5

  if (logoLeft) doc.addImage(logoLeft, "JPEG", LX, LY, LW, LH);
  if (logoRight) doc.addImage(logoRight, "PNG", RX, RY, RW, RH);

  // ── Text column (between logos, 2 mm gap each side) ────────
  const TL = LX + LW + 2;           // ~36
  const TR = RX - 2;                // ~166
  const TCX = (TL + TR) / 2;         // centre of text column

  // 1. Institution Name — RED BOLD
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(210, 0, 0);
  doc.text(
    "BALASORE COLLEGE OF ENGINEERING AND TECHNOLOGY",
    TCX, TEXT_TOP + 4,
    { align: "center", maxWidth: TR - TL }
  );

  // 2. Odia subtitle via canvas
  const renderOdia = (): string | null => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 40px 'Noto Sans Odia','Segoe UI',Tahoma,sans-serif";
    ctx.fillStyle = "#00b4d8";
    ctx.textAlign = "center";
    ctx.fillText("ବାଲେଶ୍ୱର ବୈଷୟିକ ଓ ପ୍ରଯୁକ୍ତି ମହାବିଦ୍ୟାଳୟ", 800, 52);
    return canvas.toDataURL("image/png");
  };
  const odiaUrl = renderOdia();
  if (odiaUrl) {
    const iw = TR - TL - 2;
    doc.addImage(odiaUrl, "PNG", TL + 1, 14, iw, 6);
  }

  // 3. Managed by — BLUE ITALIC
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 51, 153);
  doc.text("(Managed by Fakir Mohan Educational & Charitable Trust)", TCX, 22, { align: "center" });

  // 4. Affiliations — BLACK BOLD
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("[Approved by AICTE, New Delhi and Affiliated to BPUT, Odisha]", TCX, 27, { align: "center" });

  // 5. Address
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Sergarh, Balasore- 756060, Odisha. PH: 9777938474", TCX, 31, { align: "center" });

  // 6. Website / email
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    "Website: www.bcetodisha.ac.in  |  Mail ID: bcetbalasore@yahoo.com / principal@bcetodisha.ac.in",
    pageWidth / 2, 35, { align: "center" }
  );

  // 7. Divider — thick + thin
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.9);
  doc.line(8, 39, pageWidth - 8, 39);
  doc.setLineWidth(0.25);
  doc.line(8, 40.5, pageWidth - 8, 40.5);

  // ─────────────────────────────────────────────────────────────
  // 🎨 Constants
  // ─────────────────────────────────────────────────────────────
  const PRIMARY_COLOR = [22, 101, 52] as [number, number, number];
  const SECONDARY_COLOR = [71, 85, 105] as [number, number, number];
  const BORDER_COLOR = [226, 232, 240] as [number, number, number];

  const chiefPdf = chiefMentorAudit ?? null;
  const coordPassed = coordinatorAudit ?? null;
  const hodPassed = hodAudit ?? null;
  const iqacMergedChain = opts?.iqacMergedChain === true && !!chiefPdf;
  /**
   * Standalone Chief Mentor PDF includes only Chief Mentor validation — do not pull HOD/coordinator from the report.
   * IQAC merged export passes all three audits explicitly and sets {@link iqacMergedChain}.
   */
  const hodForFront =
    hodPassed ?? (iqacMergedChain ? report.hodValidation ?? null : null);
  const coordForFront =
    coordPassed ?? (iqacMergedChain ? report.coordinatorValidation ?? null : null);
  const annexStyle = !!(coordForFront || hodForFront || chiefPdf);
  /** Title is "COORDINATOR VALIDATION REPORT" — header omits mentor/cycle row. */
  const standaloneCoordinatorValidationPdf =
    !!coordForFront && !chiefPdf && !hodForFront;
  /** HOD-only export — omit mentor name / mentor department (HOD confirmation lists HOD + dept). */
  const standaloneHodValidationPdf = !!hodForFront && !chiefPdf && !coordForFront;
  /** Chief-only export — omit mentor/dept row (same trim as HOD-only). */
  const standaloneChiefMentorValidationPdf =
    !!chiefPdf && !hodForFront && !coordForFront && !iqacMergedChain;

  // ─────────────────────────────────────────────────────────────
  // 📄 Report Title  (tight below divider)
  // ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  const ML = 20;
  const MR = pageWidth - 20;

  /** Extra vertical shift so metadata clears the subtitle when title is taller. */
  let metadataYOffset = 0;
  if (iqacMergedChain) {
    doc.setFontSize(12);
    doc.text(
      "ATR INSTITUTIONAL VALIDATION PACKAGE",
      pageWidth / 2,
      46,
      { align: "center" },
    );
    doc.text("(MENTOR — CHIEF MENTOR CHAIN)", pageWidth / 2, 53, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text(
      "Merged for IQAC: print, countersign with stamp where required, then scan and upload the signed file to complete the cycle.",
      pageWidth / 2,
      61,
      { align: "center", maxWidth: pageWidth - 36 },
    );
    metadataYOffset = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(20, 66, pageWidth - 20, 66);
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
  } else if (chiefPdf) {
    doc.text("CHIEF MENTOR REVIEW REPORT", pageWidth / 2, 49, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text(
      "Level 3 institutional endorsement — forwarded to IQAC audit",
      pageWidth / 2,
      56,
      { align: "center" },
    );
    metadataYOffset = 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(20, 60, pageWidth - 20, 60);
  } else if (hodForFront) {
    doc.text("HOD DEPARTMENTAL REVIEW REPORT", pageWidth / 2, 49, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text(
      "Level 2 departmental review — forwarded toward Chief Mentor / institutional chain",
      pageWidth / 2,
      56,
      {
        align: "center",
      },
    );
    metadataYOffset = 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(20, 60, pageWidth - 20, 60);
  } else if (coordForFront) {
    doc.text("COORDINATOR VALIDATION REPORT", pageWidth / 2, 49, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("Level 1 institutional review linked to mentor ATR submission", pageWidth / 2, 56, {
      align: "center",
    });
    metadataYOffset = 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(20, 60, pageWidth - 20, 60);
  } else {
    doc.text("ACTION TAKEN REPORT (ATR)", pageWidth / 2, 52, { align: "center" });
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(20, 57, pageWidth - 20, 57);
  }

  // ─────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────
  let y = 66 + metadataYOffset;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SECONDARY_COLOR);
  doc.text("REFERENCE NUMBER", ML, y);
  doc.text("ACADEMIC YEAR", pageWidth / 2, y, { align: "center" });
  doc.text("STATUS", MR, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(report.id.toUpperCase(), ML, y + 5);
  doc.setFont("helvetica", "bold");
  const ayPdf = report.academicYear?.trim();
  doc.text(
    ayPdf ? formatAcademicYearHuman(ayPdf) : "—",
    pageWidth / 2,
    y + 5,
    { align: "center", maxWidth: MR - ML - 60 },
  );
  doc.setTextColor(...PRIMARY_COLOR);
  doc.setFont("helvetica", "normal");
  doc.text(report.status.toUpperCase(), MR, y + 5, { align: "right" });

  y += 15;

  if (!standaloneCoordinatorValidationPdf) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    if (standaloneChiefMentorValidationPdf && chiefPdf) {
      doc.text("CHIEF MENTOR", ML, y);
      doc.text("CYCLE TIMELINE", MR, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(chiefPdf.chiefMentorName, ML, y + 5);
      doc.text(
        `${format(new Date(report.startDate), "MMM d")} - ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR,
        y + 5,
        { align: "right" },
      );
    } else if (standaloneHodValidationPdf) {
      doc.text("CYCLE TIMELINE", MR, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(
        `${format(new Date(report.startDate), "MMM d")} - ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR,
        y + 5,
        { align: "right" },
      );
    } else {
      doc.text("MENTOR NAME", ML, y);
      doc.text("DEPARTMENT", pageWidth / 2, y, { align: "center" });
      doc.text("CYCLE TIMELINE", MR, y, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(report.mentorName, ML, y + 5);
      doc.text(report.department, pageWidth / 2, y + 5, { align: "center" });
      doc.text(
        `${format(new Date(report.startDate), "MMM d")} - ${format(new Date(report.endDate), "MMM d, yyyy")}`,
        MR,
        y + 5,
        { align: "right" },
      );
    }

    y += 18;
  }

  y += 4;

  const actions = report.actions ?? [];

  /** Mentor action plan + description + signature — used for official ATR and leading the IQAC merged package. */
  const appendMentorAnnex = (): void => {
    if (iqacMergedChain) {
      if (y > pageHeight - 85) {
        doc.addPage();
        y = 25;
      } else {
        y += 8;
      }
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.35);
      doc.line(ML, y - 2, MR, y - 2);
      y += 10;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY_COLOR);
      doc.text("Mentor — Action Taken Report", ML, y);
      y += 9;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("1. ACTION PLAN EXECUTED", ML, y);

    const actionRows = actions.map((a, i) => [
      { content: (i + 1).toString(), styles: { halign: "center" } },
      a.issue,
      { content: a.studentCount.toString(), styles: { halign: "center" } },
      a.actionTaken,
      a.timeline,
      a.outcome,
    ]);

    autoTable(doc, {
      startY: y + 4,
      head: [["SL.", "ISSUE IDENTIFIED", "STU.", "ACTION TAKEN", "TIMELINE", "MEASURABLE OUTCOME"]],
      body: actionRows,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2.5, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        2: { cellWidth: 12, halign: "center" },
        4: { cellWidth: 20, halign: "center" },
        5: { cellWidth: 35 },
      },
      margin: { left: ML, right: 20 },
    });

    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 10;
    if (y > pageHeight - 55) {
      doc.addPage();
      y = 25;
    }

    const descText = report.description?.trim();
    if (descText) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY_COLOR);
      doc.text("2. REPORT DESCRIPTION", ML, y);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const splitDesc = doc.splitTextToSize(descText, MR - ML);
      doc.text(splitDesc, ML, y + 5);
      y += 5 + splitDesc.length * 4 + 8;
    }

    if (y > pageHeight - 45) {
      doc.addPage();
      y = 35;
    } else {
      y += 25;
    }

    const sigWidth = 55;
    doc.setDrawColor(...SECONDARY_COLOR);
    doc.setLineWidth(0.2);

    const sigX = (pageWidth - sigWidth) / 2;
    doc.line(sigX, y, sigX + sigWidth, y);
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text("MENTOR SIGNATURE", pageWidth / 2, y + 4, { align: "center" });
    y += 22;
  };

  /** IQAC merged package only — space for IQAC and Principal ink signatures after Chief Mentor. */
  const appendIqacPrincipalSignatureBlock = (): void => {
    if (!iqacMergedChain) return;

    if (y > pageHeight - 88) {
      doc.addPage();
      y = 25;
    } else {
      y += 12;
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    doc.line(ML, y - 2, MR, y - 2);
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("IQAC / institutional completion", ML, y);
    y += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(
      "Print, sign, and stamp where required. Upload the scanned countersigned file in the portal to close the cycle.",
      ML,
      y,
      { maxWidth: MR - ML },
    );
    y += 14;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("IQAC / Quality Cell — signature & stamp", ML, y);
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.25);
    doc.line(ML, y + 14, ML + 78, y + 14);
    y += 26;

    doc.text("Principal — signature & stamp", ML, y);
    doc.line(ML, y + 14, ML + 78, y + 14);
    y += 28;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(`Date: ${format(new Date(), "PPP")}`, ML, y);
    y += 8;
  };

  /** HOD departmental checklist before annexed mentor submission. */
  const appendHodAuditFront = (): void => {
    if (!hodForFront) return;

    if (y > pageHeight - 120) {
      doc.addPage();
      y = 25;
    } else {
      y += 8;
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    doc.line(ML, y - 2, MR, y - 2);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("1. HOD VALIDATION CHECKLIST", ML, y);
    y += 7;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("HOD NAME", ML, y);
    doc.text("VALIDATION REF", MR, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const validationRef = String(report.id).toUpperCase();
    doc.text(hodForFront.hodName, ML, y + 4);
    doc.text(validationRef, MR, y + 4, { align: "right" });
    y += 12;

    const validatedDisplay = hodForFront.validatedAt
      ? format(new Date(hodForFront.validatedAt), "PPP p")
      : format(new Date(), "PPP p");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    const metaBits = [
      `Department: ${hodForFront.hodDepartment}`,
      `Reviewed: ${validatedDisplay}`,
      hodForFront.hodEmail ? `Email: ${hodForFront.hodEmail}` : null,
    ].filter(Boolean) as string[];
    doc.text(metaBits.join("  ·  "), ML, y, { maxWidth: MR - ML });
    y += metaBits.length > 0 ? 7 : 4;

    const hodCh = normalizeHodValidationChecklist(hodForFront.checklist);
    const hodItems: [HodLineDecision, string][] = [
      [hodCh.mentoringProcessEffective, "The mentoring process is effective."],
      [hodCh.careerGuidanceMoreStructured, "Career guidance activities should be more structured."],
      [hodCh.deptCareerProgramsIntegrated, "Department-level career development programs should be integrated."],
    ];
    const disagreeRgbHod: readonly [number, number, number] = [158, 158, 158];
    const hodHeadBg: [number, number, number] = [29, 38, 54];

    const hodTableBody = hodItems.map(([decision, label], i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      label,
      { content: "", styles: { halign: "center" as const } },
    ]);

    autoTable(doc, {
      startY: y + 2,
      head: [["SL.", "VALIDATION CRITERIA", "RESULT"]],
      body: hodTableBody,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.8, valign: "middle", overflow: "linebreak" },
      headStyles: {
        fillColor: hodHeadBg,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 26, halign: "center" },
      },
      margin: { left: ML, right: 20 },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const idx = data.row.index;
        const decision = hodItems[idx]![0];
        const agreed = decision === "agreed";
        const cell = data.cell;
        const icon = 3.1;
        const baselineY = cell.y + cell.height - 2.6;
        const xLeft = cell.x + (cell.width - icon) / 2;
        if (agreed) pdfDrawHodTick(doc, xLeft, baselineY, icon, PRIMARY_COLOR);
        else pdfDrawHodCross(doc, xLeft, baselineY, icon, disagreeRgbHod);
      },
    });

    const docLast = doc as unknown as { lastAutoTable?: { finalY: number } };
    y = (docLast.lastAutoTable?.finalY ?? y) + 8;

    const allAgreed = hodItems.every(([d]) => d === "agreed");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("HOD VALIDATION SUMMARY", ML, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const summaryLines = allAgreed
      ? "Validation record certified based on institutional workflow completion."
      : "Review completed with one or more criteria not affirmed; see checklist above and departmental remarks.";
    const summarySplit = doc.splitTextToSize(summaryLines, MR - ML);
    doc.text(summarySplit, ML, y);
    y += summarySplit.length * 4 + 6;

    if (hodForFront.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SECONDARY_COLOR);
      doc.text("HOD REMARKS / FEEDBACK", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const remarksSplit = doc.splitTextToSize(hodForFront.reviewRemarks.trim(), MR - ML);
      doc.text(remarksSplit, ML, y + 4);
      y += remarksSplit.length * 4 + 10;
    }

    if (y > pageHeight - 40) {
      doc.addPage();
      y = 25;
    }
    y += 12;
    const sigLen = Math.min(68, MR - ML - 40);
    doc.setDrawColor(55, 65, 81);
    doc.line(ML, y, ML + sigLen, y);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("Head of department (signature)", ML, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(hodForFront.hodName, ML, y + 10);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(validatedDisplay, ML, y + 15);
    y += 22;
  };

  const appendChiefMentorAuditFront = (): void => {
    if (!chiefPdf) return;

    if (y > pageHeight - 120) {
      doc.addPage();
      y = 25;
    } else {
      y += 8;
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    doc.line(ML, y - 2, MR, y - 2);
    y += 8;

    const validatedDisplay = chiefPdf.validatedAt
      ? format(new Date(chiefPdf.validatedAt), "PPP p")
      : format(new Date(), "PPP p");

    /** Chief Mentor standalone / merged: identity row — name only (no checklist title, ref, or affiliation line). */
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("CHIEF MENTOR NAME", ML, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(chiefPdf.chiefMentorName, ML, y + 5);
    y += 13;

    const chiefCh = normalizeChiefMentorValidationChecklist(chiefPdf.checklist);
    const chiefItems: [HodLineDecision, string][] = [
      [chiefCh.disciplineIssuesHandledWell, "Discipline issues have been handled well."],
      [chiefCh.coordinationWithMentorsContinued, "Coordination with mentors should be continued."],
      [chiefCh.sustainedEffortsBehaviorImprovement, "Sustained efforts are recommended for behavior improvement."],
    ];
    const disagreeRgbChief: readonly [number, number, number] = [158, 158, 158];
    const chiefHeadBg: [number, number, number] = [29, 38, 54];

    const chiefTableBody = chiefItems.map(([decision, label], i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      label,
      { content: "", styles: { halign: "center" as const } },
    ]);

    autoTable(doc, {
      startY: y + 2,
      head: [["SL.", "VALIDATION CRITERIA", "RESULT"]],
      body: chiefTableBody,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.8, valign: "middle", overflow: "linebreak" },
      headStyles: {
        fillColor: chiefHeadBg,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 26, halign: "center" },
      },
      margin: { left: ML, right: 20 },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const idx = data.row.index;
        const decision = chiefItems[idx]![0];
        const agreed = decision === "agreed";
        const cell = data.cell;
        const icon = 3.1;
        const baselineY = cell.y + cell.height - 2.6;
        const xLeft = cell.x + (cell.width - icon) / 2;
        if (agreed) pdfDrawHodTick(doc, xLeft, baselineY, icon, PRIMARY_COLOR);
        else pdfDrawHodCross(doc, xLeft, baselineY, icon, disagreeRgbChief);
      },
    });

    const docChiefLast = doc as unknown as { lastAutoTable?: { finalY: number } };
    y = (docChiefLast.lastAutoTable?.finalY ?? y) + 8;

    if (chiefPdf.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SECONDARY_COLOR);
      doc.text("CHIEF MENTOR REMARKS / FEEDBACK", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const remarksSplit = doc.splitTextToSize(chiefPdf.reviewRemarks.trim(), MR - ML);
      doc.text(remarksSplit, ML, y + 4);
      y += remarksSplit.length * 4 + 10;
    }

    if (y > pageHeight - 40) {
      doc.addPage();
      y = 25;
    }
    y += 12;
    const sigLen = Math.min(68, MR - ML - 40);
    doc.setDrawColor(55, 65, 81);
    doc.line(ML, y, ML + sigLen, y);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("Chief Mentor (signature)", ML, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(chiefPdf.chiefMentorName, ML, y + 10);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(validatedDisplay, ML, y + 15);
    y += 22;
  };

  /** Coordinator checklist, remarks, and signature appear before annexed mentor tables. */
  const appendCoordinatorAuditFront = (): void => {
    if (!coordForFront) return;

    if (y > pageHeight - 92) {
      doc.addPage();
      y = 25;
    } else {
      y += 8;
    }

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    doc.line(ML, y - 2, MR, y - 2);
    y += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("COORDINATOR", ML, y);
    doc.text("DEPARTMENT", pageWidth / 2, y, { align: "center" });
    doc.text("VALIDATED ON", MR, y, { align: "right" });

    const validatedDisplay = coordForFront.validatedAt
      ? format(new Date(coordForFront.validatedAt), "PPP p")
      : format(new Date(), "PPP p");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(coordForFront.coordinatorName, ML, y + 5);
    doc.text(coordForFront.coordinatorDepartment, pageWidth / 2, y + 5, { align: "center", maxWidth: 70 });
    doc.text(validatedDisplay, MR, y + 5, { align: "right" });
    y += 14;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Mandatory confirmation checklist:", ML, y);
    y += 6;

    const coordCh = normalizeCoordinatorValidationChecklist(coordForFront.checklist);
    const coordItems: [HodLineDecision, string][] = [
      [coordCh.allParametersAddressed, "All parameters are properly addressed."],
      [coordCh.mentorProactive, "Mentor has taken proactive steps."],
      [coordCh.continuousMonitoringSuggested, "Suggested continuous monitoring for communication and career guidance."],
    ];
    const disagreeRgbCoord: readonly [number, number, number] = [158, 158, 158];
    const coordHeadBg: [number, number, number] = [29, 38, 54];

    const coordTableBody = coordItems.map(([decision, label], i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      label,
      { content: "", styles: { halign: "center" as const } },
    ]);

    autoTable(doc, {
      startY: y + 2,
      head: [["SL.", "VALIDATION CRITERIA", "RESULT"]],
      body: coordTableBody,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.8, valign: "middle", overflow: "linebreak" },
      headStyles: {
        fillColor: coordHeadBg,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 26, halign: "center" },
      },
      margin: { left: ML, right: 20 },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const idx = data.row.index;
        const decision = coordItems[idx]![0];
        const agreed = decision === "agreed";
        const cell = data.cell;
        const icon = 3.1;
        const baselineY = cell.y + cell.height - 2.6;
        const xLeft = cell.x + (cell.width - icon) / 2;
        if (agreed) pdfDrawHodTick(doc, xLeft, baselineY, icon, PRIMARY_COLOR);
        else pdfDrawHodCross(doc, xLeft, baselineY, icon, disagreeRgbCoord);
      },
    });

    const docCoordLast = doc as unknown as { lastAutoTable?: { finalY: number } };
    y = (docCoordLast.lastAutoTable?.finalY ?? y) + 8;

    if (coordForFront.reviewRemarks?.trim()) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SECONDARY_COLOR);
      doc.text("COORDINATOR DESCRIPTION", ML, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const remarksSplit = doc.splitTextToSize(coordForFront.reviewRemarks.trim(), MR - ML);
      doc.text(remarksSplit, ML, y + 4);
      y += remarksSplit.length * 4 + 10;
    }

    if (y > pageHeight - 40) {
      doc.addPage();
      y = 25;
    }
    y += 12;
    const sigLen = Math.min(68, MR - ML - 40);
    doc.setDrawColor(55, 65, 81);
    doc.line(ML, y, ML + sigLen, y);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("Coordinator signature", ML, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(coordForFront.coordinatorName, ML, y + 10);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(validatedDisplay, ML, y + 15);
    y += 22;
  };

  /**
   * IQAC merged: Mentor ATR first → Coordinator → HOD → Chief Mentor → IQAC/Principal sign-off.
   * Official mentor-only PDF: annex content only when not coordinator/HOD/chief snapshot exports.
   */
  if (iqacMergedChain) {
    appendMentorAnnex();
  }

  const showCoordinatorFront =
    !!coordForFront &&
    (iqacMergedChain || !!chiefPdf || (!hodPassed && !!coordPassed));

  if (showCoordinatorFront) appendCoordinatorAuditFront();
  if (hodForFront) appendHodAuditFront();
  if (chiefPdf) appendChiefMentorAuditFront();

  if (iqacMergedChain) {
    appendIqacPrincipalSignatureBlock();
  }

  if (!annexStyle) {
    appendMentorAnnex();
  }

  // ─────────────────────────────────────────────────────────────
  // 📄 Footer
  // ─────────────────────────────────────────────────────────────
  const footerY = pageHeight - 8;
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text(
    iqacMergedChain
      ? `IQAC merged institutional package (mentor–chief mentor chain) — ${format(new Date(), "PPP p")} | Confidential`
      : chiefMentorAudit
      ? `Chief Mentor review snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
      : hodAudit
        ? `HOD departmental review snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
        : coordinatorAudit
          ? `Coordinator validation snapshot — ${format(new Date(), "PPP p")} | Institutional Record - Confidential`
          : `Generated on ${format(new Date(), "PPP p")} | Institutional Record - Confidential`,
    pageWidth / 2,
    footerY,
    { align: "center" },
  );
  doc.text(`Page ${pdfPageCount(doc)}`, MR, footerY, { align: "right" });

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
    report.hodValidation ?? null,
    report.chiefMentorValidation ?? null,
    { iqacMergedChain: true },
  );
}