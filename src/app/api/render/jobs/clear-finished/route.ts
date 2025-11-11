import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const client = body?.client || new URL(request.url).searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 });
    const prepBase = process.env.RENDER_PREP_WORKER_URL;
    const prepToken = process.env.WORKER_API_TOKEN;
    if (!prepBase || !prepToken) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const res = await fetch(`${prepBase.replace(/\/$/, '')}/jobs/render/clear-finished`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prepToken}` },
      body: JSON.stringify({ client })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || 'Failed to clear finished' }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to clear jobs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


