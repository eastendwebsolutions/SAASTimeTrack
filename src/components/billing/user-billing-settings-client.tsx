"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REQUIRED_USER_BILLING_FIELD_LABELS, type UserBillingProfileInput } from "@/lib/validation/billing";

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
    const res = await fetch("/api/billing/profile");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to load billing information");
      setLoading(false);
      return;
    }
    setProfile({ ...emptyProfile, ...(json.profile ?? {}) });
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/billing/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to save billing information");
      setSaving(false);
      return;
    }
    setProfile({ ...emptyProfile, ...(json.profile ?? {}) });
    setSaved(true);
    setSaving(false);
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

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
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
          <input
            required
            value={profile.state}
            onChange={(event) => updateField("state", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
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
          <input
            required
            value={profile.country}
            onChange={(event) => updateField("country", event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200"
          />
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
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving..." : "Save Billing Information"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
