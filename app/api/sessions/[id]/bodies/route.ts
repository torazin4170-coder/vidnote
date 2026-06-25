import { NextResponse } from "next/server";

import { getSessionBodies } from "@/lib/db/sessions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const bodies = await getSessionBodies(id);
  if (!bodies) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ bodies });
}
