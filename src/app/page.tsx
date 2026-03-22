import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6">
      <p className="text-sm text-indigo-300">SaaSTimeTrack MVP</p>
      <h1 className="text-4xl font-semibold">Log time once. Connect everywhere.</h1>
      <p className="max-w-2xl text-zinc-400">
        Asana-first time tracking with weekly timesheets, per-entry approval, and exportable reports.
      </p>
      {!userId ? (
        <div className="flex gap-3">
          <Link href="/sign-in">
            <Button>Sign in</Button>
          </Link>
          <Link href="/sign-up">
            <Button variant="secondary">Create account</Button>
          </Link>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link href="/time">
            <Button>Open Time Entry</Button>
          </Link>
          <Link href="/timesheet">
            <Button variant="secondary">View Timesheet</Button>
          </Link>
        </div>
      )}
    </main>
  );
}
