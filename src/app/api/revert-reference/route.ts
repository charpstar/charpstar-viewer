import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getClientConfig } from '@/config/clientConfig';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  return { zoneName };
};

const purgeCache = async (fileUrl: string): Promise<void> => {
  try {
    await fetch('https://api.bunny.net/purge?async=false', {
      method: 'POST',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: [fileUrl] })
    });
  } catch {}
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client: string | undefined = body?.client;
    const backup: string | undefined = body?.backup; // filename under reference/backup/
    if (!client || !backup) return NextResponse.json({ error: 'client and backup are required' }, { status: 400 });

    // basic sanitize backup name
    if (backup.includes('/') || backup.includes('..')) {
      return NextResponse.json({ error: 'invalid backup name' }, { status: 400 });
    }

    const clientConfig = getClientConfig(client);
    const backupUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/reference/backup/${backup}`;

    // Fetch backup content
    const resp = await fetch(backupUrl);
    if (!resp.ok) return NextResponse.json({ error: `Failed to fetch backup: ${resp.status}` }, { status: resp.status });
    const content = await resp.text();

    // Upload to reference/reference.gltf
    const { zoneName } = getStorageZoneDetails();
    const destPath = `${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;
    await new Promise<void>((resolve, reject) => {
      const buffer = Buffer.from(content);
      const options = {
        method: 'PUT',
        host: HOSTNAME,
        path: `/${zoneName}/${destPath}`,
        headers: {
          AccessKey: ACCESS_KEY,
          'Content-Type': 'model/gltf+json',
          'Content-Length': buffer.length,
        },
      } as const;
      const req = https.request(options, (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed: ${res.statusCode}`));
      });
      req.on('error', reject);
      req.write(buffer);
      req.end();
    });

    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${destPath}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('revert-reference error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to revert reference' }, { status: 500 });
  }
}


