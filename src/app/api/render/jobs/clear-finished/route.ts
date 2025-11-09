import { NextRequest, NextResponse } from 'next/server';
import { removeFinished } from '../store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const client = body?.client || new URL(request.url).searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 });
    removeFinished(String(client));
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to clear jobs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


