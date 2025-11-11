import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Returns BunnyCDN upload configuration for client-side direct uploads.
 * This avoids sending large GLB files through Vercel's API routes (4.5MB limit).
 */
export async function GET(request: NextRequest) {
  try {
    const region = process.env.BUNNY_REGION || 'se';
    const baseHostname = 'storage.bunnycdn.com';
    const hostname = region ? `${region}.${baseHostname}` : baseHostname;
    const zone = (process.env.BUNNY_STORAGE_ZONE_NAME || 'maincdn').replace(/\/+$/, '');
    const accessKey = process.env.BUNNY_ACCESS_KEY;
    const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

    if (!accessKey) {
      return NextResponse.json({ error: 'Server not configured: missing BUNNY_ACCESS_KEY' }, { status: 500 });
    }

    return NextResponse.json({
      hostname,
      zone,
      accessKey,
      pullZoneUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get upload config';
    console.error('[BUNNY-CONFIG] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

