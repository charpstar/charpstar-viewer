import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100; // Default limit 100
    
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
    
    // Apply smart limiting: prioritize active jobs
    const items = Array.isArray(json?.items) ? json.items : [];
    
    // Separate active from finished
    const activeJobs = items.filter((it: any) => 
      it.status !== 'completed' && it.status !== 'failed'
    );
    const finishedJobs = items.filter((it: any) => 
      it.status === 'completed' || it.status === 'failed'
    );
    
    // Sort active jobs by queue position (FIFO - lowest queue numbers first)
    // If no queue position, sort by creation time (oldest first)
    activeJobs.sort((a: any, b: any) => {
      const queueA = typeof a.queuePosition === 'number' ? a.queuePosition : 999999;
      const queueB = typeof b.queuePosition === 'number' ? b.queuePosition : 999999;
      if (queueA !== queueB) return queueA - queueB;
      // Fallback to creation time
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    
    // For active jobs: only send oldest 10 for progress tracking (FIFO)
    // The rest are just counted, not tracked
    const activeToTrack = activeJobs.slice(0, 10);
    const activeQueuedOnly = activeJobs.slice(10);
    
    // For finished: keep last 10
    const recentFinished = finishedJobs.slice(0, 10);
    
    // Combine: tracked active + recent finished
    const limitedItems = [...activeToTrack, ...recentFinished];
    
    return NextResponse.json({ 
      items: limitedItems,
      total: items.length,
      activeCount: activeJobs.length,
      trackedActiveCount: activeToTrack.length,
      queuedCount: activeQueuedOnly.length,
      finishedCount: finishedJobs.length,
      limited: items.length > limitedItems.length 
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


