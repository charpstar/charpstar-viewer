export type RenderJobMeta = {
  jobId: string;
  client: string;
  modelName: string;
  variantName: string | null;
  view?: { name: string } | null;
  views?: Array<{ name: string }>;
  background?: string;
  resolution?: number;
  format?: string;
  createdAt: string; // ISO
  // Cached status fields (optional, updated by list endpoint)
  status?: 'queued' | 'running' | 'pending' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  queuePosition?: number;
  imageUrl?: string;
  imageUrls?: string[];
  images?: Array<{ url: string; view: string; format: string }>;
  stage?: 'preparing' | 'rendering';
};

type Registry = {
  byClient: Record<string, Record<string, RenderJobMeta>>; // client -> jobId -> meta
};

const globalKey = '__charpstar_render_registry__';

function getRegistry(): Registry {
  const g = globalThis as any;
  if (!g[globalKey]) {
    g[globalKey] = { byClient: {} } as Registry;
  }
  return g[globalKey] as Registry;
}

export function registerJob(meta: RenderJobMeta) {
  const reg = getRegistry();
  const bucket = (reg.byClient[meta.client] ||= {});
  bucket[meta.jobId] = { ...bucket[meta.jobId], ...meta };
}

export function listJobs(client: string): RenderJobMeta[] {
  const reg = getRegistry();
  const bucket = reg.byClient[client] || {};
  return Object.values(bucket).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function removeFinished(client: string) {
  const reg = getRegistry();
  const bucket = reg.byClient[client] || {};
  for (const [jobId, meta] of Object.entries(bucket)) {
    const s = String(meta.status || 'unknown');
    if (s === 'completed' || s === 'failed') delete bucket[jobId];
  }
}

export function upsertStatus(client: string, jobId: string, status: Partial<RenderJobMeta>) {
  const reg = getRegistry();
  const bucket = (reg.byClient[client] ||= {});
  const cur = bucket[jobId];
  if (!cur) return;
  bucket[jobId] = { ...cur, ...status };
}

export function isBlocked(client: string, modelName: string, variantName: string | null): boolean {
  const reg = getRegistry();
  const bucket = reg.byClient[client] || {};
  for (const meta of Object.values(bucket)) {
    if (meta.modelName === modelName && (meta.variantName || null) === (variantName || null)) {
      const s = String(meta.status || 'pending');
      if (s !== 'completed' && s !== 'failed') return true;
    }
  }
  return false;
}

export function deleteJob(client: string, jobId: string) {
  const reg = getRegistry();
  const bucket = reg.byClient[client] || {};
  if (bucket[jobId]) delete bucket[jobId];
}


