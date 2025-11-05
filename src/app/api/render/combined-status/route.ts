import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

    const prepBase = process.env.RENDER_PREP_WORKER_URL;
    const prepToken = process.env.WORKER_API_TOKEN;
    const renderBase = process.env.RENDER_WORKER_BASE_URL;
    const renderToken = process.env.RENDER_WORKER_API_TOKEN;
    const callbackToken = process.env.RENDER_CALLBACK_TOKEN;
    const publicBase = process.env.RENDER_PUBLIC_BASE_URL;
    if (!prepBase || !prepToken || !renderBase || !renderToken || !callbackToken) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // 1) Query prep status
    const prepRes = await fetch(`${prepBase.replace(/\/$/, '')}/jobs/render/prepare/status?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${prepToken}` },
      cache: 'no-store',
    });
    const prepJson = await prepRes.json().catch(() => ({} as any));
    if (!prepRes.ok) {
      return NextResponse.json({ error: prepJson?.error || 'Failed to get prep status' }, { status: prepRes.status });
    }

    const prepStatus = String(prepJson?.status || 'unknown');
    const prepProgress = Number(prepJson?.progress || 0);
    const prepQueuePosition = Number(prepJson?.queuePosition || 0);
    const stagingUrl = typeof prepJson?.stagingUrl === 'string' ? prepJson.stagingUrl : null;
    const meta = prepJson?.meta || {};

    if (prepStatus === 'queued' || prepStatus === 'running') {
      return NextResponse.json({ stage: 'preparing', status: prepStatus, progress: prepProgress, queuePosition: prepQueuePosition });
    }

    if (prepStatus === 'failed') {
      return NextResponse.json({ stage: 'preparing', status: 'failed', progress: 100, error: prepJson?.error });
    }

    if (prepStatus !== 'completed' || !stagingUrl) {
      return NextResponse.json({ stage: 'preparing', status: 'unknown', progress: prepProgress });
    }

    // 2) Prep completed -> check render status
    const renderStatusRes = await fetch(`${renderBase.replace(/\/$/, '')}/jobs/render/status?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${renderToken}` },
      cache: 'no-store',
    });

    if (renderStatusRes.status === 404) {
      // Not started -> attempt to start (idempotent)
      const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
      const renderPayload = {
        jobId,
        glbUrl: stagingUrl,
        view: meta?.view,
        background: meta?.background,
        resolution: meta?.resolution,
        callbackUrl,
        callbackToken,
        client: meta?.client,
        modelName: meta?.modelName,
        variantName: meta?.variantName || null,
      };
      await fetch(`${renderBase.replace(/\/$/, '')}/jobs/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renderToken}` },
        body: JSON.stringify(renderPayload),
      }).catch(() => null);
      // fall through to report as rendering
      return NextResponse.json({ stage: 'rendering', status: 'pending', progress: 0, queuePosition: 0 });
    }

    const renderJson = await renderStatusRes.json().catch(() => ({} as any));
    if (!renderStatusRes.ok) {
      return NextResponse.json({ error: renderJson?.error || 'Failed to get render status' }, { status: renderStatusRes.status });
    }

    const rStatus = String(renderJson?.status || 'unknown');
    const rProgress = Number(renderJson?.progress || (rStatus === 'completed' ? 100 : 0));
    const rQueuePos = Number(renderJson?.queuePosition || 0);
    const imageUrl = typeof renderJson?.imageUrl === 'string' ? renderJson.imageUrl : undefined;

    return NextResponse.json({ stage: 'rendering', status: rStatus, progress: rProgress, queuePosition: rQueuePos, imageUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get combined status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


