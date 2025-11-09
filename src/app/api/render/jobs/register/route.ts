import { NextRequest, NextResponse } from 'next/server';
import { registerJob, RenderJobMeta } from '../store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, client, modelName } = body || {};
    if (!jobId || !client || !modelName) {
      return NextResponse.json({ error: 'jobId, client, modelName required' }, { status: 400 });
    }
    const meta: RenderJobMeta = {
      jobId,
      client,
      modelName,
      variantName: (body?.variantName ?? null) as string | null,
      view: body?.view || null,
      background: body?.background,
      resolution: typeof body?.resolution === 'number' ? body.resolution : undefined,
      createdAt: body?.createdAt || new Date().toISOString(),
      status: 'pending',
    };
    registerJob(meta);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to register job';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


