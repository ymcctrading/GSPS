import { sendAlertEmail } from "@/lib/notifications/resend-handler";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // The "Send test alert" button posts with no body at all — every field
    // below already falls back to a default, so an empty/missing body is a
    // normal call, not an error. `req.json()` throws on an empty body, which
    // this route's own catch turned into a raw "Unexpected end of JSON
    // input" 500 shown verbatim in the UI.
    const body = await req.json().catch(() => ({}));

    // Get user's email from auth
    const userEmail = user.email || body.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Send test alert
    const result = await sendAlertEmail({
      userEmail,
      symbol: body.symbol || "AAPL",
      direction: body.direction || "bullish",
      score: body.score || 7,
      entry: body.entry || 150.25,
      stopLoss: body.stopLoss || 148.5,
      takeProfit: body.takeProfit || 155.0,
      verdict: body.verdict || "Execute",
      confidence: body.confidence || 0.78,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, success: false },
        { status: 500 }
      );
    }

    // Log the notification in database
    const { error: logError } = await supabase
      .from("notification_log")
      .insert({
        user_id: user.id,
        symbol: body.symbol || "AAPL",
        direction: body.direction || "bullish",
        score: body.score || 7,
        channel: "email",
        status: "sent",
        recipient: userEmail,
        triggered_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        signal_hash: `${body.symbol || "AAPL"}-${body.direction || "bullish"}-${body.score || 7}`,
      });

    if (logError) {
      console.warn("Failed to log notification:", logError.message);
    }

    return NextResponse.json({
      success: true,
      message: `Test alert sent to ${userEmail}`,
      emailId: result.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
