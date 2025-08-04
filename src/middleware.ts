import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// List of blocked User-Agent strings
const BLOCKED_USER_AGENTS = [
  // OpenAI bots
  "GPTBot",
  "OpenAI-ChatGPT",
  "ChatGPT-User",
  "OpenAI",

  // Anthropic/Claude bots
  "anthropic-ai",
  "Claude-Web",
  "Claude",

  // Common Crawl
  "CCBot",

  // Meta/Facebook AI
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "FacebookBot",
  "facebookexternalhit",

  // Perplexity AI
  "PerplexityBot",

  // You.com AI
  "YouBot",

  // ByteDance/TikTok
  "Bytespider",

  // Apple AI
  "Applebot-Extended",

  // AI2
  "AI2Bot",

  // Other known scrapers
  "ImagesiftBot",
  "Omgilibot",
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
  "AspiegelBot",
  "DataForSeoBot",
  "PetalBot",
  "MegaIndex",
  "BLEXBot",
  "yandex",
  "YandexBot",

  // Generic AI/scraper patterns
  "crawler",
  "scraper",
  "spider",
  "bot",
];

// Function to check if User-Agent contains blocked string
function isBlockedUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;

  const lowerUserAgent = userAgent.toLowerCase();

  return BLOCKED_USER_AGENTS.some((blockedAgent) =>
    lowerUserAgent.includes(blockedAgent.toLowerCase())
  );
}

// Function to check if IP address looks like bot/scraper
function isSuspiciousIP(ip: string): boolean {
  // You can add specific IP ranges of known scrapers
  // E.g. some cloud providers used for scraping
  const suspiciousRanges: string[] = [
    // Add specific IP ranges as needed
  ];

  return suspiciousRanges.some((range) => ip.startsWith(range));
}

export function middleware(request: NextRequest) {
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

  // Check suspicious IP addresses
  if (isSuspiciousIP(ip)) {
    console.log(`🚫 Blocked suspicious IP: ${ip}`);
    return new NextResponse("Access denied", { status: 403 });
  }

  // Rate limiting check - block too frequent requests
  const url = new URL(request.url);

  // Block API endpoint requests from bots
  if (
    url.pathname.startsWith("/api/") &&
    userAgent.toLowerCase().includes("bot")
  ) {
    console.log(`🚫 Blocked API access from bot: ${userAgent}`);
    return new NextResponse("API access denied", { status: 403 });
  }

  return NextResponse.next();
}

// Middleware configuration - which paths to run on
export const config = {
  matcher: [
    /*
     * Run middleware on all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - manifest.json and other public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.ico$|manifest\\.json|robots\\.txt|sitemap\\.xml).*)",
  ],
};
