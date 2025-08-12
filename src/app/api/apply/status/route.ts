import { NextRequest, NextResponse } from 'next/server';

// Proxies a status request to the external Apply Service (Vultr worker)
// Env required:
// - WORKER_BASE_URL
// - WORKER_API_TOKEN

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const baseUrl = process.env.WORKER_BASE_URL;
    const token = process.env.WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured: WORKER_BASE_URL/WORKER_API_TOKEN missing' }, { status: 500 });
    }

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/jobs/apply/status?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to get status' }, { status: res.status });
    }
    // Pass through fields used by UI: { total, done, failed, processedFiles, status }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


