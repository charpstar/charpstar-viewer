import { NextRequest, NextResponse, after } from 'next/server';
import { getClientConfig, isValidClient } from '@/config/clientConfig';
import { claimAutoPublish, isLivePublishConfigured, runClaimedPublish } from '@/lib/livePublish';

// Proxies a status request to the external Apply Service (Vultr worker)
// Env required:
// - WORKER_BASE_URL
// - WORKER_API_TOKEN
//
// Also acts as the server-side finalizer for clients with livePublish: the first
// caller to observe a job as completed with no failures claims the job and the
// editor folder is mirrored to the live folder in the background (after the
// response is sent), so publishing does not depend on a browser tab staying
// open. The marker written by the claim makes this run exactly once per job.
// Pass ?client=<name> to enable this (the worker's status payload has no client).

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const client = searchParams.get('client');
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

    // Server-side auto-publish: completed + clean + client has a live folder.
    const failed = Number(data?.failed) || 0;
    if (
      data?.status === 'completed' &&
      failed === 0 &&
      client &&
      isValidClient(client) &&
      getClientConfig(client).livePublish &&
      isLivePublishConfigured()
    ) {
      try {
        const claim = await claimAutoPublish(client, jobId);
        if (claim.state === 'claimed') {
          after(async () => {
            const r = await runClaimedPublish(client, jobId);
            console.log(`[apply/status] auto-publish ${client} job ${jobId}: ${r.state}`);
          });
          data.autoPublish = 'publishing';
        } else if (claim.state !== 'skipped') {
          data.autoPublish = claim.state;
        }
      } catch (e) {
        console.error('[apply/status] auto-publish claim failed:', e);
      }
    }

    // Pass through fields used by UI: { total, done, failed, processedFiles, status, autoPublish? }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
