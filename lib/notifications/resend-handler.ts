import { Resend } from "resend";
import { SCANNER_STATE_META } from "@/lib/signals/types";
import type { PublicSignalSummary } from "@/lib/signals/publicSummary";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { priceUsd } from "@/lib/strat/priceText";

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * The sender. `RESEND_FROM` is an address on a domain verified at
 * resend.com/domains (e.g. "alerts@example.com"). Until it is set, every send
 * goes out from Resend's shared sandbox sender, "onboarding@resend.dev", and
 * Resend rejects that sender for any recipient but the account's own address
 * (review finding S-04: 12,534 failures, every delivery to a member). So while
 * it is unset, other recipients are skipped here with a clear reason, marked
 * `skipped`, instead of each surfacing as an unexplained Resend 403.
 *
 * `RESEND_SANDBOX_RECIPIENTS` (comma-separated) overrides the sandbox's
 * allowed recipients; unset, it falls back to the address Resend's own error
 * names as this account's verified owner.
 */
export const SANDBOX_SENDER = "onboarding@resend.dev";

const BARE_ADDRESS = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;

/**
 * Where the emails' links point. The templates linked to https://gsps.app, a
 * domain GSPS has never used, so every "View in app" link in a member's alert
 * led nowhere. The site is www.gsps.world (2026-10-21);
 * `NEXT_PUBLIC_APP_URL` overrides it, as it does for billing's return URLs.
 */
export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.gsps.world").replace(/\/+$/, "");
  return `${base}${path}`;
}

/**
 * The bare address in `RESEND_FROM`, which may be set as "alerts@example.com"
 * or "GSPS <alerts@example.com>". `fromHeader` adds its own display name, so a
 * value that already carried one produced "Name <GSPS <alerts@...>>", which
 * Resend rejects as an invalid `from` (every email on 2026-10-21 from about
 * 20:00 UTC). A value that is neither form is treated as unset, so sends fall
 * back to the sandbox rule and are skipped with a reason instead of failing.
 */
