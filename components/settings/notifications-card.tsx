"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";

interface Preferences {
  email: string | null;
  phoneNumber: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  dailyScanEnabled: boolean;
  intradayAlertEnabled: boolean;
  minScore: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  timezone: string;
}

interface Capabilities {
  email: boolean;
  sms: boolean;
}

interface HistoryEntry {
  id: string;
  channel: "email" | "sms";
  source: "daily_scan" | "intraday_alert";
  symbols: string[];
  subject: string | null;
  status: "sent" | "failed" | "skipped_quiet_hours" | "skipped_disabled";
  error: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  sent: "Sent",
  failed: "Failed",
  skipped_quiet_hours: "Held (quiet hours)",
  skipped_disabled: "Not delivered (channel unavailable)",
};

const STATUS_VARIANT: Record<HistoryEntry["status"], "bull" | "bear" | "warn" | "muted"> = {
  sent: "bull",
  failed: "bear",
  skipped_quiet_hours: "muted",
  skipped_disabled: "warn",
};

/** "HH:MM" <-> minutes-since-midnight, the wire format the API expects. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) return null;
  return h * 60 + mins;
}

function toHHMM(minutes: number | null): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function NotificationsCard() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((res) => res.json())
      .then((body: { preferences: Preferences }) => setPrefs(body.preferences))
      .catch(() => {});
    fetch("/api/notifications/capabilities")
      .then((res) => res.json())
      .then(setCaps)
      .catch(() => setCaps({ email: false, sms: false }));
    fetch("/api/notifications/history?limit=10")
      .then((res) => res.json())
      .then((body: { entries: HistoryEntry[] }) => setHistory(body.entries))
      .catch(() => setHistory([]));
  }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setFeedback({ ok: true, text: "Saved." });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" /> Notifications
        </CardTitle>
        <CardDescription>
          Email and SMS delivery for high-score alerts, with quiet hours and a minimum score floor.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {prefs === null || caps === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Email address</span>
                <Input
                  type="email"
                  value={prefs.email ?? ""}
                  onChange={(e) => setPrefs({ ...prefs, email: e.target.value })}
                  disabled={!caps.email}
                  placeholder="you@example.com"
                />
                {!caps.email && (
                  <span className="text-xs text-muted">Email delivery isn&apos;t configured on this deployment yet.</span>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Phone number (SMS)</span>
                <Input
                  type="tel"
                  value={prefs.phoneNumber ?? ""}
                  onChange={(e) => setPrefs({ ...prefs, phoneNumber: e.target.value })}
                  disabled={!caps.sms}
                  placeholder="+15551234567"
                />
                {!caps.sms && (
                  <span className="text-xs text-muted">SMS delivery isn&apos;t configured on this deployment yet.</span>
                )}
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow
                label="Email alerts"
                checked={prefs.emailEnabled}
                disabled={!caps.email}
                onChange={(v) => setPrefs({ ...prefs, emailEnabled: v })}
              />
              <ToggleRow
                label="SMS alerts"
                checked={prefs.smsEnabled}
                disabled={!caps.sms}
                onChange={(v) => setPrefs({ ...prefs, smsEnabled: v })}
              />
              <ToggleRow
                label="Daily market scan"
                checked={prefs.dailyScanEnabled}
                onChange={(v) => setPrefs({ ...prefs, dailyScanEnabled: v })}
              />
              <ToggleRow
                label="Intraday alerts"
                checked={prefs.intradayAlertEnabled}
                onChange={(v) => setPrefs({ ...prefs, intradayAlertEnabled: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Minimum score (0-9)</span>
                <Input
                  type="number"
                  min={0}
                  max={9}
                  step={1}
                  value={prefs.minScore}
                  onChange={(e) => setPrefs({ ...prefs, minScore: Number(e.target.value) })}
                />
                <span className="text-xs text-muted">Alerts below this score are never sent.</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Quiet hours start</span>
                <Input
                  type="time"
                  value={toHHMM(prefs.quietHoursStart)}
                  onChange={(e) =>
                    setPrefs({ ...prefs, quietHoursStart: e.target.value ? toMinutes(e.target.value) : null })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Quiet hours end</span>
                <Input
                  type="time"
                  value={toHHMM(prefs.quietHoursEnd)}
                  onChange={(e) =>
                    setPrefs({ ...prefs, quietHoursEnd: e.target.value ? toMinutes(e.target.value) : null })
                  }
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save notification settings"}
              </Button>
              {feedback && (
                <span className={feedback.ok ? "text-sm text-bull" : "text-sm text-bear"}>{feedback.text}</span>
              )}
            </div>
          </>
        )}

        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-medium">Recent notifications</h3>
          {history === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">No notifications sent yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{h.subject ?? h.symbols.join(", ")}</span>{" "}
                    <span className="text-muted">
                      · {h.channel} · {h.source === "daily_scan" ? "Daily scan" : "Intraday"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Badge variant={STATUS_VARIANT[h.status]}>{STATUS_LABEL[h.status]}</Badge>
                    <span className="text-xs text-muted">{new Date(h.created_at).toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <span className={disabled ? "text-muted" : "font-medium"}>{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
