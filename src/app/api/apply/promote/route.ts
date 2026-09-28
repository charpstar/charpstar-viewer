import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';
import {
  ensureJobPublished,
  isLivePublishConfigured,
  LivePublishError,
  promoteToLive,
} from '@/lib/livePublish';

// Mirrors the baked models + textures from the editor folder (bunnyCdn.modelPath)
// into the client's live folder (livePublish.modelPath), which is the folder the
// public site actually reads. Called by the browser after a successful Apply to
// Live as a fallback for the server-side finalizer in /api/apply/status (which
// publishes even if the tab was closed). No-op for clients that have no
// livePublish configured. The copy/purge logic lives in src/lib/livePublish.ts.
//
// Body: { client, jobId? }
// - with jobId: publish exactly once for that apply job (waits for an in-flight
//   server-side publish of the same job instead of starting a second one)
// - without jobId: unconditional publish of the editor folder

export const runtime = 'nodejs';
export const maxDuration = 60;

// How long to wait for an in-flight publish of the same job before taking over.
const WAIT_FOR_INFLIGHT_MS = 45_000;

export async function POST(request: NextRequest) {
  try {
    if (!isLivePublishConfigured()) {
      return NextResponse.json({ error: 'Server not configured: Bunny storage env missing' }, { status: 500 });
    }

    const { client, jobId } = await request.json();
    if (!client || typeof client !== 'string') {
      return NextResponse.json({ error: 'client is required' }, { status: 400 });
    }

    if (!getClientConfig(client).livePublish) {
      // Nothing to do for clients whose editor folder is already the live folder.
      return NextResponse.json({ published: false, skipped: true, reason: 'no livePublish configured' });
    }

    if (jobId && typeof jobId === 'string') {
      const r = await ensureJobPublished(client, jobId, { waitForInflightMs: WAIT_FOR_INFLIGHT_MS });
      if (r.state === 'published') {
        return NextResponse.json({ published: true, client, jobId, alreadyPublished: r.alreadyPublished, ...(r.result || {}) });
      }
      if (r.state === 'failed') {
        return NextResponse.json({ published: false, client, jobId, error: r.error, ...(r.result || {}) }, { status: 500 });
      }
      if (r.state === 'skipped') {
        return NextResponse.json({ published: false, skipped: true, client, jobId, reason: r.reason });
      }
      // 'publishing' cannot happen with a non-zero wait, but keep the response shape sane.
      return NextResponse.json({ published: false, client, jobId, publishing: true }, { status: 202 });
    }

    const result = await promoteToLive(client);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LivePublishError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : 'Publish to live failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
