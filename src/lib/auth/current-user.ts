import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, companySettings, users } from "@/lib/db/schema";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";
import {
  findSharedCompanyForEmail,
  isSharedCompanyEmail,
  resolveCompanyIdForUser,
} from "@/lib/services/company-resolution";

const SUPER_ADMIN_EMAILS = new Set(["bryan@eastendwebsolutions.com"]);

function deriveDisplayName({
  firstName,
  lastName,
  email,
}: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) return fullName;
  return email.split("@")[0];
}

export async function getOrCreateCurrentUser() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const existing = await (async () => {
    try {
      return await db.query.users.findFirst({
        where: eq(users.clerkUserId, userId),
      });
    } catch (error) {
      if (!isMissingIntegrationSchemaError(error)) throw error;
      const fallback = await db.query.users.findFirst({
        where: eq(users.clerkUserId, userId),
        columns: {
          id: true,
          clerkUserId: true,
          email: true,
          displayName: true,
          reportingJobRole: true,
          asanaUserId: true,
          role: true,
          isPokerPlanningAdmin: true,
          companyId: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!fallback) return null;
      return { ...fallback, activeIntegrationProvider: "asana" as const };
    }
  })();

  if (existing) {
    const resolvedCompanyId = await resolveCompanyIdForUser({
      userId: existing.id,
      email: existing.email,
      currentCompanyId: existing.companyId,
    });
    if (resolvedCompanyId !== existing.companyId) {
      const [moved] = await db
        .update(users)
        .set({ companyId: resolvedCompanyId })
        .where(eq(users.id, existing.id))
        .returning();
      if (moved) {
        return moved;
      }
    }

    const clerkProfile = await currentUser();
    const desiredDisplayName = deriveDisplayName({
      firstName: clerkProfile?.firstName,
      lastName: clerkProfile?.lastName,
      email: existing.email,
    });
    const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.has(existing.email.toLowerCase());
    if (shouldBeSuperAdmin && existing.role !== "super_admin") {
      const [updated] = await db
        .update(users)
        .set({ role: "super_admin", displayName: desiredDisplayName })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    if (existing.displayName !== desiredDisplayName) {
      const [updated] = await db
        .update(users)
        .set({ displayName: desiredDisplayName })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) {
    return null;
  }
  const displayName = deriveDisplayName({
    firstName: clerkUser?.firstName,
    lastName: clerkUser?.lastName,
    email,
  });

  const sharedCompany = isSharedCompanyEmail(email) ? await findSharedCompanyForEmail(email) : null;
  let targetCompanyId: string;

  if (sharedCompany) {
    targetCompanyId = sharedCompany.id;
  } else {
    const companyName = `${email.split("@")[0]}'s Company`;
    const insertedCompany = await db.insert(companies).values({ name: companyName }).returning();
    await db.insert(companySettings).values({ companyId: insertedCompany[0].id });
    targetCompanyId = insertedCompany[0].id;
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: userId,
      email,
      displayName,
      role: SUPER_ADMIN_EMAILS.has(email.toLowerCase()) ? "super_admin" : "user",
      companyId: targetCompanyId,
    })
    .onConflictDoNothing({
      target: users.clerkUserId,
    })
    .returning();

  if (!created) {
    // Another request already created this user; reuse the existing record.
    const conflicted = await (async () => {
      try {
        return await db.query.users.findFirst({
          where: eq(users.clerkUserId, userId),
        });
      } catch (error) {
        if (!isMissingIntegrationSchemaError(error)) throw error;
        const fallback = await db.query.users.findFirst({
          where: eq(users.clerkUserId, userId),
          columns: {
            id: true,
            clerkUserId: true,
            email: true,
            displayName: true,
            reportingJobRole: true,
            asanaUserId: true,
            role: true,
            isPokerPlanningAdmin: true,
            companyId: true,
            timezone: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return fallback ? { ...fallback, activeIntegrationProvider: "asana" as const } : null;
      }
    })();
    if (!conflicted) {
      return null;
    }

    const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.has(conflicted.email.toLowerCase());
    if (shouldBeSuperAdmin && conflicted.role !== "super_admin") {
      const [updated] = await db
        .update(users)
        .set({ role: "super_admin", displayName })
        .where(eq(users.id, conflicted.id))
        .returning();
      return updated;
    }

    if (conflicted.displayName !== displayName) {
      const [updated] = await db
        .update(users)
        .set({ displayName })
        .where(eq(users.id, conflicted.id))
        .returning();
      return updated;
    }

    return conflicted;
  }

  try {
    return await db.query.users.findFirst({
      where: and(eq(users.id, created.id), eq(users.companyId, targetCompanyId)),
    });
  } catch (error) {
    if (!isMissingIntegrationSchemaError(error)) throw error;
    const fallback = await db.query.users.findFirst({
      where: and(eq(users.id, created.id), eq(users.companyId, targetCompanyId)),
      columns: {
        id: true,
        clerkUserId: true,
        email: true,
        displayName: true,
        reportingJobRole: true,
        asanaUserId: true,
        role: true,
        isPokerPlanningAdmin: true,
        companyId: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return fallback ? { ...fallback, activeIntegrationProvider: "asana" as const } : null;
  }
}
