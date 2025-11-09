import { NextRequest, NextResponse } from 'next/server';
import { deleteJob } from '../../render/jobs/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobId = body?.jobId as string;
    const client = body?.client as string | undefined;
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }
    const baseUrl = process.env.RENDER_WORKER_BASE_URL;
    const token = process.env.RENDER_WORKER_API_TOKEN;
    if (!baseUrl || !token) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/jobs/render/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // If worker says invalid/not-found, try cancelling prep job and always remove from registry
      if (res.status === 400 || res.status === 404) {
        try {
          const prepBase = process.env.RENDER_PREP_WORKER_URL;
          const prepToken = process.env.WORKER_API_TOKEN;
          if (prepBase && prepToken) {
            const prepRes = await fetch(`${prepBase.replace(/\/$/, '')}/jobs/render/prepare/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prepToken}` },
              body: JSON.stringify({ jobId })
            });
            await prepRes.json().catch(() => ({}));
          }
        } catch {}
        if (client) {
          try { deleteJob(client, jobId); } catch {}
        }
        return NextResponse.json({ success: true, cancelled: 'not-found-removed' });
      }
      // Other worker errors
      if (client) {
        try { deleteJob(client, jobId); } catch {}
      }
      return NextResponse.json({ error: data?.error || 'Failed to cancel job' }, { status: res.status });
    }
    if (client) {
      try { deleteJob(client, jobId); } catch {}
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to cancel job' }, { status: 500 });
  }
}



