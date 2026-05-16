import { eq } from "drizzle-orm";
import { refreshAsanaAccessToken } from "@/lib/asana/client";
import { ASANA_RECONNECT_MESSAGE, isAsanaInvalidGrantError } from "@/lib/asana/token-errors";
import { db } from "@/lib/db";
import { asanaConnections } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";

export async function disconnectAsanaForUser(userId: string) {
  await db.delete(asanaConnections).where(eq(asanaConnections.userId, userId));
}

export async function refreshAndPersistAsanaConnection(userId: string, refreshToken: string) {
  try {
    const refreshed = await refreshAsanaAccessToken(refreshToken);
    await db
      .update(asanaConnections)
      .set({
        accessTokenEncrypted: encrypt(refreshed.access_token),
        refreshTokenEncrypted: encrypt(refreshed.refresh_token ?? refreshToken),
        expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      })
      .where(eq(asanaConnections.userId, userId));
    return refreshed;
  } catch (error) {
    if (isAsanaInvalidGrantError(error)) {
      await disconnectAsanaForUser(userId);
      throw new Error(ASANA_RECONNECT_MESSAGE);
    }
    throw error;
  }
}
