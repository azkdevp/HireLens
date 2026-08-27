import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieWrite = { name: string; value: string; options: CookieOptions };

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const isRecovery = request.nextUrl.searchParams.get("type") === "recovery";
  const destination = new URL("/reset-password", request.url);
  const response = NextResponse.redirect(destination);

  if (!code || !isRecovery) return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: CookieWrite[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    }
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) response.cookies.set("hirelens-password-recovery", "active", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
