import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Throttle repeated worker start attempts per jobId (in-memory, per instance)
const lastStartAttempt: Record<string, number> = {};

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

    // Treat only explicit 'queued' or 'preparing' as preparing stage
    if (prepStatus === 'queued' || prepStatus === 'preparing') {
      const combinedProgress = Math.max(0, Math.min(25, Math.round((prepProgress || 0) * 0.25)));
      return NextResponse.json({
        stage: 'preparing',
        status: prepStatus,
        progress: prepProgress,
        queuePosition: prepQueuePosition,
        combinedProgress
      });
    }

    if (prepStatus === 'failed') {
      return NextResponse.json({ stage: 'preparing', status: 'failed', progress: 100, error: prepJson?.error, combinedProgress: 100 });
    }

    // If prep reports 'running' or 'completed' and we have a stagingUrl, proceed to rendering stage
    if ((prepStatus === 'running' || prepStatus === 'completed') && stagingUrl) {
      // fall through to worker check below
    } else if (!stagingUrl) {
      const combinedProgress = Math.max(0, Math.min(25, Math.round((prepProgress || 0) * 0.25)));
      return NextResponse.json({
        stage: 'preparing',
        status: prepStatus,
        progress: prepProgress,
        queuePosition: prepQueuePosition,
        combinedProgress
      });
    }

    // 2) Prep completed -> check render status
    const renderStatusRes = await fetch(`${renderBase.replace(/\/$/, '')}/jobs/render/status?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${renderToken}` },
      cache: 'no-store',
    });

    if (renderStatusRes.status === 404) {
      // Not started -> attempt to start (idempotent), throttled
      const now = Date.now();
      if (!lastStartAttempt[jobId] || now - lastStartAttempt[jobId] > 10000) {
        lastStartAttempt[jobId] = now;
        const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
        const renderPayload = {
          jobId,
          glbUrl: stagingUrl,
          views: meta?.views || [meta?.view].filter(Boolean),
          background: meta?.background,
          resolution: meta?.resolution,
          format: meta?.format || 'png',
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
      }
      // fall through to report as rendering
      return NextResponse.json({ stage: 'rendering', status: 'pending', progress: 0, queuePosition: 0, combinedProgress: 25 });
    }

    const renderJson = await renderStatusRes.json().catch(() => ({} as any));
    if (!renderStatusRes.ok) {
      // When worker responds with transient error, retry starting (throttled) if we have stagingUrl
      if (stagingUrl) {
        const now = Date.now();
        if (!lastStartAttempt[jobId] || now - lastStartAttempt[jobId] > 10000) {
          lastStartAttempt[jobId] = now;
          const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
          const renderPayload = {
            jobId,
            glbUrl: stagingUrl,
            views: meta?.views || [meta?.view].filter(Boolean),
            background: meta?.background,
            resolution: meta?.resolution,
            format: meta?.format || 'png',
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
        }
      }
      return NextResponse.json({ stage: 'rendering', status: 'pending', progress: 0, queuePosition: 0, combinedProgress: 25 });
    }

    const rStatus = String(renderJson?.status || 'unknown');
    const rProgress = Number(renderJson?.progress || (rStatus === 'completed' ? 100 : 0));
    const rQueuePos = Number(renderJson?.queuePosition || 0);
    const imageUrl = typeof renderJson?.imageUrl === 'string' ? renderJson.imageUrl : undefined;
    const error = typeof renderJson?.error === 'string' ? renderJson.error : undefined;

    const combinedProgress = Math.max(25, Math.min(100, 25 + Math.round((rProgress || 0) * 0.75)));
    return NextResponse.json({ stage: 'rendering', status: rStatus, progress: rProgress, queuePosition: rQueuePos, imageUrl, error, combinedProgress });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get combined status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


