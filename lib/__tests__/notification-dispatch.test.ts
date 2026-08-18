import { describe, expect, it, vi } from "vitest";
import {
  dispatchNotification,
  type DispatchProviders,
  type DispatchSupabase,
  type NotificationPreferencesRow,
} from "@/lib/notifications/dispatch";

function prefsRow(overrides: Partial<NotificationPreferencesRow> = {}): NotificationPreferencesRow {
  return {
    user_id: "user-1",
    email_enabled: true,
    sms_enabled: true,
    push_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    timezone: "America/New_York",
    phone_number: "+15555550123",
    push_subscription: { endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } },
    min_score: 7,
    ...overrides,
  };
}

/** In-memory fake standing in for the real Supabase client. */
function fakeSupabase(prefs: NotificationPreferencesRow | null) {
  const inserted: Record<string, unknown>[] = [];
  const supabase: DispatchSupabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "notification_preferences" ? prefs : null, error: null }),
          }),
        }),
        insert: async (row: unknown) => {
          inserted.push(row as Record<string, unknown>);
          return { error: null };
        },
      };
    },
  };
  return { supabase, inserted };
}

function okProviders(overrides: Partial<DispatchProviders> = {}): DispatchProviders {
  return {
    isEmailEnabled: vi.fn(() => true),
    sendEmail: vi.fn(async () => ({ ok: true })),
    isSmsEnabled: vi.fn(() => true),
    sendSms: vi.fn(async () => ({ ok: true })),
    isPushEnabled: vi.fn(() => true),
    sendPush: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

describe("dispatchNotification", () => {
  it("does nothing and logs nothing when the user has no preferences row", async () => {
    const { supabase, inserted } = fakeSupabase(null);
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 9, message: "hi" },
      {},
      okProviders(),
    );
    expect(results).toEqual([]);
    expect(inserted).toHaveLength(0);
  });

  it("sends on every enabled channel and logs one row per attempt", async () => {
    const { supabase, inserted } = fakeSupabase(prefsRow());
    const providers = okProviders();
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { alertId: "alert-1", symbol: "TSLA", score: 9, message: "TSLA broke out" },
      { email: "trader@example.com" },
      providers,
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "sent")).toBe(true);
    expect(inserted).toHaveLength(3);
    expect(providers.sendEmail).toHaveBeenCalledWith({
      to: "trader@example.com",
      subject: "GSPS alert: TSLA",
      body: "TSLA broke out",
    });
    expect(providers.sendSms).toHaveBeenCalledWith({ to: "+15555550123", body: "TSLA broke out" });
    expect(providers.sendPush).toHaveBeenCalled();

    for (const row of inserted) {
      expect(row.user_id).toBe("user-1");
      expect(row.alert_id).toBe("alert-1");
      expect(row.status).toBe("sent");
    }
  });

  it("skips disabled channels entirely — no send, no log row", async () => {
    const { supabase, inserted } = fakeSupabase(prefsRow({ sms_enabled: false, push_enabled: false }));
    const providers = okProviders();
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 9, message: "hi" },
      { email: "trader@example.com" },
      providers,
    );

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("email");
    expect(inserted).toHaveLength(1);
    expect(providers.sendSms).not.toHaveBeenCalled();
    expect(providers.sendPush).not.toHaveBeenCalled();
  });

  it("logs skipped_preference and does not send when the alert is below the user's threshold", async () => {
    const { supabase, inserted } = fakeSupabase(prefsRow({ min_score: 8, sms_enabled: false, push_enabled: false }));
    const providers = okProviders();
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 7, message: "hi" },
      { email: "trader@example.com" },
      providers,
    );

    expect(results).toEqual([{ channel: "email", status: "skipped_preference", detail: "score 7 < min 8" }]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("skipped_preference");
    expect(providers.sendEmail).not.toHaveBeenCalled();
  });

  it("logs skipped_quiet_hours and does not send while inside the quiet-hours window", async () => {
    const { supabase, inserted } = fakeSupabase(
      prefsRow({
        sms_enabled: false,
        push_enabled: false,
        quiet_hours_enabled: true,
        quiet_hours_start: "00:00",
        quiet_hours_end: "23:59",
      }),
    );
    const providers = okProviders();
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 9, message: "hi" },
      { email: "trader@example.com" },
      providers,
    );

    expect(results).toEqual([{ channel: "email", status: "skipped_quiet_hours" }]);
    expect(inserted[0].status).toBe("skipped_quiet_hours");
    expect(providers.sendEmail).not.toHaveBeenCalled();
  });

  it("logs a failed attempt (not a thrown error) when a provider reports not-configured", async () => {
    const { supabase, inserted } = fakeSupabase(prefsRow({ sms_enabled: false, push_enabled: false }));
    const providers = okProviders({ isEmailEnabled: vi.fn(() => false) });
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 9, message: "hi" },
      { email: "trader@example.com" },
      providers,
    );

    expect(results).toEqual([{ channel: "email", status: "failed", detail: "Email is not configured" }]);
    expect(inserted[0].status).toBe("failed");
  });

  it("logs a failed attempt when the channel is enabled but no destination is on file", async () => {
    const { supabase, inserted } = fakeSupabase(
      prefsRow({ email_enabled: false, push_enabled: false, phone_number: null }),
    );
    const providers = okProviders();
    const results = await dispatchNotification(
      supabase,
      "user-1",
      { symbol: "TSLA", score: 9, message: "hi" },
      {},
      providers,
    );

    expect(results).toEqual([{ channel: "sms", status: "failed", detail: "No phone number on file" }]);
    expect(inserted[0].status).toBe("failed");
  });
});
