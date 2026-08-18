"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { subscribeToPush } from "@/lib/notifications/push-client";
import { NotificationHistory } from "@/components/settings/notification-history";
import { Bell } from "lucide-react";

interface Preferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  phone_number: string | null;
  min_score: number;
}

interface ChannelsEnabled {
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface PreferencesResponse {
  preferences: Preferences;
  channelsEnabled: ChannelsEnabled;
  vapidPublicKey: string | null;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

function ChannelBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="bull">Configured</Badge>
  ) : (
    <Badge variant="muted">Not configured</Badge>
  );
}

export function NotificationSettings() {
  const [data, setData] = useState<PreferencesResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">Checking…</p>
        </CardContent>
      </Card>
    );
  }

  const { preferences, channelsEnabled } = data;

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setData((prev) => (prev ? { ...prev, preferences: { ...prev.preferences, [key]: value } } : prev));
  }

  async function save() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: preferences.email_enabled,
          smsEnabled: preferences.sms_enabled,
          pushEnabled: preferences.push_enabled,
          quietHoursEnabled: preferences.quiet_hours_enabled,
          quietHoursStart: preferences.quiet_hours_start,
          quietHoursEnd: preferences.quiet_hours_end,
          timezone: preferences.timezone,
          phoneNumber: preferences.phone_number,
          minScore: preferences.min_score,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveMessage(body.error ?? "Could not save preferences");
      } else {
        setData(body);
        setSaveMessage("Saved.");
      }
    } catch {
      setSaveMessage("Could not save preferences");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestMessage("Sending…");
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setTestMessage(body.error ?? "Could not send test alert");
        return;
      }
      if (body.note) {
        setTestMessage(body.note);
        return;
      }
      const summary = (body.results ?? [])
        .map((r: { channel: string; status: string }) => `${r.channel}: ${r.status}`)
        .join(", ");
      setTestMessage(summary || "No channels enabled.");
    } catch {
      setTestMessage("Could not send test alert");
    }
  }

  async function enablePush() {
    const vapidPublicKey = data?.vapidPublicKey;
    if (!vapidPublicKey) {
      setPushMessage("Push is not configured on the server yet.");
      return;
    }
    const result = await subscribeToPush(vapidPublicKey);
    setPushMessage(result.ok ? "Browser push enabled." : (result.error ?? "Could not enable push"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" /> Notifications
        </CardTitle>
        <CardDescription>
          Email, SMS, and browser push for high-confidence alerts (score 7+ of 9), plus quiet hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences.email_enabled}
                onChange={(e) => update("email_enabled", e.target.checked)}
              />
              Email
            </span>
            <ChannelBadge enabled={channelsEnabled.email} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences.sms_enabled}
                onChange={(e) => update("sms_enabled", e.target.checked)}
              />
              SMS
            </span>
            <ChannelBadge enabled={channelsEnabled.sms} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences.push_enabled}
                onChange={(e) => update("push_enabled", e.target.checked)}
              />
              Browser push
            </span>
            <ChannelBadge enabled={channelsEnabled.push} />
          </label>
        </div>

        {preferences.push_enabled && channelsEnabled.push && (
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={enablePush}>
              Enable push in this browser
            </Button>
            {pushMessage && <p className="text-sm text-muted">{pushMessage}</p>}
          </div>
        )}

        {preferences.sms_enabled && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="phone-number">
              Phone number (for SMS)
            </label>
            <Input
              id="phone-number"
              type="tel"
              placeholder="+15555550123"
              value={preferences.phone_number ?? ""}
              onChange={(e) => update("phone_number", e.target.value)}
              className="max-w-xs"
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="min-score">
              Minimum alert score (0-9)
            </label>
            <Input
              id="min-score"
              type="number"
              min={0}
              max={9}
              value={preferences.min_score}
              onChange={(e) => update("min_score", Math.max(0, Math.min(9, Number(e.target.value))))}
              className="max-w-[8rem]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              value={preferences.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              className="h-10 max-w-xs rounded-lg border border-border bg-surface px-3 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={preferences.quiet_hours_enabled}
              onChange={(e) => update("quiet_hours_enabled", e.target.checked)}
            />
            Quiet hours (suppress email/SMS/push during this local time window)
          </label>
          {preferences.quiet_hours_enabled && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                From
                <Input
                  type="time"
                  value={preferences.quiet_hours_start}
                  onChange={(e) => update("quiet_hours_start", e.target.value)}
                  className="w-32"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                To
                <Input
                  type="time"
                  value={preferences.quiet_hours_end}
                  onChange={(e) => update("quiet_hours_end", e.target.value)}
                  className="w-32"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save preferences"}
          </Button>
          <Button type="button" variant="outline" onClick={sendTest}>
            Send test alert
          </Button>
          {saveMessage && <p className="text-sm text-muted">{saveMessage}</p>}
          {testMessage && <p className="text-sm text-muted">{testMessage}</p>}
        </div>

        <NotificationHistory />
      </CardContent>
    </Card>
  );
}
