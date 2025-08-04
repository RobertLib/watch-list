import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// List of blocked User-Agent strings
const BLOCKED_USER_AGENTS: string[] = [];

// Function to check if User-Agent contains blocked string
function isBlockedUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;

  const lowerUserAgent = userAgent.toLowerCase();

  return BLOCKED_USER_AGENTS.some((blockedAgent) =>
    lowerUserAgent.includes(blockedAgent.toLowerCase())
  );
}

export default function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Check User-Agent
  if (isBlockedUserAgent(userAgent)) {
    console.log(`🚫 Blocked bot: ${userAgent} from IP: ${ip}`);
    return new NextResponse("Access denied", { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
