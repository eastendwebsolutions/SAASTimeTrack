import { db } from "@/lib/db";
import { syncUserAsanaData } from "@/lib/services/sync";
import { inngest } from "./client";
import { users } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const periodicAsanaSync = inngest.createFunction(
  {
    id: "periodic-asana-sync",
    triggers: [{ event: "app/asana.sync.periodic" }],
  },
  async () => {
    const connections = await db.query.asanaConnections.findMany({ columns: { userId: true } });
    const connectedUsers = connections.length
      ? await db.query.users.findMany({
          where: inArray(
            users.id,
            connections.map((connection) => connection.userId),
          ),
          columns: { id: true, companyId: true },
        })
      : [];
    const uniqueUsersByCompany = new Map<string, string>();
    for (const connectedUser of connectedUsers) {
      if (!uniqueUsersByCompany.has(connectedUser.companyId)) {
        uniqueUsersByCompany.set(connectedUser.companyId, connectedUser.id);
      }
    }
    const syncUserIds = [...uniqueUsersByCompany.values()];

    for (const syncUserId of syncUserIds) {
      await syncUserAsanaData(syncUserId, "periodic");
    }

    return { syncedCompanies: syncUserIds.length };
  },
);
