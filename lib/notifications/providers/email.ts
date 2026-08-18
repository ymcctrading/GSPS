/**
 * Email notifications via SendGrid's REST API — plain `fetch`, no SDK, matching
 * how `lib/brokers/snaptrade.ts` keeps optional integrations feature-flagged:
 * every send checks `isEmailEnabled()` first and the feature reports itself as
 * "not configured" rather than throwing when the env var is unset.
 */

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export function isEmailEnabled(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail({ to, subject, body }: SendEmailArgs): Promise<SendResult> {
  if (!isEmailEnabled()) {
    return { ok: false, error: "Email is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL unset)" };
  }

  try {
    const res = await fetch(SENDGRID_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `SendGrid ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email send error" };
  }
}
