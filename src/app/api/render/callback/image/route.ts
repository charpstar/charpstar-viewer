import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-render-token') || request.headers.get('X-Render-Token');
    const expected = process.env.RENDER_CALLBACK_TOKEN;
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RunPod now uploads directly to BunnyCDN and just sends us the URL
    const body = await request.json();
    const { imageUrl, client, modelName, variantName, view, background, resolution } = body || {};

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    if (!client || !modelName) {
      return NextResponse.json({ error: 'client and modelName are required' }, { status: 400 });
    }

    console.log(`[CALLBACK] Render complete: ${modelName} (${variantName || 'default'}) -> ${imageUrl}`);

    return NextResponse.json({ success: true, url: imageUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to handle image callback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}



