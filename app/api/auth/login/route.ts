import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AUTH_COOKIE_NAME,
  getAuthToken,
  isAuthEnabled,
  verifyPassword,
} from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = loginSchema.parse(await request.json());
    if (!verifyPassword(body.password)) {
      return NextResponse.json(
        { error: "パスワードが正しくありません" },
        { status: 401 },
      );
    }

    const token = getAuthToken();
    if (!token) {
      return NextResponse.json({ error: "認証設定が不正です" }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ログインに失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
