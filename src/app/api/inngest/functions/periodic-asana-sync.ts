import { db } from "@/lib/db";
import { syncUserAsanaData } from "@/lib/services/sync";
import { inngest } from "./client";

export const periodicAsanaSync = inngest.createFunction(
  {
    id: "periodic-asana-sync",
    triggers: [{ event: "app/asana.sync.periodic" }],
  },
  async () => {
    const connections = await db.query.asanaConnections.findMany({ columns: { userId: true } });
    const syncUserIds = connections.map((connection) => connection.userId);

    for (const syncUserId of syncUserIds) {
      await syncUserAsanaData(syncUserId, "periodic");
    }

    return { syncedUsers: syncUserIds.length };
  },
);
