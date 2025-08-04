"use server";

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
  const cookieStore = await cookies();
  cookieStore.set(REGION_COOKIE_NAME, region, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
}
