import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface AlertEmailData {
  userEmail: string;
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  verdict: string;
  confidence: number;
}

export async function sendAlertEmail(data: AlertEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const subject = `${data.direction.toUpperCase()} Alert: ${data.symbol} (Score: ${data.score}/9)`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">🎯 ${data.direction === "bullish" ? "📈" : "📉"} ${data.symbol} Signal</h1>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Direction</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 18px; font-weight: 700;">
                ${data.direction === "bullish" ? "↗ Bullish" : "↘ Bearish"}
              </p>
            </div>
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Score</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 18px; font-weight: 700;">${data.score}/9</p>
            </div>
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Entry</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">$${data.entry.toFixed(2)}</p>
            </div>
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Verdict</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${data.verdict}</p>
            </div>
          </div>
        </div>

        <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #ea580c; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #7c2d12; font-size: 14px; font-weight: 600;">Risk Management</p>
          <p style="margin: 8px 0 0; color: #7c2d12; font-size: 13px;">
            Stop Loss: <strong>$${data.stopLoss.toFixed(2)}</strong> |
            Target: <strong>$${data.takeProfit.toFixed(2)}</strong>
          </p>
        </div>

        <div style="margin-bottom: 20px;">
          <p style="margin: 0 0 10px; color: #0f172a; font-size: 14px; font-weight: 600;">Next Steps:</p>
          <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px;">
            <li>Review on the chart in GSPS</li>
            <li>Confirm entry setup against your risk plan</li>
            <li>Place order with the recommended stops</li>
            <li>Monitor for invalidation near stop loss</li>
          </ol>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This is an automated alert from GSPS.
          <a href="https://gsps.app" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;

    // Use Resend's default "onboarding" domain until gsps.app is verified
    // Format: from@resend.dev or your verified domain
    const result = await resend.emails.send({
      from: "GSPS Alerts <onboarding@resend.dev>",
      to: data.userEmail,
      subject,
      html,
    });

    if (result.error) {
      console.error("Resend error:", result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send alert email:", message);
    return { success: false, error: message };
  }
}
