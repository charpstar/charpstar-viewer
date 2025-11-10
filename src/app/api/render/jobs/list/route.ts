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
    
    // Apply limit to prevent sending too many items
    const items = Array.isArray(json?.items) ? json.items : [];
    const limitedItems = limit > 0 ? items.slice(0, limit) : items;
    
    return NextResponse.json({ 
      items: limitedItems, 
      total: items.length, 
      limited: items.length > limitedItems.length 
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get queue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


