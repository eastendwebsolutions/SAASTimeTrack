import { Card } from "@/components/ui/card";
import { TimezonePreferenceForm } from "@/components/settings/timezone-preference-form";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";

export default async function ProfileSettingsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile Settings</h1>
      <Card className="space-y-2 p-5">
        <p className="text-sm text-zinc-400">Update how dates and times are shown across time entry and review screens.</p>
        <TimezonePreferenceForm initialTimezone={user.timezone ?? "UTC"} />
      </Card>
    </div>
  );
}
