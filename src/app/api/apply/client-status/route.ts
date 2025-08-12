import { NextRequest, NextResponse } from 'next/server';

// Proxies a per-client status request to the external Apply Service (Vultr worker)
// Env required:
// - WORKER_BASE_URL
// - WORKER_API_TOKEN

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 });

    const baseUrl = process.env.WORKER_BASE_URL;
    const token = process.env.WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured: WORKER_BASE_URL/WORKER_API_TOKEN missing' }, { status: 500 });
    }

    const url = `${baseUrl.replace(/\/$/, '')}/jobs/apply/client-status?client=${encodeURIComponent(client)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data?.error || 'Failed to get client status' }, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to get client status' }, { status: 500 });
  }
}


