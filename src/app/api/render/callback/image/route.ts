import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getClientConfig } from '@/config/clientConfig';

export const runtime = 'nodejs';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

async function uploadToBunny(filePath: string, buffer: Buffer): Promise<void> {
  const { zoneName } = getStorageZoneDetails();
  await new Promise<void>((resolve, reject) => {
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${zoneName}/${filePath}`,
      headers: {
        AccessKey: ACCESS_KEY,
        'Content-Type': 'image/png',
        'Content-Length': buffer.length,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-render-token') || request.headers.get('X-Render-Token');
    const expected = process.env.RENDER_CALLBACK_TOKEN;
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || undefined;
    const modelName = searchParams.get('modelName') || undefined;
    const variantName = searchParams.get('variantName') || undefined;
    const view = searchParams.get('view') || 'Default';
    const background = searchParams.get('background') || 'white';
    const resolution = searchParams.get('resolution') || '2048';

    if (!client || !modelName) {
      return NextResponse.json({ error: 'client and modelName are required' }, { status: 400 });
    }

    const arrayBuffer = await request.arrayBuffer();
    const imageBuffer = Buffer.from(new Uint8Array(arrayBuffer));

    const clientConfig = getClientConfig(client);
    const base = clientConfig.bunnyCdn.modelPath.replace(/\/$/, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const safeVariant = (variantName && variantName.length > 0) ? variantName : 'default';
    const filePath = `${base}/Renders/${encodeURIComponent(modelName)}/${encodeURIComponent(safeVariant)}/${stamp}/${view}_${resolution}_${background}.png`;

    await uploadToBunny(filePath, imageBuffer);

    const publicUrl = `https://${BUNNY_PULL_ZONE_URL}/${filePath}`;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to handle image callback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}



