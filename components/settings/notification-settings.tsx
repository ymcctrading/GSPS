"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NotificationHistory } from "@/components/settings/notification-history";
import { authorizedFetch } from "@/lib/supabase/authorized-fetch";
import { Bell } from "lucide-react";

interface Preferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  min_score: number;
  notify_on_verdict: "execute" | "watch" | "any";
  quiet_hours_enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  user_timezone: string;
  phone_number: string | null;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    authorizedFetch("/api/notifications/preferences")
      .then((res) => res.json())
      .then(setPreferences)
      .catch(() => setPreferences(null));
  }, []);

  if (!preferences) {
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

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!preferences) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await authorizedFetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_enabled: preferences.email_enabled,
          sms_enabled: preferences.sms_enabled,
          push_enabled: preferences.push_enabled,
          min_score: preferences.min_score,
          notify_on_verdict: preferences.notify_on_verdict,
          quiet_hours_enabled: preferences.quiet_hours_enabled,
          quiet_start: preferences.quiet_start,
          quiet_end: preferences.quiet_end,
          user_timezone: preferences.user_timezone,
          phone_number: preferences.phone_number,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveMessage(body.error ?? "Could not save preferences");
      } else {
        setPreferences(body);
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
      const res = await authorizedFetch("/api/notifications/send-test", { method: "POST" });
      const body = await res.json();
      setTestMessage(res.ok ? (body.message ?? "Sent.") : (body.error ?? "Could not send test alert"));
    } catch {
      setTestMessage("Could not send test alert");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" /> Notifications
        </CardTitle>
        <CardDescription>
          Email alerts for high-confidence signals, with quiet hours and a minimum score filter. Only
          email actually sends today — SMS and browser push are on the roadmap, so those toggles save
          your preference but nothing delivers to them yet.
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
            <Badge variant="bull">Live</Badge>
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
            <Badge variant="muted">Coming soon</Badge>
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
            <Badge variant="muted">Coming soon</Badge>
          </label>
        </div>

        {preferences.sms_enabled && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="phone-number">
              Phone number (for SMS, once it ships)
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

        <div className="grid gap-3 sm:grid-cols-3">
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
            <label className="text-sm font-medium" htmlFor="verdict">
              Notify on
            </label>
            <select
              id="verdict"
              value={preferences.notify_on_verdict}
              onChange={(e) => update("notify_on_verdict", e.target.value as Preferences["notify_on_verdict"])}
              className="h-10 max-w-xs rounded-lg border border-border bg-surface px-3 text-sm"
            >
              <option value="execute">Execute only</option>
              <option value="watch">Execute + Watch</option>
              <option value="any">Any verdict</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              value={preferences.user_timezone}
              onChange={(e) => update("user_timezone", e.target.value)}
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
            Quiet hours (suppress alerts during this local time window)
          </label>
          {preferences.quiet_hours_enabled && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                From
                <Input
                  type="time"
                  value={preferences.quiet_start ?? "21:00"}
                  onChange={(e) => update("quiet_start", e.target.value)}
                  className="w-32"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                To
                <Input
                  type="time"
                  value={preferences.quiet_end ?? "06:00"}
                  onChange={(e) => update("quiet_end", e.target.value)}
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
