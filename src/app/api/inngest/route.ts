import { serve } from "inngest/next";
import { inngest } from "@/app/api/inngest/functions/client";
import { periodicAsanaSync } from "@/app/api/inngest/functions/periodic-asana-sync";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [periodicAsanaSync],
});
