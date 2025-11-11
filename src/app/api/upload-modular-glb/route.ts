import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for large uploads

interface UploadModularGLBBody {
  client: string;
  glbBase64: string; // Base64 encoded GLB blob
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UploadModularGLBBody;
    const { client, glbBase64 } = body || ({} as UploadModularGLBBody);
    
    if (!client || !glbBase64) {
      return NextResponse.json({ error: 'Missing client or glbBase64' }, { status: 400 });
    }

    // Get prep server config from server-side env (same as normal renders)
    const prepWorkerBase = process.env.RENDER_PREP_WORKER_URL;
    const prepWorkerToken = process.env.WORKER_API_TOKEN;
    
    if (!prepWorkerBase || !prepWorkerToken) {
      return NextResponse.json({ 
        error: 'Server not configured: missing RENDER_PREP_WORKER_URL or WORKER_API_TOKEN' 
      }, { status: 500 });
    }

    // Forward to prep server
    const uploadRes = await fetch(`${prepWorkerBase.replace(/\/$/, '')}/upload-modular-glb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${prepWorkerToken}`,
      },
      body: JSON.stringify({ client, glbBase64 }),
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text().catch(() => '');
      return NextResponse.json({ 
        error: `Prep server upload failed: ${uploadRes.status} - ${errorText}` 
      }, { status: uploadRes.status });
    }

    const uploadData = await uploadRes.json();
    return NextResponse.json(uploadData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to upload modular GLB';
    console.error('[UPLOAD-MODULAR] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

