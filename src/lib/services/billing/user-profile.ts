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
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      address: parsed.address,
      address2: parsed.address2?.trim() || null,
      city: parsed.city,
      state: parsed.state,
      province: parsed.province?.trim() || null,
      zip: parsed.zip,
      country: parsed.country,
      phone: parsed.phone,
      paypalAddress: parsed.paypalAddress,
    })
    .onConflictDoUpdate({
      target: userBillingProfiles.userId,
      set: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        address: parsed.address,
        address2: parsed.address2?.trim() || null,
        city: parsed.city,
        state: parsed.state,
        province: parsed.province?.trim() || null,
        zip: parsed.zip,
        country: parsed.country,
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
    firstName: string;
    lastName: string;
    address: string;
    address2: string | null;
    city: string;
    state: string | null;
    province: string | null;
    zip: string;
    country: string;
    phone: string;
    paypalAddress: string;
  } | null | undefined,
): UserBillingProfileInput | null {
  if (!profile) return null;
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    address: profile.address,
    address2: profile.address2,
    city: profile.city,
    state: profile.state ?? "",
    province: profile.province,
    zip: profile.zip,
    country: profile.country,
    phone: profile.phone,
    paypalAddress: profile.paypalAddress,
  };
}
