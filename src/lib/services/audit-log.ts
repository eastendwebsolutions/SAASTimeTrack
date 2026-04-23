import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditChangeLog, users } from "@/lib/db/schema";

type AuditChangeInput = {
  companyId: string;
  actorUserId: string;
  pageKey: string;
  entityType: string;
  fieldName: string;
  beforeValue: string | null;
  afterValue: string | null;
  entityId?: string | null;
  contextKey?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

function isMissingAuditTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; cause?: unknown; code?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";

  if (code === "42P01" || message.includes('relation "audit_change_log" does not exist')) {
    return true;
  }

  if (candidate.cause && typeof candidate.cause === "object") {
    const cause = candidate.cause as { message?: unknown; code?: unknown };
    const causeMessage = typeof cause.message === "string" ? cause.message : "";
    const causeCode = typeof cause.code === "string" ? cause.code : "";
    return causeCode === "42P01" || causeMessage.includes('relation "audit_change_log" does not exist');
  }

  return false;
}

export async function logAuditChanges(changes: AuditChangeInput[]) {
  const rows = changes
    .filter((change) => (change.beforeValue ?? null) !== (change.afterValue ?? null))
    .map((change) => ({
      companyId: change.companyId,
      actorUserId: change.actorUserId,
      pageKey: change.pageKey,
      contextKey: change.contextKey ?? null,
      entityType: change.entityType,
      entityId: change.entityId ?? null,
      fieldName: change.fieldName,
      beforeValue: change.beforeValue,
      afterValue: change.afterValue,
      metadataJson: change.metadataJson ?? null,
    }));

  if (!rows.length) return;
  try {
    await db.insert(auditChangeLog).values(rows);
  } catch (error) {
    // Keep primary flows available in environments where audit table isn't migrated yet.
    if (isMissingAuditTableError(error)) {
      return;
    }
    throw error;
  }
}

export async function listAuditChanges(args: {
  companyId: string;
  pageKey: string;
  page: number;
  pageSize: number;
  contextKey?: string;
}) {
  const page = Math.max(1, args.page);
  const offset = (page - 1) * args.pageSize;
  const whereClause = args.contextKey
    ? and(eq(auditChangeLog.companyId, args.companyId), eq(auditChangeLog.pageKey, args.pageKey), eq(auditChangeLog.contextKey, args.contextKey))
    : and(eq(auditChangeLog.companyId, args.companyId), eq(auditChangeLog.pageKey, args.pageKey));

  let rows: Array<{
    id: string;
    fieldName: string;
    beforeValue: string | null;
    afterValue: string | null;
    createdAt: Date;
    userEmail: string;
  }> = [];
  let totalRows: Array<{ value: number }> = [{ value: 0 }];
  try {
    [rows, totalRows] = await Promise.all([
      db
        .select({
          id: auditChangeLog.id,
          fieldName: auditChangeLog.fieldName,
          beforeValue: auditChangeLog.beforeValue,
          afterValue: auditChangeLog.afterValue,
          createdAt: auditChangeLog.createdAt,
          userEmail: users.email,
        })
        .from(auditChangeLog)
        .innerJoin(users, eq(users.id, auditChangeLog.actorUserId))
        .where(whereClause)
        .orderBy(desc(auditChangeLog.createdAt))
        .limit(args.pageSize)
        .offset(offset),
      db.select({ value: count() }).from(auditChangeLog).where(whereClause),
    ]);
  } catch (error) {
    if (!isMissingAuditTableError(error)) {
      throw error;
    }
  }

  const total = totalRows[0]?.value ?? 0;
  return {
    rows,
    page,
    total,
    pageSize: args.pageSize,
    totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
  };
}
