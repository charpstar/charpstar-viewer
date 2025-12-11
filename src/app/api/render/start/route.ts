import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface StartBody {
  client: string;
  modelFilename: string;
  modelName: string;
  variantName?: string | null;
  views: Array<{ name: string; orbit?: string }>;
  background: string; // 'transparent' or hex color (without #)
  resolution: number;
  aspectRatio?: 'square' | 'rectangle'; // 'square' or 'rectangle' (16:9)
  format?: 'png' | 'jpg' | 'webp';
  isModularUpload?: boolean; // Flag for pre-uploaded modular GLB
  tempGLBPath?: string; // Path to pre-uploaded GLB on BunnyCDN
  environment?: 'studio' | 'neutral' | 'neutral2';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartBody;
    const { client, modelFilename, modelName, variantName, views, background, resolution, aspectRatio, format, isModularUpload, tempGLBPath, environment } = body || ({} as StartBody);
    if (!client || !modelFilename || !modelName || !views || !Array.isArray(views) || views.length === 0 || !background || !resolution) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prepWorkerBase = process.env.RENDER_PREP_WORKER_URL;
    const prepWorkerToken = process.env.WORKER_API_TOKEN;
    const callbackToken = process.env.RENDER_CALLBACK_TOKEN;
    
    if (!prepWorkerBase || !prepWorkerToken) {
      return NextResponse.json({ error: 'Server not configured: missing RENDER_PREP_WORKER_URL or WORKER_API_TOKEN' }, { status: 500 });
    }
    if (!callbackToken) {
      return NextResponse.json({ error: 'Server not configured: missing RENDER_CALLBACK_TOKEN' }, { status: 500 });
    }

    // Enqueue prep job and return jobId immediately (render will auto-start via combined-status)
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
        modelName,
        views,
        background,
        resolution,
        aspectRatio: aspectRatio || 'square',
        format: format || 'png',
        isModularUpload: isModularUpload || false,
        tempGLBPath: tempGLBPath || null,
        environment: environment || 'studio',
      }),
    });
    const prepJson = await prepRes.json().catch(() => ({}));
    if (!prepRes.ok) {
      return NextResponse.json({ error: prepJson?.error || 'Failed to enqueue prep' }, { status: prepRes.status });
    }

    const { jobId } = prepJson as { jobId: string };
    if (!jobId) {
      return NextResponse.json({ error: 'Prep worker returned invalid response' }, { status: 500 });
    }

    // Register job in server-side registry
    try {
      await fetch(`${new URL(request.url).origin}/api/render/jobs/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          client,
          modelName,
          variantName: variantName || null,
          views,
          background,
          resolution,
          aspectRatio: aspectRatio || 'square',
          format: format || 'png',
          createdAt: new Date().toISOString(),
          environment: environment || 'studio',
        })
      }).catch(() => null);
    } catch {}
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start render';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
