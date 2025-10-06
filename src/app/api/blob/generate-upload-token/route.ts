import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as any;
    const pathnameRaw = body?.pathname as string | undefined;
    const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/octet-stream';
    const contentLength = Number(body?.contentLength);
    const addRandomSuffix = Boolean(body?.addRandomSuffix ?? true);
    const maxSize = typeof body?.maxSize === 'number' && body.maxSize > 0 ? body.maxSize : undefined;

    if (!pathnameRaw || !/^[A-Za-z0-9_\-./]+$/.test(pathnameRaw)) {
      return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 });
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return NextResponse.json({ error: 'Invalid contentLength' }, { status: 400 });
    }

    const pathname = pathnameRaw.replace(/^\/+/, '');

    const token = generateClientTokenFromReadWriteToken({
      pathname,
      contentType,
      contentLength,
      addRandomSuffix,
      // 15 minutes expiry window
      expiresAt: Date.now() + 15 * 60 * 1000,
      ...(maxSize ? { maxSize } : {}),
    });

    const uploadUrl = `https://blob.vercel-storage.com/${pathname}`;
    return NextResponse.json({ token, uploadUrl, pathname });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate upload token' }, { status: 500 });
  }
}


