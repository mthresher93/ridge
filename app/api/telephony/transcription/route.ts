import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    runtime: { ready: false, model: null },
    calls: [],
    jobs: [],
  });
}

export async function POST() {
  return NextResponse.json({
    job: {
      status: "blocked",
      detail: "Local Whisper is not installed. Audio stays on this machine only after a transcriber is configured.",
    },
  });
}
