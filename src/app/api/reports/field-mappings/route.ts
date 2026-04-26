import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCompanySettings } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { integrationFieldMappings } from "@/lib/db/schema";

const payloadSchema = z.object({
  integrationType: z.enum(["asana", "jira", "monday"]),
  mappings: z.array(z.object({
    mappingKey: z.string().min(1),
    externalFieldId: z.string().nullable().optional(),
    externalFieldName: z.string().nullable().optional(),
    externalFieldType: z.string().nullable().optional(),
  })),
});

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrationType = (request.nextUrl.searchParams.get("integrationType") ?? "asana") as "asana" | "jira" | "monday";
  const rows = await db.query.integrationFieldMappings.findMany({
    where: and(
      eq(integrationFieldMappings.companyId, user.companyId),
      eq(integrationFieldMappings.integrationType, integrationType),
      eq(integrationFieldMappings.scopeType, "company"),
      eq(integrationFieldMappings.isActive, true),
    ),
  });

  return NextResponse.json({ mappings: rows });
}

export async function POST(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCompanySettings(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const payload = payloadSchema.parse(await request.json());
    await db.delete(integrationFieldMappings).where(and(
      eq(integrationFieldMappings.companyId, user.companyId),
      eq(integrationFieldMappings.integrationType, payload.integrationType),
      eq(integrationFieldMappings.scopeType, "company"),
    ));
    if (payload.mappings.length) {
      const mappingRows: Array<typeof integrationFieldMappings.$inferInsert> = payload.mappings.map((mapping) => ({
        companyId: user.companyId,
        integrationType: payload.integrationType,
        scopeType: "company" as const,
        mappingKey: mapping.mappingKey,
        externalFieldId: mapping.externalFieldId ?? null,
        externalFieldName: mapping.externalFieldName ?? null,
        externalFieldType: mapping.externalFieldType ?? null,
        isActive: true,
        createdByUserId: user.id,
      }));
      await db.insert(integrationFieldMappings).values(mappingRows);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    return NextResponse.json({ error: "Failed to save mappings" }, { status: 500 });
  }
}