export function parseSenderAddress(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const bracketed = /<([^<>]+)>\s*$/.exec(value);
  const address = (bracketed ? bracketed[1] : value).trim().replace(/^["']|["']$/g, "");
  return BARE_ADDRESS.test(address) ? address : null;
}

export function senderAddress(): string {
  return parseSenderAddress(process.env.RESEND_FROM) ?? SANDBOX_SENDER;
}

/** The `from` header for a send: a display name on the configured sender. */
export function fromHeader(label: string): string {
  return `${label} <${senderAddress()}>`;
}

function sandboxRecipients(): string[] {
  return (process.env.RESEND_SANDBOX_RECIPIENTS ?? "ymcctrading@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Why a send to `toEmail` is skipped, or null when it may go out. */
export function sandboxBlockReason(toEmail: string): string | null {
  if (senderAddress().toLowerCase() !== SANDBOX_SENDER) return null;
  const recipients = sandboxRecipients();
  if (recipients.includes(toEmail.trim().toLowerCase())) return null;
  const raw = process.env.RESEND_FROM?.trim();
  if (raw && !parseSenderAddress(raw)) {
    console.error("resend: RESEND_FROM is set but is not an email address; member email is skipped until it is fixed");
    return `RESEND_FROM is set but is not an email address (use alerts@your-domain or Name <alerts@your-domain>) — skipped ${toEmail}.`;
  }
  return (
    `Resend sandbox sender (${SANDBOX_SENDER}) can only deliver to ` +
    `${recipients.join(", ")} until a domain is verified at resend.com/domains and RESEND_FROM is set — skipped ${toEmail}.`
  );
}

export interface AlertEmailData {
  userEmail: string;
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  /** See lib/scoring/display.ts. */
  exactScoreDisplayEnabled: boolean;
  entry: number;
  stopLoss: number;
  /** Null when the alert fixes no target and the stop trails the move instead. */
  takeProfit: number | null;
  verdict: "Execute" | "Watch" | "Reject";
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
  const blocked = sandboxBlockReason(data.userEmail);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
  }

  try {
    const scoreLabel = formatScore(data.score, data.exactScoreDisplayEnabled);
    const subject = `${data.direction.toUpperCase()} Alert: ${data.symbol} (Score: ${scoreLabel}/${SCORE_MAX})`;

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
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 18px; font-weight: 700;">${scoreLabel}/${SCORE_MAX}</p>
            </div>
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Entry</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${priceUsd(data.entry)}</p>
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
            Stop Loss: <strong>${priceUsd(data.stopLoss)}</strong> |
            Target: <strong>${data.takeProfit != null ? `${priceUsd(data.takeProfit)}` : "none fixed — the stop trails the move"}</strong>
          </p>
        </div>

        ${
          data.signal
            ? `<div style="background: #f0f9ff; padding: 15px; border-left: 4px solid #0ea5e9; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #0c4a6e; font-size: 14px; font-weight: 600;">Signal &amp; Regime Engine (separate read)</p>
          <p style="margin: 8px 0 0; color: #0c4a6e; font-size: 13px;">
            ${SCANNER_STATE_META[data.signal.state].label}${data.signal.tradeable ? " · Tradeable" : " · Not tradeable"}
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
          <a href="${appUrl()}" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;

    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Alerts"),
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

export interface SetupInvalidatedEmailData {
  userEmail: string;
  symbol: string;
}

/**
 * Sent when a tracked setup's Watch -> Execute monitor confirms
 * WATCH/EXECUTE -> INVALIDATED (`lib/entitlements/monitor.ts`) -- the setup
 * a user was being watched on, or already holding, no longer holds. Kept
 * separate from `sendAlertEmail`: an invalidation has no fresh entry/stop/
 * target to disclose (the evaluation that produces it is a symbol dropping
 * out of a scan's qualifying results, not a new signal), so there is
 * nothing to fill that template's price fields with.
 */
export async function sendSetupInvalidatedEmail(data: SetupInvalidatedEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping setup-invalidated email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const blocked = sandboxBlockReason(data.userEmail);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
  }

  try {
    const subject = `${data.symbol} setup invalidated`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">⚠ ${data.symbol} setup invalidated</h1>
        <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #ea580c; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #7c2d12; font-size: 14px;">
            Price action broke the structure that qualified this setup — GSPS no longer considers it valid.
            If you're in this trade, review it against your risk plan; if you were watching it, treat it as closed.
          </p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This is an automated alert from GSPS.
          <a href="${appUrl()}" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;

    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Alerts"),
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
    console.error("Failed to send setup-invalidated email:", message);
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
  const blocked = sandboxBlockReason(data.userEmail);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
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
          <a href="${appUrl("/portfolio")}" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Journal"),
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
  const blocked = sandboxBlockReason(data.userEmail);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
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
          ${data.limitPrice != null ? ` at ${priceUsd(data.limitPrice)} limit` : ""}
          ${data.stopPrice != null ? ` · stop ${priceUsd(data.stopPrice)}` : ""}
        </p>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This order moved to Rejected in your Portfolio.
          <a href="${appUrl("/portfolio")}" style="color: #0ea5e9; text-decoration: none;">View in app</a>
          </p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Alerts"),
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

export interface OperatorDriftAlertEmailData {
  reason: string;
  shadowTrades: number;
  shadowWinRate: number;
  shadowExpectancyR: number;
  backtestWinRate: number;
  backtestExpectancyR: number;
}

/**
 * Phase 7 ("Validation and monitoring") alert delivery — sent when
 * `lib/shadow/compare.ts`'s `evaluateShadowDrift` confirms live signal
 * quality has drifted from the backtest baseline. Deliberately not routed
 * through `sendAlertEmail`/`notification_deliveries`: those are per-user,
 * per-symbol trade alerts tied to a WATCH -> EXECUTE transition, and this is
 * a single platform-wide operational alert with no `profile_id` or
 * `transition_id` to key it on. Gated on a second env var
 * (`OPERATOR_ALERT_EMAIL`) beyond `RESEND_API_KEY`, since this has no
 * per-user recipient to read from `auth.users` — unset, this silently
 * no-ops (the caller's own `console.warn` is still the record), same
 * "not configured" posture every send function in this file already has
 * for a missing `RESEND_API_KEY`.
 */
export async function sendOperatorDriftAlertEmail(data: OperatorDriftAlertEmailData) {
  const to = process.env.OPERATOR_ALERT_EMAIL;
  if (!to) {
    console.warn("OPERATOR_ALERT_EMAIL not set; skipping shadow-drift alert email");
    return { success: false, error: "OPERATOR_ALERT_EMAIL not configured" };
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping shadow-drift alert email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const blocked = sandboxBlockReason(to);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
  }

  try {
    const subject = "GSPS: live signal quality has drifted from backtest";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">⚠ Shadow-mode drift detected</h1>
        <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #ea580c; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #7c2d12; font-size: 14px;">${data.reason}</p>
        </div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Live (shadow)</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">
                ${(data.shadowWinRate * 100).toFixed(1)}% win rate · ${data.shadowExpectancyR.toFixed(2)}R expectancy
              </p>
              <p style="margin: 2px 0 0; color: #64748b; font-size: 12px;">${data.shadowTrades} trades</p>
            </div>
            <div>
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Backtest baseline</p>
              <p style="margin: 5px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">
                ${(data.backtestWinRate * 100).toFixed(1)}% win rate · ${data.backtestExpectancyR.toFixed(2)}R expectancy
              </p>
            </div>
          </div>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This is an internal operational alert — it was not sent to any user.
          <a href="${appUrl("/learning")}" style="color: #0ea5e9; text-decoration: none;">View shadow summary</a>
          </p>
        </div>
      </div>
    `;
    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Ops"),
      to,
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
    console.error("Failed to send shadow-drift operator alert email:", message);
    return { success: false, error: message };
  }
}

export interface PriceAlertEmailData {
  userEmail: string;
  symbol: string;
  targetPrice: number;
  direction: "above" | "below";
  /** The price that confirmed the crossing, at sweep time. */
  currentPrice: number;
}

/**
 * Sent when a durable custom price alert (migration 0077,
 * app/api/price-alerts/sweep/route.ts) fires. Deliberately its own
 * template rather than reusing `sendAlertEmail`: a price alert carries no
 * score/verdict/entry-stop-target — a user set a bare price level on the
 * chart, not a GSPS-scored setup.
 */
export async function sendPriceAlertEmail(data: PriceAlertEmailData) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping price-alert email");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const blocked = sandboxBlockReason(data.userEmail);
  if (blocked) {
    console.warn(blocked);
    return { success: false, error: blocked, skipped: true };
  }

  try {
    const verb = data.direction === "above" ? "rose above" : "fell below";
    const subject = `${data.symbol} ${verb} ${priceUsd(data.targetPrice)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0f172a; margin: 0 0 20px;">🔔 ${data.symbol} price alert</h1>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #0f172a; font-size: 16px;">
            ${data.symbol} ${verb} your alert level of <strong>${priceUsd(data.targetPrice)}</strong>.
          </p>
          <p style="margin: 10px 0 0; color: #64748b; font-size: 13px;">
            Last price checked: ${priceUsd(data.currentPrice)}
          </p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          <p style="margin: 0;">This alert has now fired and won't repeat. Set a new one from the chart if you want another.
          <a href="${appUrl(`/ticker/${encodeURIComponent(data.symbol)}`)}" style="color: #0ea5e9; text-decoration: none;">View chart</a>
          </p>
        </div>
      </div>
    `;

    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Alerts"),
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
    console.error("Failed to send price-alert email:", message);
    return { success: false, error: message };
  }
}

/**
 * An operator's test send, to check the sender end to end (the domain, the
 * `RESEND_FROM` value and the API key) without waiting for a real alert. It
 * goes through the same `fromHeader` and sandbox rule as every member email,
 * so a pass here means member email works too.
 */
export async function sendTestEmail(to: string) {
  if (!process.env.RESEND_API_KEY) return { success: false, error: "RESEND_API_KEY not configured" };
  const blocked = sandboxBlockReason(to);
  if (blocked) return { success: false, error: blocked, skipped: true };
  try {
    const result = await getResendClient().emails.send({
      from: fromHeader("GSPS Ops"),
      to,
      subject: "GSPS: test email",
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"><p>This is a test from GSPS. If it reached you, email from ${senderAddress()} is working.</p></div>`,
    });
    if (result.error) return { success: false, error: result.error.message };
    return { success: true, id: result.data?.id, from: senderAddress() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
