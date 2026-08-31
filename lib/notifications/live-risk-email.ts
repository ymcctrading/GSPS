/**
 * Live-only per-trade loss/stop-override notifications, per the "GSPS
 * Implementation Brief" spec pack: "Send email and phone/SMS notification
 * once per threshold per trade." Follows the same Resend pattern as
 * lib/notifications/resend-handler.ts (kept separate rather than added
 * there, since these are risk-cascade transactional emails, not alert/
 * journal content).
 *
 * Phone/SMS: this repo has no SMS provider anywhere
 * (`grep -rl twilio` finds nothing) — `sendLiveRiskSms` is a deliberate
 * stub that reports the channel as not configured rather than pretending
 * to send. Callers must not treat its return as a delivered notification.
 */

import { Resend } from "resend";

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

export interface LiveLossThresholdEmailData {
  userEmail: string;
  symbol: string;
  thresholdPct: number;
  lossPct: number;
  hardWarning: boolean;
}

export async function sendLiveLossThresholdEmail(data: LiveLossThresholdEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping live-loss email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const subject = data.hardWarning
      ? `⚠️ Live position warning: ${data.symbol} down ${data.lossPct.toFixed(1)}%`
      : `Live position alert: ${data.symbol} down ${data.lossPct.toFixed(1)}%`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">${data.hardWarning ? "⚠️" : "🔔"} ${data.symbol} — live position loss</h1>
        <p style="color: #475569; font-size: 14px;">
          This live position has crossed a <strong>${data.thresholdPct}%</strong> allocated-funds loss
          threshold. Current loss: <strong>${data.lossPct.toFixed(1)}%</strong>.
        </p>
        ${
          data.hardWarning
            ? `<p style="color: #7c2d12; font-size: 13px; background:#fff7ed; padding:12px; border-left:4px solid #ea580c;">
                 At a 50% allocated-funds loss, GSPS automatically pauses automation on this
                 position, cancels pending orders, and attempts to close it. Live trading is
                 then restricted until GSPS School re-completion is confirmed.
               </p>`
            : ""
        }
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">Automated live-risk notice from GSPS.</p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: "GSPS Risk Alerts <onboarding@resend.dev>",
      to: data.userEmail,
      subject,
      html,
    });
    if (result.error) return { success: false, error: result.error.message };
    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send live-loss threshold email:", message);
    return { success: false, error: message };
  }
}

export interface StopOverrideEmailData {
  userEmail: string;
  symbol: string;
  action: "widen" | "remove";
  verificationUrl: string;
}

/** The stop-override verified-email confirmation link. */
export async function sendStopOverrideVerificationEmail(data: StopOverrideEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping stop-override email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #7c2d12; margin: 0 0 20px;">⚠️ Confirm: ${data.action} stop on ${data.symbol}</h1>
        <p style="color: #475569; font-size: 14px;">
          You requested to ${data.action} the default stop on your live ${data.symbol} position.
          This removes GSPS's automatic protection on this trade. Confirm only if you understand
          and accept the added risk.
        </p>
        <p style="margin: 20px 0;">
          <a href="${data.verificationUrl}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
            Confirm ${data.action}
          </a>
        </p>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: "GSPS Risk Alerts <onboarding@resend.dev>",
      to: data.userEmail,
      subject: `Confirm: ${data.action} stop on ${data.symbol}`,
      html,
    });
    if (result.error) return { success: false, error: result.error.message };
    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send stop-override verification email:", message);
    return { success: false, error: message };
  }
}

/**
 * Deliberate stub — no SMS provider exists in this repo. Always reports
 * `sent: false, reason: "not_configured"` so callers can record the gap
 * rather than silently pretend a phone notification went out.
 */
export async function sendLiveRiskSms(
  ...args: [phone: string, message: string]
): Promise<{ sent: false; reason: "not_configured" }> {
  void args;
  return { sent: false, reason: "not_configured" };
}
