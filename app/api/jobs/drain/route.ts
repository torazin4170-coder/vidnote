import { NextResponse } from "next/server";

import { drainJobQueue } from "@/lib/jobs/processor";

export const maxDuration = 300;

export async function POST() {
  await drainJobQueue();
  return NextResponse.json({ ok: true });
}
