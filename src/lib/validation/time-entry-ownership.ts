import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { getActiveProviderForUser } from "@/lib/integrations/provider";

/** Ensures project/task/subtask rows belong to the time entry owner (per-user Asana cache). */
export async function assertProjectTaskOwnedByUser(params: {
  ownerUserId: string;
  projectId: string;
  taskId: string;
  subtaskId: string | null | undefined;
}) {
  const { ownerUserId, projectId, taskId, subtaskId } = params;
  const ownerProvider = await getActiveProviderForUser(ownerUserId);

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.syncedByUserId, ownerUserId),
      eq(projects.provider, ownerProvider),
      eq(projects.isActive, true),
    ),
  });
  if (!project) {
    throw new Error("Invalid project for this user");
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, project.id), eq(tasks.isActive, true)),
  });
  if (!task) {
    throw new Error("Invalid task for this project");
  }

  if (subtaskId) {
    const sub = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, subtaskId), eq(tasks.projectId, project.id), eq(tasks.isActive, true)),
    });
    if (!sub) {
      throw new Error("Invalid subtask for this project");
    }
  }
}
