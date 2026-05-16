"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  COUNTRY_OPTIONS,
  OTHER_COUNTRY_OPTIONS,
  PRIORITY_COUNTRY_OPTIONS,
  US_STATE_OPTIONS,
} from "@/lib/constants/geo-options";
import { parseJsonResponse } from "@/lib/api/parse-json-response";
import {
  REQUIRED_USER_BILLING_FIELD_LABELS,
  userBillingProfileSchema,
  type UserBillingProfileInput,
} from "@/lib/validation/billing";

const selectClassName = "w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200";

function isKnownState(value: string) {
  return US_STATE_OPTIONS.includes(value as (typeof US_STATE_OPTIONS)[number]);
}

function isKnownCountry(value: string) {
  return COUNTRY_OPTIONS.includes(value as (typeof COUNTRY_OPTIONS)[number]);
}

const emptyProfile: UserBillingProfileInput = {
  firstName: "",
  lastName: "",
  address: "",
  address2: "",
  city: "",
  state: "",
  province: "",
  zip: "",
  country: "",
  phone: "",
  paypalAddress: "",
};

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {children} <span className="text-rose-400">*</span>
    </span>
  );
}

export function UserBillingSettingsClient() {
  const [profile, setProfile] = useState<UserBillingProfileInput>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/profile", { cache: "no-store" });
      const json = await parseJsonResponse<{ profile?: UserBillingProfileInput; error?: string }>(res);
      if (!res.ok) {
        setError(json?.error ?? "Unable to load billing information");
        return;
      }
      setProfile({ ...emptyProfile, ...(json?.profile ?? {}) });
    } catch {
      setError("Unable to load billing information. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const parsed = userBillingProfileSchema.safeParse(profile);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete all required fields.");
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch("/api/billing/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      const json = await parseJsonResponse<{ profile?: UserBillingProfileInput; error?: string }>(res);
      if (!res.ok) {
        setError(json?.error ?? "Unable to save billing information");
        return;
      }
      if (!json?.profile) {
        setError("Save completed but the server returned an unexpected response. Refresh and try again.");
        return;
      }
      setProfile({ ...emptyProfile, ...json.profile });
      setSaved(true);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setError("Save timed out. Please try again.");
      } else {
        setError("Unable to save billing information. Check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setSaving(false);
    }
  }

  function updateField<K extends keyof UserBillingProfileInput>(key: K, value: UserBillingProfileInput[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (loading) return <p className="text-zinc-400">Loading billing information...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">User Billing Information</h1>
          <p className="mt-1 text-sm text-zinc-400">This information appears on your invoices when you submit them.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Required to submit invoices: {REQUIRED_USER_BILLING_FIELD_LABELS.join(", ")}.
          </p>
        </div>
        <Link href="/billing/invoicing" className="text-sm text-indigo-300 hover:text-indigo-200">
          Go to Invoicing →
        </Link>
      </div>

      {error ? <Card className="border-rose-600/50 bg-rose-900/20 p-4 text-rose-200">{error}</Card> : null}
      {saved ? <Card className="border-emerald-600/50 bg-emerald-900/20 p-4 text-emerald-200">Billing information saved.</Card> : null}

      <form
        className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>First Name</RequiredLabel>
          <input
            required
            value={profile.firstName}
            onChange={(event) => updateField("firstName", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>Last Name</RequiredLabel>
          <input
            required
            value={profile.lastName}
            onChange={(event) => updateField("lastName", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300 sm:col-span-2">
          <RequiredLabel>Address</RequiredLabel>
          <input
            required
            value={profile.address}
            onChange={(event) => updateField("address", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300 sm:col-span-2">
          Address 2
          <input
            value={profile.address2 ?? ""}
            onChange={(event) => updateField("address2", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>City</RequiredLabel>
          <input
            required
            value={profile.city}
            onChange={(event) => updateField("city", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>State</RequiredLabel>
          <select
            required
            value={profile.state}
            onChange={(event) => updateField("state", event.target.value)}
            className={selectClassName}
          >
            <option value="">Select state</option>
            {profile.state && !isKnownState(profile.state) ? (
              <option value={profile.state}>{profile.state} (update required)</option>
            ) : null}
            {US_STATE_OPTIONS.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          Province
          <input
            value={profile.province ?? ""}
            onChange={(event) => updateField("province", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>Zip</RequiredLabel>
          <input
            required
            value={profile.zip}
            onChange={(event) => updateField("zip", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300 sm:col-span-2">
          <RequiredLabel>Country</RequiredLabel>
          <select
            required
            value={profile.country}
            onChange={(event) => updateField("country", event.target.value)}
            className={selectClassName}
          >
            <option value="">Select country</option>
            {profile.country && !isKnownCountry(profile.country) ? (
              <option value={profile.country}>{profile.country} (update required)</option>
            ) : null}
            <optgroup label="Common">
              {PRIORITY_COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other countries">
              {OTHER_COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="space-y-1 text-sm text-zinc-300">
          <RequiredLabel>Phone</RequiredLabel>
          <input
            required
            value={profile.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-300 sm:col-span-2">
          <RequiredLabel>PayPal Address</RequiredLabel>
          <input
            required
            value={profile.paypalAddress}
            onChange={(event) => updateField("paypalAddress", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Billing Information"}
          </Button>
        </div>
      </form>
    </div>
  );
}
