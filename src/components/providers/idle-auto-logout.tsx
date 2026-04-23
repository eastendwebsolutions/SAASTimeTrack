"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const WARNING_WINDOW_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 1000;
const TIMER_DRAFT_STORAGE_KEY = "quick-entry-timer-draft:v1";

function getUserActivityKey(userId: string) {
  return `saastimetrack:last-activity:${userId}`;
}

const CROSS_TAB_LOGOUT_KEY = "saastimetrack:force-logout-at";

function hasActiveTimeEntryTimer() {
  try {
    const raw = window.localStorage.getItem(TIMER_DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { startedAt?: string | null };
    return typeof parsed.startedAt === "string" && parsed.startedAt.length > 0;
  } catch {
    return false;
  }
}

export function IdleAutoLogout() {
  const { isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const hasLoggedOutRef = useRef(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.floor(WARNING_WINDOW_MS / 1000));

  useEffect(() => {
    if (!isSignedIn || !userId) {
      hasLoggedOutRef.current = false;
      return;
    }

    const activityKey = getUserActivityKey(userId);

    const markActivity = () => {
      localStorage.setItem(activityKey, String(Date.now()));
    };

    const maybeLogout = async () => {
      if (hasLoggedOutRef.current) return;

      const raw = localStorage.getItem(activityKey);
      const lastActivity = raw ? Number(raw) : Date.now();
      const now = Date.now();

      if (!Number.isFinite(lastActivity)) {
        markActivity();
        return;
      }

      // Running timer means user is actively working on an in-progress entry.
      if (hasActiveTimeEntryTimer()) {
        markActivity();
        setShowWarning(false);
        return;
      }

      const idleMs = now - lastActivity;
      const remainingMs = IDLE_TIMEOUT_MS - idleMs;

      if (remainingMs <= 0) {
        setShowWarning(false);
        hasLoggedOutRef.current = true;
        localStorage.setItem(CROSS_TAB_LOGOUT_KEY, String(now));
        await signOut({ redirectUrl: "/sign-in" });
        return;
      }

      if (remainingMs <= WARNING_WINDOW_MS) {
        setShowWarning(true);
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
      } else {
        setShowWarning(false);
      }
    };

    const onStorage = async (event: StorageEvent) => {
      if (event.key !== CROSS_TAB_LOGOUT_KEY || hasLoggedOutRef.current) return;
      hasLoggedOutRef.current = true;
      await signOut({ redirectUrl: "/sign-in" });
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ];

    markActivity();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });
    window.addEventListener("storage", onStorage);

    const intervalId = window.setInterval(() => {
      void maybeLogout();
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      window.removeEventListener("storage", onStorage);
    };
  }, [isSignedIn, signOut, userId]);

  function stayLoggedIn() {
    if (!userId) return;
    localStorage.setItem(getUserActivityKey(userId), String(Date.now()));
    setShowWarning(false);
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = String(secondsRemaining % 60).padStart(2, "0");

  return showWarning ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-100">Session expiring soon</h2>
        <p className="mt-2 text-sm text-zinc-300">
          You have been idle and will be logged out in{" "}
          <span className="font-mono text-zinc-100">
            {minutes}:{seconds}
          </span>
          . Click below to stay signed in.
        </p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={stayLoggedIn}>
            Stay logged in
          </Button>
        </div>
      </div>
    </div>
  ) : null;
}
