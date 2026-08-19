import { sendAlertEmail } from "@/lib/notifications/resend-handler";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();

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
