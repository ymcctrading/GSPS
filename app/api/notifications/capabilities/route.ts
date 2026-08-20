import { NextResponse } from "next/server";
import { isEmailConfigured, isSmsConfigured } from "@/lib/notifications";

/** Which delivery channels this deployment has credentials for, so the UI can grey out the rest. */
export async function GET() {
  return NextResponse.json({
    email: isEmailConfigured(),
    sms: isSmsConfigured(),
  });
}
