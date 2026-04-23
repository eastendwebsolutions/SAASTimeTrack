"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

function getUserActivityKey(userId: string) {
  return `saastimetrack:last-activity:${userId}`;
}

const CROSS_TAB_LOGOUT_KEY = "saastimetrack:force-logout-at";

export function IdleAutoLogout() {
  const { isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const hasLoggedOutRef = useRef(false);

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

      if (now - lastActivity <= IDLE_TIMEOUT_MS) return;

      hasLoggedOutRef.current = true;
      localStorage.setItem(CROSS_TAB_LOGOUT_KEY, String(now));
      await signOut({ redirectUrl: "/sign-in" });
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

  return null;
}
