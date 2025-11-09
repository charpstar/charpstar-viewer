import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 });

    const prepBase = process.env.RENDER_PREP_WORKER_URL;
    const prepToken = process.env.WORKER_API_TOKEN;
    if (!prepBase || !prepToken) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const res = await fetch(`${prepBase.replace(/\/$/, '')}/jobs/render/queue?client=${encodeURIComponent(client)}`, {
      headers: { Authorization: `Bearer ${prepToken}` },
      cache: 'no-store'
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || 'Failed to get queue' }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


