import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    const model = searchParams.get('model');
    const variant = searchParams.get('variant');
    if (!client || !model) return NextResponse.json({ error: 'client and model required' }, { status: 400 });

    const prepBase = process.env.RENDER_PREP_WORKER_URL;
    const prepToken = process.env.WORKER_API_TOKEN;
    if (!prepBase || !prepToken) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const res = await fetch(`${prepBase.replace(/\/$/, '')}/jobs/render/blocked?client=${encodeURIComponent(client)}&model=${encodeURIComponent(model)}&variant=${encodeURIComponent(variant || '')}`, {
      headers: { Authorization: `Bearer ${prepToken}` },
      cache: 'no-store'
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || 'Failed to get block status' }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get block status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


