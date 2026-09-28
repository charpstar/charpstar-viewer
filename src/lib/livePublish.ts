import { getClientConfig } from '@/config/clientConfig';

// Server-side "publish to live" for clients whose public site reads a different
// CDN folder than the editor writes to (see clientConfig.livePublish).
//
// promoteToLive(client) mirrors the baked models (.gltf/.glb) + the textures they
// reference from bunnyCdn.modelPath -> livePublish.modelPath and purges the pull
// zone. It is idempotent: re-copying identical bytes and re-purging is harmless.
//
// ensureJobPublished(client, jobId) wraps that in a one-time-per-apply-job guard
// backed by a small marker object on the CDN, so the publish happens exactly once
// per job no matter how many callers observe the job's completion (the status
// route finalizer, the browser's active poll loop, a re-opened tab, ...).
//
// Env required (same names as the other Bunny routes):
// - BUNNY_REGION (e.g. "se")
// - BUNNY_STORAGE_ZONE_NAME (zone name, e.g. "maincdn")
// - BUNNY_ACCESS_KEY (storage password)
// - BUNNY_API_KEY (account key, for cache purge)
// - BUNNY_PULL_ZONE_URL (e.g. "cdn.charpstar.net")

const REGION = process.env.BUNNY_REGION || '';
const HOSTNAME = REGION ? `${REGION}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
const ZONE = (process.env.BUNNY_STORAGE_ZONE_NAME || '').split('/')[0];
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const PULL = (process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net').replace(/^https?:\/\//, '');

// A "started" marker older than this is treated as abandoned (the run that
// claimed it died) and the job is published again.
const STALE_CLAIM_MS = 3 * 60 * 1000;

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const storageUrl = (p: string) => `https://${HOSTNAME}/${ZONE}/${enc(p)}`;

export const isLivePublishConfigured = () => !!(ZONE && ACCESS_KEY);

export class LivePublishError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export type PromoteResult = {
  published: boolean;
  client: string;
  from: string;
  to: string;
  copiedModels: number;
  copiedImages: number;
  failedModels: string[];
  missingAtSource: string[];
  purged: number;
  purgeFailed: number;
  purgeStatuses: Record<string, number>;
};

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

// Bunny's single-URL purge takes the URL in the query string (not the body).
// Returns the HTTP status (0 on network error) so callers can surface failures;
// purging is best-effort and never throws.
export async function purge(url: string): Promise<number> {
  try {
    const r = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
      method: 'POST',
      headers: { AccessKey: BUNNY_API_KEY, accept: 'application/json' },
    });
    return r.status;
  } catch {
    return 0;
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

// Mirror editor -> live for one client. Throws LivePublishError when the client
// has no livePublish, the env is missing, or the editor folder has no models.
export async function promoteToLive(client: string): Promise<PromoteResult> {
  if (!isLivePublishConfigured()) {
    throw new LivePublishError('Server not configured: Bunny storage env missing', 500);
  }
  const cfg = getClientConfig(client);
  const live = cfg.livePublish;
  if (!live) {
    throw new LivePublishError('no livePublish configured', 400);
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
    throw new LivePublishError('No models found in editor folder to publish', 404);
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
  //    Existing files are mirrored with their own content-type; nothing is
  //    converted or re-encoded here.
  const srcImgList = await listDir(srcImages);
  const dstImgList = await listDir(dstImages);
  const srcSize = new Map(srcImgList.map((o) => [o.ObjectName.split('/').pop() as string, o.Length]));
  const dstSize = new Map(dstImgList.map((o) => [o.ObjectName.split('/').pop() as string, o.Length]));

  let copiedImages = 0;
  const copiedImageNames: string[] = [];
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
    if (st === 200 || st === 201) { copiedImages++; copiedImageNames.push(img); }
  }

  // 3) Purge the live models (and any texture we replaced) on the pull zone so
  //    the new versions serve now. Best-effort, but every status is reported.
  const purgeTargets = [
    ...models.map((m) => `${dstModels}/${m.ObjectName.split('/').pop() as string}`),
    ...copiedImageNames.map((img) => `${dstImages}/${img}`),
  ];
  const purgeStatuses: Record<string, number> = {};
  await Promise.all(
    purgeTargets.map(async (p) => {
      purgeStatuses[p] = await purge(`https://${PULL}/${enc(p)}`);
    })
  );
  const purged = Object.values(purgeStatuses).filter((s) => s >= 200 && s < 300).length;
  const purgeFailed = purgeTargets.length - purged;

  return {
    published: failedModels.length === 0,
    client,
    from: srcModels,
    to: dstModels,
    copiedModels,
    copiedImages,
    failedModels,
    missingAtSource,
    purged,
    purgeFailed,
    purgeStatuses,
  };
}

// ---------------------------------------------------------------------------
// One-time-per-job guard
// ---------------------------------------------------------------------------

export type AutoPublishMarker = {
  jobId: string;
  client: string;
  state: 'started' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  result?: PromoteResult;
  error?: string;
};

export type EnsureResult =
  | { state: 'published'; alreadyPublished: boolean; result?: PromoteResult }
  | { state: 'publishing'; marker: AutoPublishMarker }
  | { state: 'failed'; error: string; result?: PromoteResult }
  | { state: 'skipped'; reason: string };

const safeJobId = (jobId: string) => jobId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

function markerPath(client: string, jobId: string): string | null {
  const live = getClientConfig(client).livePublish;
  if (!live) return null;
  return `${live.modelPath}/_autopublish/${safeJobId(jobId)}.json`;
}

export async function readAutoPublishMarker(client: string, jobId: string): Promise<AutoPublishMarker | null> {
  const p = markerPath(client, jobId);
  if (!p) return null;
  const buf = await getObj(p);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as AutoPublishMarker;
  } catch {
    return null;
  }
}

