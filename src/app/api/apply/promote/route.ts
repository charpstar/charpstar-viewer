import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';

// Mirrors the baked models + textures from the editor folder (bunnyCdn.modelPath)
// into the client's live folder (livePublish.modelPath), which is the folder the
// public site actually reads. Called automatically after a successful Apply to
// Live so the editor keeps its working copy AND the change goes live, with no
// manual copy step. No-op for clients that have no livePublish configured.
//
// Env required (same as the other Bunny routes):
// - BUNNY_REGION (e.g. "se")
// - BUNNY_STORAGE_ZONE_NAME (zone name, e.g. "maincdn")
// - BUNNY_ACCESS_KEY (storage password)
// - BUNNY_API_KEY (account key, for cache purge)
// - BUNNY_PULL_ZONE_URL (e.g. "cdn.charpstar.net")

export const runtime = 'nodejs';
export const maxDuration = 60;

const REGION = process.env.BUNNY_REGION || '';
const HOSTNAME = REGION ? `${REGION}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
const ZONE = (process.env.BUNNY_STORAGE_ZONE_NAME || '').split('/')[0];
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const PULL = (process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net').replace(/^https?:\/\//, '');

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const storageUrl = (p: string) => `https://${HOSTNAME}/${ZONE}/${enc(p)}`;

type BunnyEntry = { ObjectName: string; Length: number; IsDirectory: boolean };

async function listDir(dir: string): Promise<BunnyEntry[]> {
  const r = await fetch(`https://${HOSTNAME}/${ZONE}/${dir.replace(/\/$/, '')}/`, {
    headers: { AccessKey: ACCESS_KEY },
    cache: 'no-store',
  });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as BunnyEntry[];
}

async function getObj(p: string): Promise<Buffer | null> {
  const r = await fetch(storageUrl(p), { headers: { AccessKey: ACCESS_KEY }, cache: 'no-store' });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function putObj(p: string, body: Buffer, contentType: string): Promise<number> {
  const r = await fetch(storageUrl(p), {
    method: 'PUT',
    headers: { AccessKey: ACCESS_KEY, 'Content-Type': contentType },
    body: body as unknown as BodyInit,
  });
  return r.status;
}

async function purge(url: string): Promise<void> {
  try {
    await fetch('https://api.bunny.net/purge?async=false', {
      method: 'POST',
      headers: { AccessKey: BUNNY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
    });
  } catch {
    /* purge is best-effort */
  }
}

// Collect the relative texture files a gltf references (skips embedded data: URIs).
function referencedImages(gltfBuf: Buffer): string[] {
  try {
    const doc = JSON.parse(gltfBuf.toString('utf8'));
    const out: string[] = [];
    for (const img of doc.images || []) {
      if (typeof img.uri === 'string' && !img.uri.startsWith('data:')) {
        out.push(img.uri.replace(/^\.\//, '').split('/').pop() as string);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!ZONE || !ACCESS_KEY) {
      return NextResponse.json({ error: 'Server not configured: Bunny storage env missing' }, { status: 500 });
    }

    const { client } = await request.json();
    if (!client || typeof client !== 'string') {
      return NextResponse.json({ error: 'client is required' }, { status: 400 });
    }

    const cfg = getClientConfig(client);
    const live = cfg.livePublish;
    if (!live) {
      // Nothing to do for clients whose editor folder is already the live folder.
      return NextResponse.json({ published: false, skipped: true, reason: 'no livePublish configured' });
    }

    const srcModels = cfg.bunnyCdn.modelPath;
    const srcImages = cfg.bunnyCdn.imagesPath;
    const dstModels = live.modelPath;
    const dstImages = live.imagesPath;

    // 1) Copy every baked model (.gltf/.glb) from editor -> live, gathering the
    //    textures they reference along the way.
    const srcList = await listDir(srcModels);
    const models = srcList.filter(
      (o) => !o.IsDirectory && /\.(gltf|glb)$/i.test(o.ObjectName)
    );
    if (models.length === 0) {
      return NextResponse.json({ error: 'No models found in editor folder to publish' }, { status: 404 });
    }

    const referenced = new Set<string>();
    let copiedModels = 0;
    const failedModels: string[] = [];
    for (const m of models) {
      const name = m.ObjectName.split('/').pop() as string;
      const buf = await getObj(`${srcModels}/${name}`);
      if (!buf) { failedModels.push(name); continue; }
      if (name.toLowerCase().endsWith('.gltf')) {
        for (const img of referencedImages(buf)) referenced.add(img);
      }
      const ct = name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : 'model/gltf+json';
      const st = await putObj(`${dstModels}/${name}`, buf, ct);
      if (st === 200 || st === 201) copiedModels++;
      else failedModels.push(name);
    }

    // 2) Sync referenced textures: copy any that are missing on live or whose
    //    size differs (a replaced texture). Unchanged textures are left alone.
    const srcImgList = await listDir(srcImages);
    const dstImgList = await listDir(dstImages);
    const srcSize = new Map(srcImgList.map((o) => [o.ObjectName.split('/').pop() as string, o.Length]));
    const dstSize = new Map(dstImgList.map((o) => [o.ObjectName.split('/').pop() as string, o.Length]));

    let copiedImages = 0;
    const missingAtSource: string[] = [];
    for (const img of referenced) {
      const inSrc = srcSize.has(img);
      const changed = !dstSize.has(img) || dstSize.get(img) !== srcSize.get(img);
      if (!changed) continue;
      if (!inSrc) { missingAtSource.push(img); continue; }
      const buf = await getObj(`${srcImages}/${img}`);
      if (!buf) { missingAtSource.push(img); continue; }
      const ext = (img.split('.').pop() || '').toLowerCase();
      const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const st = await putObj(`${dstImages}/${img}`, buf, ct);
      if (st === 200 || st === 201) copiedImages++;
    }

    // 3) Purge the live models on the pull zone so the new versions serve now.
    await Promise.all(
      models.map((m) => {
        const name = m.ObjectName.split('/').pop() as string;
        return purge(`https://${PULL}/${enc(`${dstModels}/${name}`)}`);
      })
    );

    return NextResponse.json({
      published: failedModels.length === 0,
      client,
      from: srcModels,
      to: dstModels,
      copiedModels,
      copiedImages,
      failedModels,
      missingAtSource,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Publish to live failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
