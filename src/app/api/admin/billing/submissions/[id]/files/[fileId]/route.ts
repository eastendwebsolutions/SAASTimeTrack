import { NextResponse } from "next/server";
import { requireBillingUser } from "@/lib/services/billing/auth";
import { getSubmissionFileForDownload } from "@/lib/services/billing/submissions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const actor = await requireBillingUser();
    const { id, fileId } = await params;
    const { file, content } = await getSubmissionFileForDownload({
      actor,
      submissionId: id,
      fileId,
    });

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": file.fileMimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalFileName)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error instanceof Error && (error.message === "Submission not found" || error.message === "File not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to download file" }, { status: 500 });
  }
}

