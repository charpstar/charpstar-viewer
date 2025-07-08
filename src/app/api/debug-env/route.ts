import { NextResponse } from "next/server";

export async function GET() {
  // Helper to get storage zone details like other APIs
  const getStorageZoneDetails = () => {
    const parts = (process.env.BUNNY_STORAGE_ZONE_NAME || "").split("/");
    const zoneName = parts[0];
    const basePath = parts.slice(1).join("/");
    return { zoneName, basePath };
  };

  const REGION = process.env.BUNNY_REGION || "";
  const BASE_HOSTNAME = "storage.bunnycdn.com";
  const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
  const { zoneName, basePath } = getStorageZoneDetails();

  // Check environment variables (without exposing sensitive values)
  const envCheck = {
    nodeEnv: process.env.NODE_ENV,
    hasRegion: !!process.env.BUNNY_REGION,
    regionValue: process.env.BUNNY_REGION || "not set",
    hasStorageZone: !!process.env.BUNNY_STORAGE_ZONE_NAME,
    storageZonePath: process.env.BUNNY_STORAGE_ZONE_NAME || "not set",
    storageZoneLength: process.env.BUNNY_STORAGE_ZONE_NAME?.length || 0,
    parsedZoneName: zoneName,
    parsedBasePath: basePath,
    constructedHostname: HOSTNAME,
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
