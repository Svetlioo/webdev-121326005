import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// A fast first check: no session cookie, no schedule. The real check against the session
// table happens again on the page and in every route handler.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL('/signin', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/schedule/:path*', '/week/:path*', '/imports/:path*'] };
