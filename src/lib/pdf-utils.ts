import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { AtrReport } from "./atr-types";

export async function generateAtrPdf(report: AtrReport) {
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

  // Page border
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.4);
  doc.rect(6, 4, pageWidth - 12, pageHeight - 8);

  // ─────────────────────────────────────────────────────────────
  // 📄 Report Title  (tight below divider)
  // ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("ACTION TAKEN REPORT (ATR)", pageWidth / 2, 52, { align: "center" });

  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.line(20, 57, pageWidth - 20, 57);

  // ─────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────
  const ML = 20;
  const MR = pageWidth - 20;
  let y = 66;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SECONDARY_COLOR);
  doc.text("REFERENCE NUMBER", ML, y);
  doc.text("SESSION TITLE", pageWidth / 2, y, { align: "center" });
  doc.text("STATUS", MR, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(report.id.toUpperCase(), ML, y + 5);
  doc.setFont("helvetica", "bold");
  doc.text(report.title, pageWidth / 2, y + 5, { align: "center", maxWidth: MR - ML - 60 });
  doc.setTextColor(...PRIMARY_COLOR);
  doc.setFont("helvetica", "normal");
  doc.text(report.status.toUpperCase(), MR, y + 5, { align: "right" });

  y += 15;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...SECONDARY_COLOR);
  doc.text("MENTOR NAME", ML, y);
  doc.text("DEPARTMENT", pageWidth / 2, y, { align: "center" });
  doc.text("CYCLE TIMELINE", MR, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(report.mentorName, ML, y + 5);
  doc.text(report.department, pageWidth / 2, y + 5, { align: "center" });
  doc.text(
    `${format(new Date(report.startDate), "MMM d")} - ${format(new Date(report.endDate), "MMM d, yyyy")}`,
    MR, y + 5, { align: "right" }
  );

  y += 18;

  if (report.description) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...SECONDARY_COLOR);
    doc.text("REPORT DESCRIPTION", ML, y);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const splitDesc = doc.splitTextToSize(report.description, MR - ML);
    doc.text(splitDesc, ML, y + 5);
    y += (splitDesc.length * 4) + 12;
  }

  y += 4; // Extra space before table section

  // ─────────────────────────────────────────────────────────────
  // 1. ACTION PLAN EXECUTED
  // ─────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("1. ACTION PLAN EXECUTED", ML, y);

  const actionRows = report.actions.map((a, i) => [
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
      // Columns 1 and 3 will auto-expand to fill available width
      2: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 35 },
    },
    margin: { left: ML, right: 20 },
  });

  // ─────────────────────────────────────────────────────────────
  // 2. STUDENT BENEFICIARY LIST
  // ─────────────────────────────────────────────────────────────
  y = (doc as any).lastAutoTable.finalY + 10;
  if (y > pageHeight - 60) { doc.addPage(); y = 25; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("2. STUDENT BENEFICIARY LIST", ML, y);

  const studentRows = report.students.map((s, i) => [
    { content: (i + 1).toString(), styles: { halign: "center" } },
    s.name,
    s.rollNo,
    s.department || report.department,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["SL.", "STUDENT NAME", "ROLL NUMBER", "DEPARTMENT / BRANCH"]],
    body: studentRows,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: SECONDARY_COLOR, textColor: [255, 255, 255], fontStyle: "bold" },
    margin: { left: ML, right: 20 },
  });

  // ─────────────────────────────────────────────────────────────
  // ✍️ Sign-off
  // ─────────────────────────────────────────────────────────────
  y = (doc as any).lastAutoTable.finalY + 35;
  if (y > pageHeight - 35) { doc.addPage(); y = 35; }

  const sigWidth = 60;
  doc.setDrawColor(...SECONDARY_COLOR);
  doc.setLineWidth(0.2);

  const sigX = (pageWidth - sigWidth) / 2;
  doc.line(sigX, y, sigX + sigWidth, y);
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text("MENTOR SIGNATURE", pageWidth / 2, y + 4, { align: "center" });

  // ─────────────────────────────────────────────────────────────
  // 📄 Footer
  // ─────────────────────────────────────────────────────────────
  const footerY = pageHeight - 8;
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated on ${format(new Date(), "PPP p")} | Institutional Record - Confidential`,
    pageWidth / 2, footerY, { align: "center" }
  );
  doc.text(`Page ${doc.internal.getNumberOfPages()}`, MR, footerY, { align: "right" });

  doc.save(`${report.id}_Official_Report.pdf`);
}