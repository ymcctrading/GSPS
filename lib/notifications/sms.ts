/**
 * SMS delivery via Twilio. Feature-flagged like lib/brokers/snaptrade.ts:
 * without TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER,
 * isSmsConfigured() is false and every send is a no-op the caller logs as
 * "skipped_disabled" rather than an error.
 */

type TwilioClient = import("twilio").Twilio;

let twilioClient: TwilioClient | null = null;

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER,
  );
}

async function client(): Promise<TwilioClient> {
  if (!twilioClient) {
    const { Twilio } = await import("twilio");
    twilioClient = new Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return twilioClient;
}

/** Twilio segments SMS at 160 chars (GSM-7); body is truncated well under that. */
const MAX_SMS_BODY = 300;

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSmsConfigured()) return { ok: false, error: "Twilio is not configured" };
  try {
    const c = await client();
    await c.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body: body.length > MAX_SMS_BODY ? body.slice(0, MAX_SMS_BODY - 1) + "…" : body,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
