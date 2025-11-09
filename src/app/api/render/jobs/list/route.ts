import { NextRequest, NextResponse } from 'next/server';
import { listJobs, upsertStatus } from '../store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 });

    // hydrate statuses via combined-status
    const origin = new URL(request.url).origin;
    const jobs = listJobs(client);
    const enriched = await Promise.all(jobs.map(async (j) => {
      try {
        const res = await fetch(`${origin}/api/render/combined-status?jobId=${encodeURIComponent(j.jobId)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({} as any));
        if (res.ok) {
          upsertStatus(client, j.jobId, {
            status: json?.status,
            progress: json?.progress,
            queuePosition: json?.queuePosition,
            imageUrl: json?.imageUrl,
            stage: json?.stage,
          });
          return { ...j, ...json };
        }
      } catch {}
      return j;
    }));

    return NextResponse.json({ items: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list jobs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


