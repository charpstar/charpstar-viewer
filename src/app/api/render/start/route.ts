import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';

export const runtime = 'nodejs';

interface StartBody {
  client: string;
  modelFilename: string;
  modelName: string;
  variantName?: string | null;
  view: { name: string };
  background: 'white' | 'transparent' | 'studio';
  resolution: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartBody;
    const { client, modelFilename, modelName, variantName, view, background, resolution } = body || ({} as StartBody);
    if (!client || !modelFilename || !modelName || !view?.name || !background || !resolution) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prepWorkerBase = process.env.RENDER_PREP_WORKER_URL;
    const prepWorkerToken = process.env.WORKER_API_TOKEN;
    const renderWorkerBase = process.env.RENDER_WORKER_BASE_URL;
    const renderWorkerToken = process.env.RENDER_WORKER_API_TOKEN;
    const callbackToken = process.env.RENDER_CALLBACK_TOKEN;
    
    if (!prepWorkerBase || !prepWorkerToken) {
      return NextResponse.json({ error: 'Server not configured: missing RENDER_PREP_WORKER_URL or WORKER_API_TOKEN' }, { status: 500 });
    }
    if (!renderWorkerBase || !renderWorkerToken || !callbackToken) {
      return NextResponse.json({ error: 'Server not configured: missing RENDER_* envs' }, { status: 500 });
    }

    // Step 1: Call prep worker to convert GLTF to GLB and stage it
    const prepRes = await fetch(`${prepWorkerBase.replace(/\/$/, '')}/jobs/render/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${prepWorkerToken}`,
      },
      body: JSON.stringify({
        client,
        modelFilename,
        variantName: variantName || null,
      }),
    });
    const prepJson = await prepRes.json().catch(() => ({}));
    if (!prepRes.ok) {
      return NextResponse.json({ error: prepJson?.error || 'Failed to prepare GLB' }, { status: prepRes.status });
    }

    const { jobId, stagingUrl } = prepJson as { jobId: string; stagingUrl: string };
    if (!jobId || !stagingUrl) {
      return NextResponse.json({ error: 'Prep worker returned invalid response' }, { status: 500 });
    }

    // Step 2: Call render worker with the staged GLB
    const clientConfig = getClientConfig(client);
    const publicBase = process.env.RENDER_PUBLIC_BASE_URL;
    const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
    
    // Derive hdr file name from client config (basename of hdrPath)
    let hdrFile: string | null = null;
    try {
      const u = new URL(clientConfig.hdrPath);
      hdrFile = u.pathname.split('/').pop() || null;
    } catch {}

    const renderPayload = {
      jobId,
      glbUrl: stagingUrl,
      view,
      background,
      resolution,
      callbackUrl,
      callbackToken,
      client,
      modelName,
      variantName: variantName || null,
      hdrFile,
    };

    const renderRes = await fetch(`${renderWorkerBase.replace(/\/$/, '')}/jobs/render/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${renderWorkerToken}`,
      },
      body: JSON.stringify(renderPayload),
    });
    const renderJson = await renderRes.json().catch(() => ({}));
    if (!renderRes.ok) {
      return NextResponse.json({ error: renderJson?.error || 'Failed to start render worker' }, { status: renderRes.status });
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start render';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
