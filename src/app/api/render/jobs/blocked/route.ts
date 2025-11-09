import { NextRequest, NextResponse } from 'next/server';
import { isBlocked } from '../store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    const model = searchParams.get('model');
    const variant = searchParams.get('variant');
    if (!client || !model) return NextResponse.json({ error: 'client and model required' }, { status: 400 });
    const blocked = isBlocked(client, model, variant);
    return NextResponse.json({ blocked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to get block status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


