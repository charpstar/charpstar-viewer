import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import crypto from 'crypto';
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

const uploadToBunny = async (
  filePath: string,
  content: string,
  contentType: string = 'application/json'
): Promise<void> => {
  const { zoneName } = getStorageZoneDetails();
  const buffer = Buffer.from(content);
  return new Promise((resolve, reject) => {
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${zoneName}/${filePath}`,
      headers: {
        AccessKey: ACCESS_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
      },
    } as const;
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
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

const fetchFromStorageOrigin = async (storagePath: string): Promise<string | null> => {
  const { zoneName } = getStorageZoneDetails();
  const url = `https://${HOSTNAME}/${zoneName}/${storagePath}`;
  try {
    const res = await fetch(url, { headers: { AccessKey: ACCESS_KEY } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};

const getGeolocation = async (request: NextRequest): Promise<{ city: string; country: string }> => {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '';
    const isLocal = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
    const geoUrl = isLocal
      ? 'http://ip-api.com/json/?fields=city,country'
      : `http://ip-api.com/json/${ip}?fields=city,country`;
    const geo = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
    if (geo.ok) {
      const data = await geo.json();
      return {
        city: (data.city || '').replace(/[^A-Za-z0-9 -]/g, '').trim(),
        country: (data.country || '').replace(/[^A-Za-z0-9 -]/g, '').trim(),
      };
    }
  } catch {}
  return { city: '', country: '' };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client: string | undefined = body?.client;
    const backup: string | undefined = body?.backup;
    if (!client || !backup) return NextResponse.json({ error: 'client and backup are required' }, { status: 400 });

    if (backup.includes('/') || backup.includes('..')) {
      return NextResponse.json({ error: 'invalid backup name' }, { status: 400 });
    }

    const clientConfig = getClientConfig(client);
    const backupDir = clientConfig.bunnyCdn.backupsPath.replace(/\/$/, '');
    const destPath = `${clientConfig.bunnyCdn.referencePath}`;

    // 1. Auto-backup: snapshot the current live reference before overwriting
    try {
      const currentContent = await fetchFromStorageOrigin(destPath);
      if (currentContent) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const { city, country } = await getGeolocation(request);
        let locationTag = '';
        if (city || country) {
          locationTag = `_loc_${(city || 'Unknown').replace(/\s+/g, '-')}_${(country || 'Unknown').replace(/\s+/g, '-')}`;
        }
        const baseName = `reference-${ts}${locationTag}`;
        await uploadToBunny(`${backupDir}/${baseName}.gltf`, currentContent, 'model/gltf+json');

        // Parse the target backup filename to extract a human-readable date for the restore note
        let restoringToLabel = backup.replace(/\.gltf$/i, '');
        try {
          const tsMatch = backup.match(/reference-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
          if (tsMatch) {
            const d = new Date(`${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]}T${tsMatch[4]}:${tsMatch[5]}:00Z`);
            if (!isNaN(d.getTime())) {
              restoringToLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
          }
        } catch {}

        const meta = {
          timestamp: new Date().toISOString(),
          city: city || null,
          country: country || null,
          changes: [{ material: '_system', fields: [`Auto-saved before restoring to ${restoringToLabel} version`] }],
        };
        await uploadToBunny(`${backupDir}/${baseName}.meta.json`, JSON.stringify(meta), 'application/json');
      }
    } catch (e) {
      console.warn('Auto-backup before restore failed (proceeding with restore):', e);
    }

    // 2. Fetch the selected backup content
    const backupUrl = `https://${BUNNY_PULL_ZONE_URL}/${backupDir}/${backup}`;
    const resp = await fetch(backupUrl);
    if (!resp.ok) return NextResponse.json({ error: `Failed to fetch backup: ${resp.status}` }, { status: resp.status });
    const content = await resp.text();

    // 3. Overwrite reference.gltf with the backup
    await uploadToBunny(destPath, content, 'model/gltf+json');
    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${destPath}`);

    // 4. Update editor checksum so the restore isn't flagged as an external change
    try {
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const checksumPath = destPath.replace(/\/[^/]+$/, '/_editor_checksum.json');
      await uploadToBunny(checksumPath, JSON.stringify({ hash, timestamp: new Date().toISOString() }), 'application/json');
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('revert-reference error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to revert reference' }, { status: 500 });
  }
}


