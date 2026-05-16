import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { db } from "@/lib/db";
import { cursorTeamConnections } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { z } from "zod";

const bodySchema = z.object({
  apiKey: z.string().min(8),
  cursorTeamId: z.string().max(160).optional(),
});

export async function PUT(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const json = bodySchema.parse(await request.json());
    const encrypted = encrypt(json.apiKey);
    const existing = await db.query.cursorTeamConnections.findFirst({
      where: eq(cursorTeamConnections.companyId, user.companyId),
    });
    if (existing) {
      await db
        .update(cursorTeamConnections)
        .set({
          apiKeyEncrypted: encrypted,
          cursorTeamId: json.cursorTeamId ?? existing.cursorTeamId,
          updatedAt: new Date(),
          createdByUserId: user.id,
        })
        .where(eq(cursorTeamConnections.id, existing.id));
    } else {
      await db.insert(cursorTeamConnections).values({
        companyId: user.companyId,
        apiKeyEncrypted: encrypted,
        cursorTeamId: json.cursorTeamId ?? null,
        createdByUserId: user.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
