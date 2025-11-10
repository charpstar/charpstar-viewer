import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

export const runtime = 'nodejs';

function getStorageZoneDetails() {
  const path = process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const parts = path.split('/').filter(Boolean);
  const zoneName = parts[0] || '';
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
}

function getHostname() {
  const REGION = process.env.BUNNY_REGION || '';
  const BASE_HOSTNAME = 'storage.bunnycdn.com';
  return REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
}

async function listDirectory(zone: string, dirPath: string): Promise<any[]> {
  const host = getHostname();
  const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
  const options: https.RequestOptions = {
    method: 'GET',
    host,
    path: `/${zone}/${dirPath.replace(/^\/+/, '')}`.replace(/\/+$/,'/') ,
    headers: { AccessKey: ACCESS_KEY },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve([]); }
        } else if (res.statusCode === 404) {
          resolve([]);
        } else {
          reject(new Error(`List failed ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    const modelName = searchParams.get('model');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50; // Default limit of 50 items
    
    if (!client || !modelName) {
      return NextResponse.json({ error: 'client and model are required' }, { status: 400 });
    }

    const { zoneName, basePath } = getStorageZoneDetails();
    const PULL = process.env.BUNNY_PULL_ZONE_URL || '';
    if (!zoneName || !process.env.BUNNY_ACCESS_KEY || !PULL) {
      return NextResponse.json({ error: 'Server not configured: BUNNY_* missing' }, { status: 500 });
    }

    // Directory layout: <basePath>/<client>/Renders/<modelName>/<variant>/<timestamp>/<view>_<resolution>_<background>.png
    const rootDir = `${basePath ? basePath.replace(/\/+$/,'') + '/' : ''}${client}/Renders/${encodeURIComponent(modelName)}/`;

    const variants = await listDirectory(zoneName, rootDir).catch(() => []);
    
    // Step 1: Collect all variant/timestamp pairs
    const variantTimestamps: Array<{ variant: string; timestamp: string }> = [];
    for (const v of variants || []) {
      if (!v || !v.IsDirectory) continue;
      const variant = v.ObjectName?.replace(/\/$/, '') || 'default';
      const tsList = await listDirectory(zoneName, rootDir + variant + '/').catch(() => []);
      for (const t of tsList || []) {
        if (!t || !t.IsDirectory) continue;
        const timestamp = t.ObjectName?.replace(/\/$/, '') || '';
        variantTimestamps.push({ variant, timestamp });
      }
    }
    
    // Step 2: Sort by timestamp DESC to get newest first
    variantTimestamps.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    
    // Step 3: Only fetch files from the most recent timestamp folders (limit traversal)
    // We need to fetch more than 'limit' timestamp folders because each folder has multiple images
    // Estimate: ~5 images per timestamp folder, so fetch ceil(limit / 3) folders to be safe
    const timestampsToFetch = Math.max(limit > 0 ? Math.ceil(limit / 3) : 100, 20);
    const recentTimestamps = variantTimestamps.slice(0, timestampsToFetch);
    
    const out: Array<{ url: string; variant: string; view?: string; resolution?: number; background?: string; timestamp?: string; filename: string; format?: string; }>= [];
    
    // Step 4: Fetch files only from recent timestamps
    for (const vt of recentTimestamps) {
      const files = await listDirectory(zoneName, rootDir + vt.variant + '/' + vt.timestamp + '/').catch(() => []);
      for (const f of files || []) {
        if (!f || f.IsDirectory) continue;
        const filename: string = f.ObjectName || '';
        
        // Parse view_res_bg.ext from filename
        let view: string | undefined; 
        let resolution: number | undefined; 
        let background: string | undefined;
        let format: string | undefined;
        
        // Extract extension
        const extMatch = filename.match(/\.(png|jpg|jpeg|webp)$/i);
        if (extMatch) format = extMatch[1].toLowerCase();
        
        const base = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const parts = base.split('_');
        if (parts.length >= 3) {
          view = parts[0];
          const resNum = parseInt(parts[1], 10); 
          if (!Number.isNaN(resNum)) resolution = resNum;
          background = parts.slice(2).join('_');
        }
        
        const storagePath = `${rootDir}${vt.variant}/${vt.timestamp}/${filename}`.replace(/\/+/, '/');
        const url = `https://${PULL}/${storagePath}`;
        out.push({ url, variant: vt.variant, view, resolution, background, timestamp: vt.timestamp, filename, format });
      }
      
      // Early exit if we have enough items
      if (limit > 0 && out.length >= limit * 2) break;
    }

    // Step 5: Final sort and limit
    out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    const limitedItems = limit > 0 ? out.slice(0, limit) : out;
    
    return NextResponse.json({ 
      items: limitedItems, 
      total: out.length, 
      limited: out.length > limitedItems.length,
      scannedTimestamps: recentTimestamps.length,
      totalTimestamps: variantTimestamps.length
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list history';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


