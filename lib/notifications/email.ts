/**
 * Email delivery via SendGrid. Feature-flagged like lib/brokers/snaptrade.ts:
 * without SENDGRID_API_KEY, isEmailConfigured() is false and every send is a
 * no-op the caller logs as "skipped_disabled" rather than an error.
 */

type MailService = import("@sendgrid/mail").MailService;

let sgMail: MailService | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.NOTIFICATIONS_FROM_EMAIL);
}

async function client(): Promise<MailService> {
  if (!sgMail) {
    sgMail = (await import("@sendgrid/mail")).default;
    sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  }
  return sgMail;
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "SendGrid is not configured" };
  try {
    const mail = await client();
    await mail.send({
      to,
      from: process.env.NOTIFICATIONS_FROM_EMAIL!,
      subject,
      text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
