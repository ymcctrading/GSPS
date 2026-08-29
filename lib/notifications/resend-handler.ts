import { Resend } from "resend";
import { SCANNER_STATE_META } from "@/lib/signals/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

const TIER_LABEL: Record<PublicSignalSummary["tier"], string> = {
  watchlistOnly: "Watchlist only",
  qualified: "Qualified",
  aTier: "A-tier",
  aPlusTier: "A+ tier",
};

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
  /**
   * The Signal and Regime Engine's own rollup — a separate read from the
   * Gann/STRAT verdict above, shown as additional context. Never what
   * decided this alert was sent.
   */
  signal?: PublicSignalSummary | null;
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

        ${
          data.signal
            ? `<div style="background: #f0f9ff; padding: 15px; border-left: 4px solid #0ea5e9; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #0c4a6e; font-size: 14px; font-weight: 600;">Signal &amp; Regime Engine (separate read)</p>
          <p style="margin: 8px 0 0; color: #0c4a6e; font-size: 13px;">
            ${SCANNER_STATE_META[data.signal.state].label} — ${TIER_LABEL[data.signal.tier]}${data.signal.tradeable ? " · Tradeable" : ""}
          </p>
        </div>`
            : ""
        }

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
    const result = await getResendClient().emails.send({
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

export interface JournalEmailData {
  userEmail: string;
  /** yyyy-mm-dd, the trading day this digest covers. */
  dateLabel: string;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  allTimeCount: number;
  attachment: Buffer;
  attachmentFilename: string;
}

/** The daily trade-journal digest — see `lib/journal/build-workbook.ts`. */
export async function sendJournalEmail(data: JournalEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping journal email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">📒 Your trade journal — ${data.dateLabel}</h1>
        <p style="color: #475569; font-size: 14px;">
          The attached spreadsheet has four sheets — Today, This Week, This Month, and All Time —
          each trade with its entry, exit, P/L, and the reasoning it was placed under.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr>
            <td style="padding: 8px; background: #f8fafc; color: #64748b; font-size: 12px;">Today</td>
            <td style="padding: 8px; background: #f8fafc; text-align: right; font-weight: 600;">${data.todayCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; color: #64748b; font-size: 12px;">This week</td>
            <td style="padding: 8px; text-align: right; font-weight: 600;">${data.weekCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; background: #f8fafc; color: #64748b; font-size: 12px;">This month</td>
            <td style="padding: 8px; background: #f8fafc; text-align: right; font-weight: 600;">${data.monthCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; color: #64748b; font-size: 12px;">All time</td>
            <td style="padding: 8px; text-align: right; font-weight: 600;">${data.allTimeCount}</td>
          </tr>
        </table>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">Sent automatically, 2 hours after the close, from GSPS.
          <a href="https://gsps.app/portfolio" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: "GSPS Journal <onboarding@resend.dev>",
      to: data.userEmail,
      subject: `Trade journal — ${data.dateLabel}`,
      html,
      attachments: [
        {
          filename: data.attachmentFilename,
          content: data.attachment,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    if (result.error) {
      console.error("Resend error:", result.error);
      return { success: false, error: result.error.message };
    }
    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send journal email:", message);
    return { success: false, error: message };
  }
}

export interface OrderInvalidatedEmailData {
  userEmail: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  reason: string;
}

/**
 * Sent when a pending entry is canceled because price hit its stop before the
 * entry ever filled (see `lib/trade/invalidate-pending.ts`). Kept separate
 * from `sendAlertEmail` — a canceled order isn't a new signal, and forcing it
 * through `notification_log` would mean inventing a direction/score for a
 * schema built around scan alerts.
 */
export async function sendOrderInvalidatedEmail(data: OrderInvalidatedEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping invalidation email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const subject = `Order canceled: ${data.symbol} invalidated before entry`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">⚠ ${data.symbol} pending order canceled</h1>
        <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #ea580c; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #7c2d12; font-size: 14px;">${data.reason}</p>
        </div>
        <p style="color: #475569; font-size: 13px;">
          ${data.side === "buy" ? "Buy" : "Sell"} ${data.qty} ${data.symbol}
          ${data.limitPrice != null ? ` at $${data.limitPrice.toFixed(2)} limit` : ""}
          ${data.stopPrice != null ? ` · stop $${data.stopPrice.toFixed(2)}` : ""}
        </p>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This order moved to Rejected in your Portfolio.
          <a href="https://gsps.app/portfolio" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
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
    console.error("Failed to send invalidation email:", message);
    return { success: false, error: message };
  }
}
