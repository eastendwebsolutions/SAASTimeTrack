"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type ConfigResponse = {
  enabled: boolean;
  deliveryMethod: "email" | "webhook";
  channelLabel: string | null;
  destinationHint: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  resendReady: boolean;
};

export function TeamStatusTeamsSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendReady, setResendReady] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "webhook">("email");
  const [channelLabel, setChannelLabel] = useState("Team Member Status");
  const [destination, setDestination] = useState("");
  const [destinationHint, setDestinationHint] = useState<string | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/team-status-teams", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as ConfigResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Teams settings.");
      setEnabled(payload.enabled);
      setDeliveryMethod(payload.deliveryMethod);
      setChannelLabel(payload.channelLabel ?? "Team Member Status");
      setDestinationHint(payload.destinationHint);
      setLastTestedAt(payload.lastTestedAt);
      setLastError(payload.lastError);
      setResendReady(payload.resendReady);
      setDestination("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Teams settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(clearDestination = false) {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/team-status-teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          deliveryMethod,
          channelLabel: channelLabel.trim() || null,
          destination: destination.trim() || null,
          clearDestination,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to save settings (${response.status}).`);
      }
      setNotice(payload.message ?? "Settings saved.");
      setDestination("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/integrations/team-status-teams/test", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Test failed.");
      setNotice(payload.message ?? "Test sent.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-base font-semibold text-zinc-100">Team status → Microsoft Teams</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Post DAY IN, DAY OUT, BREAK IN, and BREAK OUT for everyone in your company to a Teams channel. No Microsoft API
        credentials are required—use your channel&apos;s email address or a simple workflow webhook.
      </p>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="rounded border-zinc-600"
          />
          Enable Teams channel updates
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Channel name (label)</label>
          <input
            type="text"
            value={channelLabel}
            onChange={(event) => setChannelLabel(event.target.value)}
            placeholder="Team Member Status"
            className="w-full max-w-md rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Delivery method</label>
          <select
            value={deliveryMethod}
            onChange={(event) => setDeliveryMethod(event.target.value as "email" | "webhook")}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="email">Channel email (recommended)</option>
            <option value="webhook">Workflow webhook URL</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            {deliveryMethod === "email" ? "Teams channel email" : "Workflow webhook URL"}
          </label>
          <input
            type={deliveryMethod === "email" ? "email" : "url"}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={
              deliveryMethod === "email"
                ? "team-member-status@thread.tacv2.teams.ms"
                : "https://..."
            }
            className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          {destinationHint ? (
            <p className="mt-1 text-xs text-zinc-500">
              Saved destination: <span className="font-mono text-zinc-400">{destinationHint}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Leave blank to keep the current saved destination.</p>
          )}
        </div>

        <details className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-200">How to get the channel email (Restori example)</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1.5 pl-1">
            <li>In Microsoft Teams, open your channel (e.g. &quot;Team Member Status&quot;).</li>
            <li>Select <strong>⋯</strong> → <strong>Get email address</strong> (or Connectors → Email).</li>
            <li>Paste that address above and send a test message.</li>
            <li>Your IT admin may need to allow email to channels for your tenant once.</li>
          </ol>
        </details>

        {deliveryMethod === "email" && !resendReady ? (
          <p className="text-sm text-amber-300">
            Email delivery is not configured on the server yet (Resend / from address). You can still{" "}
            <strong>save</strong> your channel email below with notifications turned off, then enable after your
            platform admin configures email—or switch to webhook delivery.
          </p>
        ) : null}

        {lastTestedAt ? (
          <p className="text-xs text-zinc-500">
            Last test: {new Date(lastTestedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}
          </p>
        ) : null}
        {lastError ? <p className="text-xs text-rose-300">Last error: {lastError}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <Button type="button" variant="secondary" disabled={testing} onClick={() => void sendTest()}>
            {testing ? "Sending…" : "Send test"}
          </Button>
        </div>

        {notice ? <p className={cn("text-sm", "text-emerald-300")}>{notice}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
    </Card>
  );
}
