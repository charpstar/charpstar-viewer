import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? parseInt(limitParam, 10) : 100; // Default limit of 100 items (5 pages)
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0; // Pagination offset
    
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

    const startTime = Date.now();
    const variants = await listDirectory(zoneName, rootDir).catch(() => []);
    console.log(`[History API] Step 1: Listed ${variants?.length || 0} variants in ${Date.now() - startTime}ms`);
    
    // Step 1: Collect all variant/timestamp pairs
    const step1Time = Date.now();
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
    console.log(`[History API] Step 2: Collected ${variantTimestamps.length} timestamps in ${Date.now() - step1Time}ms`);
    
    // Step 2: Sort by timestamp DESC to get newest first
    variantTimestamps.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    
    // Step 3: Calculate how many timestamp folders to fetch
    // Each folder has ~5 images on average
    // We need to fetch enough to cover offset + limit
    const totalItemsNeeded = offset + limit;
    const avgImagesPerFolder = 5;
    const timestampsToFetch = Math.max(
      Math.ceil(totalItemsNeeded / avgImagesPerFolder) + 5, // +5 buffer
      20 // Minimum 20 folders
    );
    const recentTimestamps = variantTimestamps.slice(0, Math.min(timestampsToFetch, variantTimestamps.length));
    
    console.log(`[History API] Fetching from ${recentTimestamps.length} of ${variantTimestamps.length} timestamp folders (offset: ${offset}, limit: ${limit})`);
    
    const out: Array<{ url: string; variant: string; view?: string; resolution?: number; background?: string; timestamp?: string; filename: string; format?: string; }>= [];
    
    // Step 4: Fetch files from recent timestamps IN PARALLEL for speed
    const fetchPromises = recentTimestamps.map(async (vt) => {
      const files = await listDirectory(zoneName, rootDir + vt.variant + '/' + vt.timestamp + '/').catch(() => []);
      const results: typeof out = [];
      
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
        results.push({ url, variant: vt.variant, view, resolution, background, timestamp: vt.timestamp, filename, format });
      }
      
      return results;
    });
    
    // Wait for all fetches to complete in parallel
    const fetchStartTime = Date.now();
    const allResults = await Promise.all(fetchPromises);
    console.log(`[History API] Step 3: Fetched ${fetchPromises.length} folders in parallel in ${Date.now() - fetchStartTime}ms`);
    
    // Flatten all results
    for (const results of allResults) {
      out.push(...results);
    }

    // Step 5: Final sort, then apply offset and limit
    out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    
    const paginatedItems = out.slice(offset, offset + limit);
    const hasMore = offset + limit < out.length;
    const moreAvailable = variantTimestamps.length > recentTimestamps.length;
    
    const totalTime = Date.now() - startTime;
    console.log(`[History API] Total: ${paginatedItems.length} items returned (${out.length} scanned, offset: ${offset}) in ${totalTime}ms`);
    
    return NextResponse.json({ 
      items: paginatedItems,
      total: out.length, // Total items scanned so far
      hasMore: hasMore || moreAvailable, // Can load more
      scannedTimestamps: recentTimestamps.length,
      totalTimestamps: variantTimestamps.length,
      performanceMs: totalTime,
      offset,
      limit
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list history';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


