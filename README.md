# SAASTimeTrack

Asana-first multi-tenant time tracking MVP built with Next.js, Clerk, Drizzle, and PostgreSQL.

## MVP Features Implemented

- Clerk authentication and protected app routes
- Multi-tenant data model (`company_id` scoping)
- Asana OAuth **per user** (no org-wide Asana install); sync uses only that user’s token
- Projects the user can see in Asana; tasks **assigned to that user** (`assignee=me`) plus subtasks under those tasks
- Quick time entry page and API
- Weekly timesheet view and submit lock workflow
- Per-entry admin approval/rejection and comments endpoint
- CSV and basic PDF export routes
- Company settings read path for locked-entry admin override

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env vars:

```bash
cp .env.example .env.local
```

3. Generate and push database schema:

```bash
npm run db:generate
npm run db:push
```

Upgrading an existing database from company-wide project rows: if `db:push` does not apply cleanly, run the SQL in `drizzle/0003_per_user_asana.sql` (or let `db:push` reconcile from `src/lib/db/schema.ts`).

4. Start development server:

```bash
npm run dev
```

## Deploy to Vercel (production)

These steps must be done once per environment. **I (the agent) cannot log into your Vercel/Clerk/Asana accounts**—after the repo is ready, you finish auth in the browser/CLI.

### 1. Push code to Git

```bash
git add -A
git commit -m "Prepare Vercel deploy"
git remote add origin <your-repo-url>   # if needed
git push -u origin main
```

### 2. Import project in Vercel

- [vercel.com](https://vercel.com) → **Add New → Project** → import the repo → **Deploy** (first deploy may fail until env vars exist—that’s OK).

### 3. Add Postgres

- Vercel project → **Storage** → create **Postgres** (or connect Neon) → copy **`DATABASE_URL`**.

### 4. Environment variables (Vercel → Settings → Environment Variables → **Production**)

Copy names from `.env.example`. Minimum:

| Name | Production value |
|------|------------------|
| `DATABASE_URL` | From Vercel Storage / Neon |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk **production** publishable key |
| `CLERK_SECRET_KEY` | Clerk **production** secret |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` or custom domain |
| `ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET` | Your Asana app |
| `ASANA_REDIRECT_URI` | `https://<your-domain>/api/asana/callback` (must match Asana app exactly) |
| `ENCRYPTION_KEY` | Same 32+ char secret as local (or new one—users must reconnect Asana) |
| `CRON_SECRET` | Random string (16+ chars); Vercel sends `Authorization: Bearer <value>` to cron routes |

Then **Redeploy** the latest deployment.

### 5. Apply database schema to production

From your machine (production `DATABASE_URL`):

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

### 6. Clerk (production)

- Clerk Dashboard → allow your production URL as **allowed origin** and **redirect URL**.

### 7. Asana OAuth app

- Redirect URI: `https://<your-domain>/api/asana/callback`
- Distribution: available to your workspace (same as local setup).

### 8. Cron (optional)

`vercel.json` schedules **`/api/cron/asana-sync` daily at 08:00 UTC**. Set `CRON_SECRET` in Vercel so the route accepts the job. **Hobby** plans allow at most **one cron per day**; for hourly sync, upgrade or trigger sync manually from **Integrations**.

### 9. CLI alternative

```bash
npx vercel login
npx vercel link --project saastimetrack   # or your project name
npx vercel env pull .env.vercel.local     # optional: sync env to file
npx vercel --prod
```

## Important Notes

- Set Asana **Redirect URI** to exactly `https://<your-domain>/api/asana/callback` (and the same value in `ASANA_REDIRECT_URI`).
- This MVP prioritizes end-to-end flow and architecture; production hardening items (audit logs, stricter RLS SQL policies, richer admin UX) are next steps.