async function writeAutoPublishMarker(client: string, marker: AutoPublishMarker): Promise<boolean> {
  const p = markerPath(client, marker.jobId);
  if (!p) return false;
  const st = await putObj(p, Buffer.from(JSON.stringify(marker), 'utf8'), 'application/json');
  return st === 200 || st === 201;
}

const isFreshClaim = (m: AutoPublishMarker) =>
  m.state === 'started' && Date.now() - Date.parse(m.startedAt) < STALE_CLAIM_MS;

// Same-instance dedupe: concurrent callers in one process share a single run.
const inflight = new Map<string, Promise<EnsureResult>>();

// Claim the job (write a "started" marker) without running the publish. Used by
// the status route so the claim exists before the browser even sees the job as
// completed; the run itself then happens in the background. Returns
// 'claimed' when this caller now owns the run.
export async function claimAutoPublish(
  client: string,
  jobId: string
): Promise<{ state: 'published' | 'publishing' | 'claimed' | 'skipped' }> {
  if (!isLivePublishConfigured() || !getClientConfig(client).livePublish) return { state: 'skipped' };
  const existing = await readAutoPublishMarker(client, jobId);
  if (existing?.state === 'done') return { state: 'published' };
  if (existing && isFreshClaim(existing)) return { state: 'publishing' };
  const ok = await writeAutoPublishMarker(client, {
    jobId,
    client,
    state: 'started',
    startedAt: new Date().toISOString(),
  });
  return { state: ok ? 'claimed' : 'skipped' };
}

// Run the publish for a job this caller has already claimed, and record the outcome.
export async function runClaimedPublish(client: string, jobId: string): Promise<EnsureResult> {
  const startedAt = new Date().toISOString();
  try {
    const result = await promoteToLive(client);
    await writeAutoPublishMarker(client, {
      jobId,
      client,
      state: result.published ? 'done' : 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      result,
      ...(result.published ? {} : { error: `Failed models: ${result.failedModels.join(', ')}` }),
    });
    return result.published
      ? { state: 'published', alreadyPublished: false, result }
      : { state: 'failed', error: `Failed models: ${result.failedModels.join(', ')}`, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Publish to live failed';
    await writeAutoPublishMarker(client, {
      jobId,
      client,
      state: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      error,
    }).catch(() => false);
    return { state: 'failed', error };
  }
}

// Publish exactly once for the given apply job.
// - already published: returns immediately with alreadyPublished=true
// - another caller is mid-publish: waits up to waitForInflightMs for it to
//   finish (0 = do not wait, report 'publishing'); if it never finishes, runs
//   the publish itself (safe, the copy is idempotent)
// - otherwise: claims the job, publishes, records the outcome
export async function ensureJobPublished(
  client: string,
  jobId: string,
  opts: { waitForInflightMs?: number } = {}
): Promise<EnsureResult> {
  const key = `${client}:${jobId}`;
  const existingRun = inflight.get(key);
  if (existingRun) return existingRun;

  const run = (async (): Promise<EnsureResult> => {
    if (!isLivePublishConfigured()) return { state: 'skipped', reason: 'Bunny storage env missing' };
    if (!getClientConfig(client).livePublish) return { state: 'skipped', reason: 'no livePublish configured' };

    const waitMs = opts.waitForInflightMs ?? 0;
    const deadline = Date.now() + waitMs;
    let marker = await readAutoPublishMarker(client, jobId);
    while (marker && isFreshClaim(marker)) {
      if (Date.now() >= deadline) {
        if (waitMs === 0) return { state: 'publishing', marker };
        break; // waited long enough; fall through and publish ourselves
      }
      await new Promise((r) => setTimeout(r, 2000));
      marker = await readAutoPublishMarker(client, jobId);
    }
    if (marker?.state === 'done') return { state: 'published', alreadyPublished: true, result: marker.result };

    const claim = await claimAutoPublish(client, jobId);
    if (claim.state === 'published') {
      const m = await readAutoPublishMarker(client, jobId);
      return { state: 'published', alreadyPublished: true, result: m?.result };
    }
    // 'publishing' here means someone claimed between our read and our claim;
    // the copy is idempotent so running anyway is safe and guarantees delivery.
    return runClaimedPublish(client, jobId);
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}
