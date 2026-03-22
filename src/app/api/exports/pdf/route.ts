import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const entries = await db.query.timeEntries.findMany({ where: eq(timeEntries.userId, user.id) });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText("SaaSTimeTrack Weekly Report", {
    x: 48,
    y: 740,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  let y = 710;
  for (const entry of entries.slice(0, 24)) {
    page.drawText(`${entry.entryDate.toISOString().slice(0, 10)} | ${entry.durationMinutes}m | ${entry.summary}`, {
      x: 48,
      y,
      size: 10,
      font,
    });
    y -= 18;
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=timesheet.pdf",
    },
  });
}
