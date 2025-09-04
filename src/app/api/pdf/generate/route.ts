import { NextRequest, NextResponse } from 'next/server';

// Proxies PDF generation to the external worker (Vultr)
// Env required:
// - WORKER_BASE_URL (e.g. http://45.32.156.145:8080)
// - WORKER_API_TOKEN (Bearer token)

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null as any);
    const client = payload?.client as string | undefined;
    if (!client) {
      return NextResponse.json({ error: 'client is required' }, { status: 400 });
    }

    const baseUrl = process.env.WORKER_BASE_URL;
    const token = process.env.WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured: WORKER_BASE_URL/WORKER_API_TOKEN missing' }, { status: 500 });
    }

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/pdf/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to generate PDF' }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate PDF';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}




