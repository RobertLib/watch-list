import { NextRequest, NextResponse } from "next/server";
import { submitToIndexNow } from "@/lib/indexnow";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!urls || (!Array.isArray(urls) && typeof urls !== "string")) {
      return NextResponse.json(
        { error: "Invalid request: urls parameter is required" },
        { status: 400 }
      );
    }

    const success = await submitToIndexNow(urls);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "URLs submitted to IndexNow successfully",
        urls: Array.isArray(urls) ? urls : [urls],
      });
    } else {
      return NextResponse.json(
        { error: "Failed to submit URLs to IndexNow" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("IndexNow API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle GET request to verify the endpoint is working
export async function GET() {
  return NextResponse.json({
    message: "IndexNow API endpoint is ready",
    documentation:
      'POST to this endpoint with { "urls": ["https://example.com/page"] }',
  });
}
