import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as any;

    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname: string) => {
        // Allow GLTF/GLB and JSON uploads; add a random suffix to avoid collisions
        return {
          addRandomSuffix: true,
          allowedContentTypes: [
            'model/gltf+json',
            'application/json',
            'model/gltf-binary',
            'application/octet-stream',
          ],
          // Optionally set a server-side maximum (bytes). Omit to use Blob defaults.
        } as any;
      },
      onUploadCompleted: async ({ blob }) => {
        // No-op; client will pass blob.url to server routes
        try { console.log('Blob uploaded:', blob?.pathname || blob?.url); } catch {}
      },
    });

    // Return the response the client `upload()` expects
    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to handle upload' }, { status: 500 });
  }
}


