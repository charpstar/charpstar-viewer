import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for large uploads

interface UploadTempGLBBody {
  client: string;
  glbBase64: string; // Base64 encoded GLB blob
}

export async function POST(request: NextRequest) {
  try {
    console.log('[UPLOAD-TEMP] Receiving upload request...');
    const body = await request.json() as UploadTempGLBBody;
    const { client, glbBase64 } = body || ({} as UploadTempGLBBody);
    
    console.log('[UPLOAD-TEMP] Client:', client);
    console.log('[UPLOAD-TEMP] Base64 length received:', glbBase64?.length || 0);
    
    if (!client || !glbBase64) {
      console.error('[UPLOAD-TEMP] Missing client or glbBase64');
      return NextResponse.json({ error: 'Missing client or glbBase64' }, { status: 400 });
    }

    // Bunny CDN configuration (match prep server pattern)
    const region = process.env.BUNNY_REGION || 'se';
    const baseHostname = 'storage.bunnycdn.com';
    const hostname = region ? `${region}.${baseHostname}` : baseHostname;
    const zone = (process.env.BUNNY_STORAGE_ZONE_NAME || 'maincdn').replace(/\/+$/, ''); // Remove trailing slashes
    const accessKey = process.env.BUNNY_ACCESS_KEY;
    const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

    if (!accessKey) {
      return NextResponse.json({ error: 'Server not configured: missing BUNNY_ACCESS_KEY' }, { status: 500 });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 10);
    const filename = `modular-${timestamp}-${randomId}.glb`;
    
    // Storage path for BunnyCDN upload (zone includes Client-Editor, so just client path)
    const storagePath = `${client}/Renders/_temp/${filename}`;
    
    // Temp path for prep server (needs full path including Client-Editor prefix)
    const tempPath = `Client-Editor/${storagePath}`;
    
    // Decode base64 to buffer
    const glbBuffer = Buffer.from(glbBase64, 'base64');
    
    if (glbBuffer.length === 0) {
      console.error('[UPLOAD-TEMP] Decoded GLB buffer is empty!');
      return NextResponse.json({ error: 'Decoded GLB is empty' }, { status: 400 });
    }
    
    console.log(`[UPLOAD-TEMP] Decoded ${glbBuffer.length} bytes from base64`);
    console.log(`[UPLOAD-TEMP] Uploading to ${storagePath}`);

    // Upload to BunnyCDN
    const uploadUrl = `https://${hostname}/${zone}/${storagePath}`;
    console.log(`[UPLOAD-TEMP] Full upload URL: ${uploadUrl}`);
    console.log(`[UPLOAD-TEMP] Using access key: ${accessKey?.substring(0, 10)}...`);
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': accessKey,
        'Content-Type': 'model/gltf-binary',
        'Content-Length': glbBuffer.length.toString(),
      },
      body: glbBuffer,
    });

    console.log(`[UPLOAD-TEMP] BunnyCDN response status: ${uploadResponse.status}`);
    const responseText = await uploadResponse.text().catch(() => '');
    console.log(`[UPLOAD-TEMP] BunnyCDN response body: ${responseText}`);

    if (!uploadResponse.ok) {
      console.error(`[UPLOAD-TEMP] Upload failed: ${uploadResponse.status} ${responseText}`);
      return NextResponse.json({ 
        error: `Upload failed: ${uploadResponse.status} - ${responseText}` 
      }, { status: uploadResponse.status });
    }

    // Public URL - pull zone URL doesn't include the storage zone name, just the path
    // The zone already contains Client-Editor, and storagePath starts with client name
    // So we need: https://cdn.charpstar.net/Client-Editor/Sweef/Renders/_temp/...
    const publicUrl = `https://${pullZoneUrl}/Client-Editor/${storagePath}`;
    
    console.log(`[UPLOAD-TEMP] Upload successful to BunnyCDN: ${publicUrl}`);
    console.log(`[UPLOAD-TEMP] Uploaded ${glbBuffer.length} bytes`);
    
    // Verify upload by checking file size (wait longer for CDN propagation)
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const verifyResponse = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
      const contentLength = verifyResponse.headers.get('content-length');
      console.log(`[UPLOAD-TEMP] Verification: CDN reports ${contentLength} bytes (expected ${glbBuffer.length})`);
      console.log(`[UPLOAD-TEMP] Verification status: ${verifyResponse.status}`);
      
      if (contentLength === '0' || !contentLength) {
        console.warn(`[UPLOAD-TEMP] WARNING: CDN file size not yet available (propagation delay expected)`);
      }
    } catch (verifyError) {
      console.error(`[UPLOAD-TEMP] Could not verify upload:`, verifyError);
    }

    return NextResponse.json({ 
      success: true,
      filename,
      tempPath: tempPath, // Return full path with Client-Editor prefix for prep server
      url: publicUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to upload temp GLB';
    console.error('[UPLOAD-TEMP] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

