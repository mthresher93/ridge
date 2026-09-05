import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    liveReady: false,
    policy: { approvedStates: [], retryMinutes: 60, attemptLimit: 8, dncMaxAgeDays: 31 },
    detail: "Telephony provider is not connected. Local records still save in Aileron.",
  });
}
