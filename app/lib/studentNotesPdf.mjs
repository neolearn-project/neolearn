export async function exportNotesPdf(value, load = () => import("jspdf"), cancelled = () => false) {
  const text = String(value || "").trim();
  if (!text) return false;
  const { jsPDF } = await load();
  if (cancelled()) return false;
    const doc = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("NeoLearn Notes", margin, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const lines = doc.splitTextToSize(text, maxWidth);

    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 16;
    }

    doc.save("NeoLearn_Notes.pdf");
  return true;
}
