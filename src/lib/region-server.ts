// Intentionally NOT a "use server" module. That directive turns every export
// into a public server action endpoint, which made `setRegion` – which writes a
// cookie and validates nothing itself – callable directly over HTTP, bypassing
// the check in `changeRegion`. These are plain server helpers; the validating
// server action in app/actions.ts is the only way in.
import { cookies } from "next/headers";
import { isValidRegion } from "./region";

export type Region = string;

const REGION_COOKIE_NAME = "tmdb-region";
const DEFAULT_REGION: Region = "US";

export async function getRegion(): Promise<Region> {
  const cookieStore = await cookies();
  const regionCookie = cookieStore.get(REGION_COOKIE_NAME);

  if (regionCookie && isValidRegion(regionCookie.value)) {
    return regionCookie.value;
  }

  return DEFAULT_REGION;
}

export async function setRegion(region: Region): Promise<void> {
  // Validated here as well as in `changeRegion`, so nothing can put a value into
  // the cookie that `getRegion` would then refuse to read back.
  if (!isValidRegion(region)) {
    throw new Error(`Invalid region: ${region}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(REGION_COOKIE_NAME, region, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
}
