import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, companySettings, users } from "@/lib/db/schema";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

const SUPER_ADMIN_EMAILS = new Set(["bryan@eastendwebsolutions.com"]);

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
    const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.has(existing.email.toLowerCase());
    if (shouldBeSuperAdmin && existing.role !== "super_admin") {
      const [updated] = await db
        .update(users)
        .set({ role: "super_admin" })
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

  const companyName = `${email.split("@")[0]}'s Company`;
  const insertedCompany = await db.insert(companies).values({ name: companyName }).returning();
  await db.insert(companySettings).values({ companyId: insertedCompany[0].id });

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: userId,
      email,
      role: SUPER_ADMIN_EMAILS.has(email.toLowerCase()) ? "super_admin" : "user",
      companyId: insertedCompany[0].id,
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
        .set({ role: "super_admin" })
        .where(eq(users.id, conflicted.id))
        .returning();
      return updated;
    }

    return conflicted;
  }

  try {
    return await db.query.users.findFirst({
      where: and(eq(users.id, created.id), eq(users.companyId, insertedCompany[0].id)),
    });
  } catch (error) {
    if (!isMissingIntegrationSchemaError(error)) throw error;
    const fallback = await db.query.users.findFirst({
      where: and(eq(users.id, created.id), eq(users.companyId, insertedCompany[0].id)),
      columns: {
        id: true,
        clerkUserId: true,
        email: true,
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
