import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  ASANA_CLIENT_ID: z.string().min(1),
  ASANA_CLIENT_SECRET: z.string().min(1),
  ASANA_REDIRECT_URI: z.string().url(),
  ENCRYPTION_KEY: z.string().min(32),
});

type Env = z.infer<typeof envSchema>;
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    ASANA_CLIENT_ID: process.env.ASANA_CLIENT_ID,
    ASANA_CLIENT_SECRET: process.env.ASANA_CLIENT_SECRET,
    ASANA_REDIRECT_URI: process.env.ASANA_REDIRECT_URI,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  });

  return cachedEnv;
}
