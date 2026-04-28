import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { AtrReport } from "./atr-types";

export function generateAtrPdf(report: AtrReport) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // 🎨 Styling Constants
  const PRIMARY_COLOR = [22, 101, 52]; // Dark Green (Growth)
  const SECONDARY_COLOR = [71, 85, 105]; // Slate 600
  const BORDER_COLOR = [226, 232, 240]; // Slate 200

  // 🏛️ Page Border & Branding
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  // 🔝 Top Brand Bar
  doc.setFillColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.rect(10, 10, pageWidth - 20, 3, "F");

  // 🏫 Institution Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.text("BALASORE COLLEGE OF ENGINEERING AND TECHNOLOGY", pageWidth / 2, 28, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.text("Approved by AICTE, Affiliated to BPUT, Odisha", pageWidth / 2, 32, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.text("ACTION TAKEN REPORT (ATR)", pageWidth / 2, 42, { align: "center" });
  
  doc.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  doc.line(20, 48, pageWidth - 20, 48);

  // 📄 Report Metadata Block
  let y = 60;
  
  // Left Column
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.text("REFERENCE NUMBER", 25, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(report.id.toUpperCase(), 25, y + 6);

  // Right Column
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.text("STATUS", pageWidth - 25, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.text(report.status.toUpperCase(), pageWidth - 25, y + 6, { align: "right" });

  y += 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.text("SESSION TITLE", 25, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(12);
  doc.text(report.title, 25, y + 7);

  y += 20;
  // Details Grid
  const gridY = y;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.text("MENTOR NAME", 25, gridY);
  doc.text("DEPARTMENT", pageWidth / 2, gridY);
  doc.text("CYCLE TIMELINE", pageWidth - 25, gridY, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(report.mentorName, 25, gridY + 6);
  doc.text(report.department, pageWidth / 2, gridY + 6);
  doc.text(`${format(new Date(report.startDate), "MMM d")} - ${format(new Date(report.endDate), "MMM d, yyyy")}`, pageWidth - 25, gridY + 6, { align: "right" });

  y += 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.text("1. ACTION PLAN EXECUTED", 20, y);

  // 📊 Action Table
  const actionRows = report.actions.map((a, i) => [
    { content: (i + 1).toString(), styles: { halign: 'center' } },
    a.issue,
    { content: a.studentCount.toString(), styles: { halign: 'center' } },
    a.actionTaken,
    a.timeline,
    a.outcome
  ]);

  autoTable(doc, {
    startY: y + 5,
    head: [["SL.", "ISSUE IDENTIFIED", "STU.", "ACTION TAKEN", "TIMELINE", "MEASURABLE OUTCOME"]],
    body: actionRows,
    theme: "grid",
    styles: { 
      fontSize: 8, 
      cellPadding: 3, 
      valign: "middle", 
      overflow: "linebreak",
      cellWidth: "auto"
    },
    headStyles: { 
      fillColor: [31, 41, 55], // Slate 900
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center"
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, // SL.
      1: { cellWidth: 40 }, // Issue
      2: { cellWidth: 12, halign: "center" }, // Qty
      3: { cellWidth: 40 }, // Action
      4: { cellWidth: 20 }, // Timeline
      5: { cellWidth: 38 }  // Outcome
    },
    margin: { left: 20, right: 20 },
    didParseCell: function(data) {
      if (data.section === 'head') {
        data.cell.styles.fillColor = [31, 41, 55];
      }
    }
  });

  // 👥 Student Attendance
  y = (doc as any).lastAutoTable.finalY + 15;
  if (y > pageHeight - 60) { doc.addPage(); y = 30; }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.text("2. STUDENT BENEFICIARY LIST", 20, y);

  const studentRows = report.students.map((s, i) => [
    { content: (i + 1).toString(), styles: { halign: 'center' } },
    s.name,
    s.rollNo,
    s.department || report.department
  ]);

  autoTable(doc, {
    startY: y + 5,
    head: [["SL.", "STUDENT NAME", "ROLL NUMBER", "DEPARTMENT / BRANCH"]],
    body: studentRows,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { 
      fillColor: SECONDARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    margin: { left: 20, right: 20 },
  });

  // ✍️ Institutional Sign-off
  y = (doc as any).lastAutoTable.finalY + 40;
  if (y > pageHeight - 40) { doc.addPage(); y = 40; }

  const sigWidth = 50;
  doc.setDrawColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.setLineWidth(0.2);

  // Mentor Sig
  doc.line(20, y, 20 + sigWidth, y);
  doc.setFontSize(8);
  doc.text("MENTOR SIGNATURE", 20 + sigWidth / 2, y + 5, { align: "center" });

  // Coordinator Sig
  doc.line(pageWidth / 2 - sigWidth / 2, y, pageWidth / 2 + sigWidth / 2, y);
  doc.text("COORDINATOR SIGNATURE", pageWidth / 2, y + 5, { align: "center" });

  // HOD Sig
  doc.line(pageWidth - 20 - sigWidth, y, pageWidth - 20, y);
  doc.text("HOD / PRINCIPAL SIGNATURE", pageWidth - 20 - sigWidth / 2, y + 5, { align: "center" });

  // 📄 Footer & Confidentiality
  const footerY = pageHeight - 15;
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${format(new Date(), "PPP p")} | Institutional Record - Confidential`, pageWidth / 2, footerY, { align: "center" });
  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 20, footerY, { align: "right" });

  // Save PDF
  doc.save(`${report.id}_Official_Report.pdf`);
}
