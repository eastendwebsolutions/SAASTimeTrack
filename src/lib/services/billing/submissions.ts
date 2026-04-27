import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingPeriods,
  billingSettings,
  billingSubmissionFiles,
  billingSubmissions,
  companies,
  users,
} from "@/lib/db/schema";
import { storeBillingFiles } from "@/lib/services/storage";
import { buildBillingSubject, formatSubmittedAtEasternLabel, getBillingPeriodLabel, getMostRecentCompletedBillingWeek } from "./period";
import { sendBillingSubmissionEmail } from "./email";

type AppUser = {
  id: string;
  email: string;
  role: "user" | "company_admin" | "super_admin";
  companyId: string;
};

export async function ensureBillingPeriod(companyId: string, now = new Date()) {
  const { periodStart, periodEnd } = getMostRecentCompletedBillingWeek(now);
  const label = getBillingPeriodLabel(periodStart, periodEnd);

  const existing = await db.query.billingPeriods.findFirst({
    where: and(
      eq(billingPeriods.companyId, companyId),
      eq(billingPeriods.periodStartDate, periodStart),
      eq(billingPeriods.periodEndDate, periodEnd),
    ),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(billingPeriods)
    .values({
      companyId,
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
      timezone: "America/New_York",
      label,
    })
    .returning();
  return created;
}

export async function getCurrentBillingState(user: AppUser) {
  const period = await ensureBillingPeriod(user.companyId);
  const settings = await db.query.billingSettings.findFirst({
    where: eq(billingSettings.companyId, user.companyId),
  });

  const submissions = await db.query.billingSubmissions.findMany({
    where: and(eq(billingSubmissions.userId, user.id), eq(billingSubmissions.billingPeriodId, period.id)),
    orderBy: (table) => [asc(table.submissionAttemptNumber)],
  });

  const latest = submissions[submissions.length - 1] ?? null;
  const canSubmit = canSubmitForLatestSubmission(latest);

  const overdueEnabled = settings?.overdueBannerEnabled ?? true;
  const warning =
    overdueEnabled && (!latest || latest.status === "needs_resubmission")
      ? latest?.status === "needs_resubmission"
        ? `Your billing submission needs resubmission.`
        : `Your billing submission for ${period.label} has not been submitted.`
      : null;

  return {
    period,
    latestSubmission: latest,
    canSubmit,
    warning,
    settings: settings ?? null,
  };
}

export function canSubmitForLatestSubmission(
  latest:
    | null
    | {
        status: "submitted" | "accepted" | "needs_resubmission" | "failed";
        emailStatus: "pending" | "sent" | "failed";
      },
) {
  return !latest || latest.status === "needs_resubmission" || (latest.status === "failed" && latest.emailStatus === "failed");
}

export async function createBillingSubmission({
  user,
  userName,
  bodyContent,
  files,
}: {
  user: AppUser;
  userName: string;
  bodyContent: string | null;
  files: File[];
}) {
  if (!files.length) {
    throw new Error("At least one file is required.");
  }

  const now = new Date();
  const current = await getCurrentBillingState(user);
  if (!current.canSubmit) {
    throw new Error("Billing submission already exists for this week.");
  }

  const settings = current.settings;
  const toRecipients = (settings?.toRecipientsJson as string[] | undefined) ?? [];
  const ccRecipients = (settings?.ccRecipientsJson as string[] | undefined) ?? [];
  if (!toRecipients.length) {
    throw new Error("Billing recipients are not configured for your company.");
  }

  const nextAttempt = (current.latestSubmission?.submissionAttemptNumber ?? 0) + 1;
  const subject = buildBillingSubject(userName, current.period.periodStartDate, current.period.periodEndDate);
  const submittedAtLocalLabel = formatSubmittedAtEasternLabel(now);

  const storedFiles = await storeBillingFiles({
    files,
    companyId: user.companyId,
    userId: user.id,
    billingPeriodId: current.period.id,
  });

  const [submission] = await db
    .insert(billingSubmissions)
    .values({
      companyId: user.companyId,
      userId: user.id,
      billingPeriodId: current.period.id,
      subject,
      bodyContent,
      status: "submitted",
      submissionAttemptNumber: nextAttempt,
      submittedAtUtc: now,
      submittedAtLocalLabel,
      emailToJson: toRecipients,
      emailCcJson: ccRecipients,
      emailStatus: "pending",
    })
    .returning();

  await db.insert(billingSubmissionFiles).values(
    storedFiles.map((file) => ({
      billingSubmissionId: submission.id,
      companyId: user.companyId,
      userId: user.id,
      originalFileName: file.originalFileName,
      storedFileName: file.storedFileName,
      fileMimeType: file.fileMimeType,
      fileSizeBytes: file.fileSizeBytes,
      storagePath: file.storagePath,
      uploadedAtUtc: now,
    })),
  );

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, user.companyId),
    columns: { name: true },
  });

  const attachmentPayload = await Promise.all(
    storedFiles.map(async (file) => {
      const response = await fetch(file.storagePath);
      if (!response.ok) {
        throw new Error(`Failed reading uploaded file ${file.originalFileName}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        fileName: file.originalFileName,
        content: buffer,
        contentType: file.fileMimeType,
      };
    }),
  );

  try {
    await sendBillingSubmissionEmail({
      userName,
      userEmail: user.email,
      companyName: company?.name ?? "Unknown Company",
      periodStart: current.period.periodStartDate,
      periodEnd: current.period.periodEndDate,
      submittedAt: now,
      userBody: bodyContent,
      defaultFooter: settings?.defaultBodyFooter ?? null,
      subject,
      to: toRecipients,
      cc: ccRecipients,
      files: attachmentPayload,
    });

    await db
      .update(billingSubmissions)
      .set({ emailStatus: "sent", updatedAt: new Date() })
      .where(eq(billingSubmissions.id, submission.id));
  } catch (error) {
    await db
      .update(billingSubmissions)
      .set({
        status: "failed",
        emailStatus: "failed",
        emailErrorMessage: error instanceof Error ? error.message : "Unknown email failure",
        updatedAt: new Date(),
      })
      .where(eq(billingSubmissions.id, submission.id));
  }

  return submission;
}

export async function getUserBillingHistory(userId: string, companyId: string) {
  const rows = await db.query.billingSubmissions.findMany({
    where: and(eq(billingSubmissions.userId, userId), eq(billingSubmissions.companyId, companyId)),
    orderBy: (table) => [desc(table.submittedAtUtc)],
  });

  if (!rows.length) return [];

  const files = await db.query.billingSubmissionFiles.findMany({
    where: inArray(
      billingSubmissionFiles.billingSubmissionId,
      rows.map((row) => row.id),
    ),
    orderBy: (table) => [asc(table.createdAt)],
  });

  const filesBySubmission = new Map<string, typeof files>();
  for (const file of files) {
    const list = filesBySubmission.get(file.billingSubmissionId) ?? [];
    list.push(file);
    filesBySubmission.set(file.billingSubmissionId, list);
  }

  return rows.map((row) => ({
    ...row,
    files: filesBySubmission.get(row.id) ?? [],
  }));
}

export async function listAdminBillingSubmissions(actor: AppUser, filters?: { companyId?: string; userId?: string; status?: string }) {
  const where = [
    actor.role === "super_admin"
      ? filters?.companyId
        ? eq(billingSubmissions.companyId, filters.companyId)
        : undefined
      : eq(billingSubmissions.companyId, actor.companyId),
    filters?.userId ? eq(billingSubmissions.userId, filters.userId) : undefined,
    filters?.status ? eq(billingSubmissions.status, filters.status as "submitted") : undefined,
  ].filter(Boolean);

  const rows = await db.query.billingSubmissions.findMany({
    where: where.length ? and(...where) : undefined,
    orderBy: (table) => [desc(table.submittedAtUtc)],
  });

  if (!rows.length) return [];

  const files = await db.query.billingSubmissionFiles.findMany({
    where: inArray(
      billingSubmissionFiles.billingSubmissionId,
      rows.map((row) => row.id),
    ),
    orderBy: (table) => [asc(table.createdAt)],
  });
  const filesBySubmission = new Map<string, typeof files>();
  for (const file of files) {
    const list = filesBySubmission.get(file.billingSubmissionId) ?? [];
    list.push(file);
    filesBySubmission.set(file.billingSubmissionId, list);
  }

  return rows.map((row) => ({
    ...row,
    files: filesBySubmission.get(row.id) ?? [],
  }));
}

export async function updateBillingSubmissionStatus({
  actor,
  submissionId,
  status,
  adminNote,
  dueDateUtcIso,
}: {
  actor: AppUser;
  submissionId: string;
  status: "accepted" | "needs_resubmission";
  adminNote?: string | null;
  dueDateUtcIso?: string | null;
}) {
  const submission = await db.query.billingSubmissions.findFirst({
    where: eq(billingSubmissions.id, submissionId),
  });
  if (!submission) throw new Error("Submission not found");
  if (actor.role !== "super_admin" && actor.companyId !== submission.companyId) {
    throw new Error("Forbidden");
  }

  const updatePayload =
    status === "accepted"
      ? {
          status,
          adminNote: adminNote ?? null,
          acceptedByUserId: actor.id,
          acceptedAtUtc: new Date(),
          updatedAt: new Date(),
        }
      : {
          status,
          adminNote: adminNote ?? null,
          resubmissionRequestedByUserId: actor.id,
          resubmissionRequestedAtUtc: new Date(),
          resubmissionDueAtUtc: dueDateUtcIso ? new Date(dueDateUtcIso) : null,
          updatedAt: new Date(),
        };

  const [updated] = await db.update(billingSubmissions).set(updatePayload).where(eq(billingSubmissions.id, submissionId)).returning();
  return updated;
}

export async function getSubmissionFileForDownload({
  actor,
  submissionId,
  fileId,
}: {
  actor: AppUser;
  submissionId: string;
  fileId: string;
}) {
  const submission = await db.query.billingSubmissions.findFirst({
    where: eq(billingSubmissions.id, submissionId),
    columns: { companyId: true, userId: true },
  });
  if (!submission) throw new Error("Submission not found");
  if (actor.role !== "super_admin" && actor.companyId !== submission.companyId && actor.id !== submission.userId) {
    throw new Error("Forbidden");
  }

  const file = await db.query.billingSubmissionFiles.findFirst({
    where: and(eq(billingSubmissionFiles.id, fileId), eq(billingSubmissionFiles.billingSubmissionId, submissionId)),
  });
  if (!file) throw new Error("File not found");

  const response = await fetch(file.storagePath);
  if (!response.ok) {
    throw new Error("Unable to fetch file");
  }
  const content = Buffer.from(await response.arrayBuffer());
  return { file, content };
}

export async function listCompaniesForBillingAdmin(actor: AppUser) {
  if (actor.role !== "super_admin") {
    return db.query.companies.findMany({
      where: eq(companies.id, actor.companyId),
      columns: { id: true, name: true },
    });
  }
  return db.query.companies.findMany({
    columns: { id: true, name: true },
    orderBy: (table) => [asc(table.name)],
  });
}

export async function listCompanyUsers(companyId: string) {
  return db.query.users.findMany({
    where: eq(users.companyId, companyId),
    columns: { id: true, email: true },
    orderBy: (table) => [asc(table.email)],
  });
}

export async function upsertBillingSettings({
  actorUserId,
  companyId,
  toRecipients,
  ccRecipients,
  defaultBodyFooter,
  submissionInstructions,
  overdueBannerEnabled,
  expectedSubmissionCutoffTime,
}: {
  actorUserId: string;
  companyId: string;
  toRecipients: string[];
  ccRecipients: string[];
  defaultBodyFooter: string | null;
  submissionInstructions: string | null;
  overdueBannerEnabled: boolean;
  expectedSubmissionCutoffTime: string | null;
}) {
  const [row] = await db
    .insert(billingSettings)
    .values({
      companyId,
      toRecipientsJson: toRecipients,
      ccRecipientsJson: ccRecipients,
      defaultBodyFooter,
      submissionInstructions,
      overdueBannerEnabled,
      expectedSubmissionCutoffTime,
      updatedByUserId: actorUserId,
    })
    .onConflictDoUpdate({
      target: billingSettings.companyId,
      set: {
        toRecipientsJson: toRecipients,
        ccRecipientsJson: ccRecipients,
        defaultBodyFooter,
        submissionInstructions,
        overdueBannerEnabled,
        expectedSubmissionCutoffTime,
        updatedByUserId: actorUserId,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return row;
}

