import { NextRequest, NextResponse } from 'next/server';

// Proxies cancel to the external worker
// Env: WORKER_BASE_URL, WORKER_API_TOKEN

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }
    const baseUrl = process.env.WORKER_BASE_URL;
    const token = process.env.WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/jobs/apply/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Failed to cancel job' }, { status: res.status });
    }
    return NextResponse.json({ success: true, logUrl: typeof data?.logUrl === 'string' ? data.logUrl : undefined });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to cancel job' }, { status: 500 });
  }
}


