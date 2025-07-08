import { NextResponse } from "next/server";

export async function GET() {
  // Check environment variables (without exposing sensitive values)
  const envCheck = {
    nodeEnv: process.env.NODE_ENV,
    hasRegion: !!process.env.BUNNY_REGION,
    regionValue: process.env.BUNNY_REGION || "not set",
    hasStorageZone: !!process.env.BUNNY_STORAGE_ZONE_NAME,
    storageZoneLength: process.env.BUNNY_STORAGE_ZONE_NAME?.length || 0,
    hasAccessKey: !!process.env.BUNNY_ACCESS_KEY,
    accessKeyLength: process.env.BUNNY_ACCESS_KEY?.length || 0,
    hasBunnyApiKey: !!process.env.BUNNY_API_KEY,
    bunnyApiKeyLength: process.env.BUNNY_API_KEY?.length || 0,
    hasPullZoneUrl: !!process.env.BUNNY_PULL_ZONE_URL,
    pullZoneUrl:
      process.env.BUNNY_PULL_ZONE_URL || "cdn.charpstar.net (default)",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(envCheck);
}
