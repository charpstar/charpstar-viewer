import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-render-token') || request.headers.get('X-Render-Token');
    const expected = process.env.RENDER_CALLBACK_TOKEN;
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RunPod uploads directly to BunnyCDN and sends us image data
    const body = await request.json();
    const { images, imageUrl, client, modelName, variantName, view, background, resolution, format } = body || {};

    // Support both NEW multi-image format and OLD single-image format (backward compatible)
    let imageArray: Array<{ url: string; view?: string; format?: string }> = [];
    
    if (images && Array.isArray(images) && images.length > 0) {
      // New format: images array
      imageArray = images;
    } else if (imageUrl && typeof imageUrl === 'string') {
      // Old format: single imageUrl (backward compatibility)
      imageArray = [{
        url: imageUrl,
        view: view?.name || view || 'unknown',
        format: format || 'png'
      }];
    } else {
      return NextResponse.json({ error: 'images array or imageUrl is required' }, { status: 400 });
    }

    if (!client || !modelName) {
      return NextResponse.json({ error: 'client and modelName are required' }, { status: 400 });
    }

    const imageCount = imageArray.length;
    const views = imageArray.map((img: any) => img.view || 'unknown').join(', ');
    console.log(`[CALLBACK] Render complete: ${modelName} (${variantName || 'default'}) -> ${imageCount} image(s) [${views}]`);

    return NextResponse.json({ 
      success: true, 
      images: imageArray,
      count: imageCount,
      // Also return old format for backward compatibility
      url: imageArray[0]?.url
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to handle image callback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}



