import { NextRequest, NextResponse } from 'next/server';

// Proxies a start request to the external Apply Service (Vultr worker)
// Env required:
// - WORKER_BASE_URL (e.g. http://45.32.156.145:8080)
// - WORKER_API_TOKEN (Bearer token)

export async function POST(request: NextRequest) {
  try {
    const { client, targets } = await request.json();
    if (!client || typeof client !== 'string') {
      return NextResponse.json({ error: 'client is required' }, { status: 400 });
    }

    const baseUrl = process.env.WORKER_BASE_URL;
    const token = process.env.WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured: WORKER_BASE_URL/WORKER_API_TOKEN missing' }, { status: 500 });
    }

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/jobs/apply/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ client, ...(Array.isArray(targets) ? { targets } : {}) }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to start job' }, { status: res.status });
    }
    // Expect { jobId, total }
    return NextResponse.json({ jobId: data?.jobId, total: data?.total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start job';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


