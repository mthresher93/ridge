import { NextResponse, type NextRequest } from "next/server";
import { authRequired, validSession } from "./lib/auth";

export async function middleware(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/haul.svg" ||
    pathname === "/move.svg" ||
    pathname === "/lumen.svg" ||
    pathname === "/lumen-mark.png"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/prospects/capture")) {
    return NextResponse.next();
  }

  const ok = await validSession(request.cookies.get("lumen_session")?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
