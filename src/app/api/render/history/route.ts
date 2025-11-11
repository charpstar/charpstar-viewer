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
    const limit = limitParam ? parseInt(limitParam, 10) : 200; // Default limit of 200 items (10 pages)
    
    if (!client || !modelName) {
      return NextResponse.json({ error: 'client and model are required' }, { status: 400 });
    }

    const { zoneName, basePath } = getStorageZoneDetails();
    const PULL = process.env.BUNNY_PULL_ZONE_URL || '';
    if (!zoneName || !process.env.BUNNY_ACCESS_KEY || !PULL) {
      return NextResponse.json({ error: 'Server not configured: BUNNY_* missing' }, { status: 500 });
    }

    // NEW FLAT STRUCTURE: <basePath>/<client>/Renders/<modelName>/<variant>/{view}_{resolution}_{background}_{timestamp}.{format}
    // Example: Client-Editor/Sweef/Renders/chair_model/default/back_1024_d9c6b3_20251110T180453.jpg
    const rootDir = `${basePath ? basePath.replace(/\/+$/,'') + '/' : ''}${client}/Renders/${encodeURIComponent(modelName)}/`;

    const variants = await listDirectory(zoneName, rootDir).catch(() => []);
    
    const out: Array<{ url: string; variant: string; view?: string; resolution?: number; background?: string; timestamp?: string; filename: string; format?: string; }>= [];
    
    // Fetch files directly from each variant folder (no nested timestamp folders)
    for (const v of variants || []) {
      if (!v || !v.IsDirectory) continue;
      const variant = v.ObjectName?.replace(/\/$/, '') || 'default';
      
      const files = await listDirectory(zoneName, rootDir + variant + '/').catch(() => []);
      for (const f of files || []) {
        if (!f || f.IsDirectory) continue;
        const filename: string = f.ObjectName || '';
        
        // Parse {view}_{resolution}_{background}_{timestamp}.{format} from filename
        // Example: back_1024_d9c6b3_20251110T180453.jpg
        let view: string | undefined; 
        let resolution: number | undefined; 
        let background: string | undefined;
        let timestamp: string | undefined;
        let format: string | undefined;
        
        // Extract extension
        const extMatch = filename.match(/\.(png|jpg|jpeg|webp)$/i);
        if (extMatch) format = extMatch[1].toLowerCase();
        
        const base = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        const parts = base.split('_');
        
        // Expected format: view_resolution_background_timestamp
        // Minimum 4 parts, but background and timestamp might contain underscores
        if (parts.length >= 4) {
          view = parts[0];
          const resNum = parseInt(parts[1], 10); 
          if (!Number.isNaN(resNum)) resolution = resNum;
          
          // Last part is timestamp (format: 20251110T180453)
          timestamp = parts[parts.length - 1];
          
          // Everything between resolution and timestamp is background
          background = parts.slice(2, parts.length - 1).join('_');
        }
        
        const storagePath = `${rootDir}${variant}/${filename}`;
        const url = `https://${PULL}/${storagePath}`;
        out.push({ url, variant, view, resolution, background, timestamp, filename, format });
      }
    }

    // Sort by timestamp DESC (newest first)
    out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    
    // Apply limit
    const limitedItems = limit > 0 ? out.slice(0, limit) : out;
    
    return NextResponse.json({ 
      items: limitedItems, 
      total: out.length, 
      limited: out.length > limitedItems.length
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list history';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


