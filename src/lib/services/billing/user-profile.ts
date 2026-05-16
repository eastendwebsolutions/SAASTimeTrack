import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userBillingProfiles } from "@/lib/db/schema";
import { userBillingProfileSchema, type UserBillingProfileInput } from "@/lib/validation/billing";

export async function getUserBillingProfile(userId: string) {
  return db.query.userBillingProfiles.findFirst({
    where: eq(userBillingProfiles.userId, userId),
  });
}

export function isUserBillingProfileComplete(profile: UserBillingProfileInput | null | undefined) {
  if (!profile) return false;
  return userBillingProfileSchema.safeParse(profile).success;
}

export async function upsertUserBillingProfile(userId: string, input: UserBillingProfileInput) {
  const parsed = userBillingProfileSchema.parse(input);
  const [row] = await db
    .insert(userBillingProfiles)
    .values({
      userId,
      address: parsed.address,
      address2: parsed.address2?.trim() || null,
      city: parsed.city,
      state: parsed.state?.trim() || null,
      province: parsed.province?.trim() || null,
      zip: parsed.zip,
      phone: parsed.phone,
      paypalAddress: parsed.paypalAddress,
    })
    .onConflictDoUpdate({
      target: userBillingProfiles.userId,
      set: {
        address: parsed.address,
        address2: parsed.address2?.trim() || null,
        city: parsed.city,
        state: parsed.state?.trim() || null,
        province: parsed.province?.trim() || null,
        zip: parsed.zip,
        phone: parsed.phone,
        paypalAddress: parsed.paypalAddress,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export function toUserBillingProfileInput(
  profile: {
    address: string;
    address2: string | null;
    city: string;
    state: string | null;
    province: string | null;
    zip: string;
    phone: string;
    paypalAddress: string;
  } | null | undefined,
): UserBillingProfileInput | null {
  if (!profile) return null;
  return {
    address: profile.address,
    address2: profile.address2,
    city: profile.city,
    state: profile.state,
    province: profile.province,
    zip: profile.zip,
    phone: profile.phone,
    paypalAddress: profile.paypalAddress,
  };
}
