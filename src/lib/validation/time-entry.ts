import { z } from "zod";

export const timeEntryPayloadSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  subtaskId: z.string().uuid().nullable().optional(),
  entryDate: z.string(),
  timeIn: z.string(),
  timeOut: z.string(),
  summary: z.string().min(3),
});

export function getDurationMinutes(timeInIso: string, timeOutIso: string) {
  const start = new Date(timeInIso).getTime();
  const end = new Date(timeOutIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Invalid time range");
  }

  return Math.round((end - start) / 60000);
}
