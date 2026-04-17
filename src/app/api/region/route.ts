import { NextResponse } from "next/server";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "@/lib/region";

// Force dynamic to read cookies on every request
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentRegion = await getRegion();
    const regionCode = getRegionCode(currentRegion);

    return NextResponse.json({
      region: regionCode,
    });
  } catch (error) {
    console.error("Error fetching region:", error);
    return NextResponse.json(
      { error: "Failed to fetch region" },
      { status: 500 },
    );
  }
}
