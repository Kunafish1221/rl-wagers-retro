// src/app/server/env.ts
import { z, ZodIssue } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(1),
  DEPOSIT_WEBHOOK_SECRET: z.string().min(1),
  SYSTEM_CRON_SECRET: z.string().min(1),
  WITHDRAWALS_ADMIN_SECRET: z.string().min(1),

  // Allow non-URL dev RPCs too (e.g., http://127.0.0.1:8899 or Helius)
  SOLANA_RPC_URL: z.string().min(1).optional(),

  WAGER_HOUSE_USER_ID: z.string().optional(),
  WAGER_FEE_BPS: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

type EnvShape = z.infer<typeof Env>;

const parsed = Env.safeParse(process.env);

if (!parsed.success) {
  const msg = parsed.error.issues
    .map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`)
    .join(", ");
  // In dev, throw loudly; in prod, fail closed (you can switch to throw as well)
  if (process.env.NODE_ENV !== "production") {
    throw new Error("Missing/invalid env vars: " + msg);
  }
}

export const env: EnvShape = parsed.success
  ? parsed.data
  : (process.env as unknown as EnvShape);