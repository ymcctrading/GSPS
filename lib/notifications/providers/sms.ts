/**
 * SMS notifications via Twilio's REST API — plain `fetch`, no SDK. Same
 * feature-flag shape as `lib/brokers/snaptrade.ts`: `isSmsEnabled()` gates
 * every call, and sending without credentials reports "not configured"
 * instead of throwing.
 */

export function isSmsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER,
  );
}

export interface SendSmsArgs {
  to: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendSms({ to, body }: SendSmsArgs): Promise<SendResult> {
  if (!isSmsEnabled()) {
    return {
      ok: false,
      error: "SMS is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER unset)",
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: process.env.TWILIO_FROM_NUMBER!,
        Body: body,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown SMS send error" };
  }
}
