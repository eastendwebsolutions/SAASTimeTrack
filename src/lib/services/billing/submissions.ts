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
import { billingSubmissionCreateSchema, type InvoiceLineItem, type UserBillingSnapshot } from "@/lib/validation/billing";
import { listWorkspaceOptionsForSuperAdmin } from "@/lib/services/workspace-options";
import { resolveWorkspaceScopedCompanyIdsForSuperAdmin } from "@/lib/services/workspace-options";
import { formatSubmittedAtEasternLabel, getBillingPeriodLabel, getMostRecentCompletedBillingWeek } from "./period";
import { buildInvoiceSubject } from "./invoice";
import { sendBillingSubmissionEmail } from "./email";
import { getUserBillingProfile, isUserBillingProfileComplete, toUserBillingProfileInput } from "./user-profile";

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
  const profile = await getUserBillingProfile(user.id);
  const profileInput = toUserBillingProfileInput(profile);

  const submissions = await db.query.billingSubmissions.findMany({
    where: and(eq(billingSubmissions.userId, user.id), eq(billingSubmissions.billingPeriodId, period.id)),
    orderBy: (table) => [asc(table.submissionAttemptNumber)],
  });

  const latest = submissions[submissions.length - 1] ?? null;
  const canSubmit = canSubmitForLatestSubmission(latest);
  const profileComplete = isUserBillingProfileComplete(profileInput);

  const overdueEnabled = settings?.overdueBannerEnabled ?? true;
  const warning =
    overdueEnabled && (!latest || latest.status === "needs_resubmission")
      ? latest?.status === "needs_resubmission"
        ? `Your invoice needs resubmission.`
        : `Your invoice for ${period.label} has not been submitted.`
      : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, user.companyId),
    columns: { name: true },
  });

  return {
    period,
    latestSubmission: latest,
    canSubmit,
    warning,
    settings: settings ?? null,
    profile: profileInput,
    profileComplete,
    companyName: company?.name ?? "Company",
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
  invoiceNumber,
  lineItems,
}: {
  user: AppUser;
  userName: string;
  bodyContent: string | null;
  invoiceNumber: string;
  lineItems: InvoiceLineItem[];
}) {
  const parsed = billingSubmissionCreateSchema.parse({
    invoiceNumber,
    lineItems,
    bodyContent,
  });

  const now = new Date();
  const current = await getCurrentBillingState(user);
  if (!current.profileComplete || !current.profile) {
    throw new Error("Complete your user billing information before submitting an invoice.");
  }
  if (!current.canSubmit) {
    throw new Error("Invoice submission already exists for this week.");
  }

  const settings = current.settings;
  const toRecipients = (settings?.toRecipientsJson as string[] | undefined) ?? [];
  const ccRecipients = (settings?.ccRecipientsJson as string[] | undefined) ?? [];
  if (!toRecipients.length) {
    throw new Error("Billing recipients are not configured for your company.");
  }

  const nextAttempt = (current.latestSubmission?.submissionAttemptNumber ?? 0) + 1;
  const periodLabel = getBillingPeriodLabel(current.period.periodStartDate, current.period.periodEndDate);
  const subject = buildInvoiceSubject({
    userDisplayName: userName,
    invoiceNumber: parsed.invoiceNumber,
    periodLabel,
  });
  const submittedAtLocalLabel = formatSubmittedAtEasternLabel(now);
  const billingSnapshot: UserBillingSnapshot = {
    ...current.profile,
    userDisplayName: userName,
    userEmail: user.email,
  };

  const [submission] = await db
    .insert(billingSubmissions)
    .values({
      companyId: user.companyId,
      userId: user.id,
      billingPeriodId: current.period.id,
      subject,
      bodyContent: parsed.bodyContent ?? null,
      invoiceNumber: parsed.invoiceNumber,
      invoiceLineItemsJson: parsed.lineItems,
      userBillingSnapshotJson: billingSnapshot,
      status: "submitted",
      submissionAttemptNumber: nextAttempt,
      submittedAtUtc: now,
      submittedAtLocalLabel,
      emailToJson: toRecipients,
      emailCcJson: ccRecipients,
      emailStatus: "pending",
    })
    .returning();

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, user.companyId),
    columns: { name: true },
  });

  try {
    await sendBillingSubmissionEmail({
      userName,
      userEmail: user.email,
      companyName: company?.name ?? "Unknown Company",
      periodStart: current.period.periodStartDate,
      periodEnd: current.period.periodEndDate,
      submittedAt: now,
      userBody: parsed.bodyContent ?? null,
      defaultFooter: settings?.defaultBodyFooter ?? null,
      subject,
      to: toRecipients,
      cc: ccRecipients,
      invoiceNumber: parsed.invoiceNumber,
      lineItems: parsed.lineItems,
      billingSnapshot,
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
  const superAdminCompanyIds =
    actor.role === "super_admin"
      ? await resolveWorkspaceScopedCompanyIdsForSuperAdmin(filters?.companyId ?? actor.companyId)
      : [actor.companyId];

  const where = [
    inArray(billingSubmissions.companyId, superAdminCompanyIds),
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
    const companyRows = await db.query.companies.findMany({
      where: eq(companies.id, actor.companyId),
      columns: { id: true, name: true },
    });
    return companyRows.map((row) => ({
      id: row.id,
      name: row.name,
      workspaceId: null as string | null,
      companyIds: [row.id],
    }));
  }
  const workspaceOptions = await listWorkspaceOptionsForSuperAdmin();
  return workspaceOptions.map((option) => ({
    id: option.id,
    name: option.label,
    workspaceId: option.workspaceId,
    companyIds: option.companyIds,
  }));
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

