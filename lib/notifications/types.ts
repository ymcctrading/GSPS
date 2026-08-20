export type NotificationChannel = "email" | "sms";
export type NotificationSource = "daily_scan" | "intraday_alert";
export type NotificationStatus = "sent" | "failed" | "skipped_quiet_hours" | "skipped_disabled";

export interface NotificationPreferences {
  userId: string;
  email: string | null;
  phoneNumber: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  dailyScanEnabled: boolean;
  intradayAlertEnabled: boolean;
  /** 0-9, same scale as scan_results/daily_scans.score. */
  minScore: number;
  /** Minutes since local midnight (0-1439), or null if quiet hours are unset. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  timezone: string;
}

/** One symbol's worth of alert content, channel-agnostic. */
export interface AlertItem {
  symbol: string;
  /** 0-9, same scale as NotificationPreferences.minScore. */
  score: number;
  headline: string;
  body: string;
  sourceId: string;
}
