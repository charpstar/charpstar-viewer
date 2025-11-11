'use strict';

const https = require('https');
const express = require('express');
const path = require('path');
const fs = require('fs');
// Load .env if present; hard-coded fallbacks below ensure the server runs even if env is not loaded
try { require('dotenv').config(); } catch {}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  next(err);
});

/* Env/config */
const PORT = process.env.RENDER_PREP_PORT || 8081;
const JOB_API_TOKEN = process.env.JOB_API_TOKEN || 'charpstar2024charpstar2024';

// Bunny / Storage (fallbacks filled with your provided values)
const REGION = process.env.BUNNY_REGION || 'se';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const ZONE = process.env.BUNNY_STORAGE_ZONE_NAME || 'maincdn';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || 'd9d2d9f3-8f91-46ea-98afd3a6f0ee-d8a4-4255';
const PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT || 'Client-Editor';
const CLIENTS_ALLOWLIST = (process.env.CLIENTS_ALLOWLIST || 'Sweef,NordicNest,Artwood').split(',').map(s => s.trim()).filter(Boolean);

// Render worker orchestration (start render immediately when prep completes)
// Render worker / callback (fallbacks filled with your provided values)
const RENDER_WORKER_BASE_URL = process.env.RENDER_WORKER_BASE_URL || 'https://5vxrdjp4pb2eh3-8000.proxy.runpod.net';
const RENDER_WORKER_API_TOKEN = process.env.RENDER_WORKER_API_TOKEN || 'charpstar2024charpstar2024';
const RENDER_CALLBACK_TOKEN = process.env.RENDER_CALLBACK_TOKEN || 'charpstar2024charpstar2024';
const RENDER_PUBLIC_BASE_URL = process.env.RENDER_PUBLIC_BASE_URL || 'https://charpstar-viewer-git-render-arjun-sudhakarans-projects.vercel.app';

// Redis (Upstash) – TCP URL used by the node Redis client
const REDIS_URL =
  process.env.REDIS_URL ||
  'rediss://default:AUdbAAIncDJmY2Y5OWU5NGIxNzc0ZWEzOGIwYTQxMDYwNDliMTNiZXAyMTgyNjc@huge-cub-18267.upstash.io:6379';

// Multi-worker pool (RunPod) – read from env JSON if present, else fallback to single worker above
const RENDER_WORKERS = (() => {
  try {
    const fromEnv = process.env.RENDER_WORKERS;
    if (fromEnv) return JSON.parse(fromEnv);
  } catch {}
  return [
    { url: RENDER_WORKER_BASE_URL, token: RENDER_WORKER_API_TOKEN },
  ];
})();

// ---------------------------
// Memory management constants
// ---------------------------
const MAX_COMPLETED_JOBS_PER_CLIENT = 50; // Keep last 50 completed jobs per client
const JOB_CLEANUP_INTERVAL_MS = 60000; // Clean up every 60 seconds
const JOB_TTL_MS = 3600000; // Remove completed jobs after 1 hour

// ---------------------------
// Redis client and queue keys
// ---------------------------
let Redis;
try {
  Redis = require('ioredis');
} catch {
  try {
    const { createClient } = require('redis');
    Redis = function(url) {
      const client = createClient({ url });
      client.connect().catch(() => {});
      client.on = client.on.bind(client);
      client.quit = client.quit?.bind(client);
      client.rpush = async (k, v) => client.sendCommand(['RPUSH', k, v]);
      client.lpop = async (k) => client.sendCommand(['LPOP', k]);
      client.lpush = async (k, v) => client.sendCommand(['LPUSH', k, v]);
      client.lrange = async (k, s, e) => client.sendCommand(['LRANGE', k, String(s), String(e)]);
      client.lpos = async (k, v) => client.sendCommand(['LPOS', k, v]);
      client.lrem = async (k, count, v) => client.sendCommand(['LREM', k, String(count), v]);
      client.set = async (k, v) => client.sendCommand(['SET', k, v]);
      client.get = async (k) => client.sendCommand(['GET', k]);
      client.hset = async (k, ...args) => client.sendCommand(['HSET', k, ...args]);
      client.hgetall = async (k) => client.sendCommand(['HGETALL', k]);
      client.del = async (...keys) => client.sendCommand(['DEL', ...keys]);
      return client;
    };
  } catch {}
}

const redis = Redis ? new Redis(REDIS_URL) : null;
const QUEUE_KEY = 'rp:queue:v1';
const JOB_KEY = (id) => `rp:job:${id}`;

/* In-memory job store with TTL tracking */
const JOBS = new Map(); // jobId -> { status, progress, queuePosition, stagingUrl, error, meta, key, workerIndex?, completedAt?, createdAt }
const KEY_TO_JOBID = new Map(); // dedupe key -> jobId

// ---------------------------
// Reusable gltf-transform resources (CRITICAL OPTIMIZATION)
// ---------------------------
let sharedReadIO = null;
let sharedWriteIO = null;
let sharedDecoderModule = null;
let ioInitPromise = null;

async function getSharedIO() {
  if (sharedReadIO && sharedWriteIO) {
    return { readIO: sharedReadIO, writeIO: sharedWriteIO };
  }
  
  // Ensure only one initialization happens
  if (!ioInitPromise) {
    ioInitPromise = (async () => {
      try {
        const { NodeIO } = require('@gltf-transform/core');
        const {
          KHRMaterialsVariants,
          KHRDracoMeshCompression,
          KHRTextureBasisu,
          KHRTextureTransform,
          KHRMaterialsSheen
        } = require('@gltf-transform/extensions');
        const draco3d = require('draco3dgltf');
        
        // Initialize decoder module ONCE
        if (!sharedDecoderModule && draco3d?.createDecoderModule) {
          const locateFile = f => {
            const p1 = path.join(__dirname, 'node_modules', 'draco3dgltf', f);
            if (fs.existsSync(p1)) return p1;
            const p2 = path.join(path.dirname(require.resolve('draco3dgltf/package.json')), f);
            if (fs.existsSync(p2)) return p2;
            return f;
          };
          sharedDecoderModule = await draco3d.createDecoderModule({ locateFile });
          console.log('[PREP] Shared Draco decoder module initialized');
        }
        
        // Create shared IO instances
        sharedReadIO = new NodeIO()
          .registerExtensions([KHRMaterialsVariants, KHRDracoMeshCompression, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen])
          .registerDependencies(sharedDecoderModule ? { 'draco3d.decoder': sharedDecoderModule } : {});
        
        sharedWriteIO = new NodeIO()
          .registerExtensions([KHRMaterialsVariants, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen]);
        
        console.log('[PREP] Shared NodeIO instances initialized');
      } catch (e) {
        console.error('[PREP] Failed to initialize shared IO:', e);
        throw e;
      }
    })();
  }
  
  await ioInitPromise;
  return { readIO: sharedReadIO, writeIO: sharedWriteIO };
}

// ---------------------------
// Periodic cleanup of old jobs
// ---------------------------
function startCleanupInterval() {
  setInterval(() => {
    try {
      cleanupOldJobs();
    } catch (e) {
      console.error('[PREP] Cleanup error:', e);
    }
  }, JOB_CLEANUP_INTERVAL_MS);
  
  console.log(`[PREP] Cleanup interval started (every ${JOB_CLEANUP_INTERVAL_MS}ms)`);
}

function cleanupOldJobs() {
  const now = Date.now();
  let removedCount = 0;
  const clientJobs = new Map(); // client -> array of completed jobs
  
  // Group completed jobs by client
  for (const [jobId, job] of JOBS.entries()) {
    const status = job.status;
    const client = job.meta?.client;
    
    if (!client) continue;
    
    // Remove jobs older than TTL
    if ((status === 'completed' || status === 'failed') && job.completedAt) {
      const age = now - job.completedAt;
      if (age > JOB_TTL_MS) {
        JOBS.delete(jobId);
        if (job.key) KEY_TO_JOBID.delete(job.key);
        removedCount++;
        
        // Clean up Redis
        if (redis) {
          redis.del(JOB_KEY(jobId)).catch(() => {});
        }
        continue;
      }
    }
    
    // Track completed jobs per client for limit enforcement
    if (status === 'completed' || status === 'failed') {
      if (!clientJobs.has(client)) clientJobs.set(client, []);
      clientJobs.get(client).push({ jobId, completedAt: job.completedAt || 0 });
    }
  }
  
  // Enforce per-client limits
  for (const [client, jobs] of clientJobs.entries()) {
    if (jobs.length > MAX_COMPLETED_JOBS_PER_CLIENT) {
      // Sort by completion time (oldest first)
      jobs.sort((a, b) => a.completedAt - b.completedAt);
      
      // Remove oldest jobs beyond limit
      const toRemove = jobs.slice(0, jobs.length - MAX_COMPLETED_JOBS_PER_CLIENT);
      for (const { jobId } of toRemove) {
        const job = JOBS.get(jobId);
        JOBS.delete(jobId);
        if (job?.key) KEY_TO_JOBID.delete(job.key);
        removedCount++;
        
        if (redis) {
          redis.del(JOB_KEY(jobId)).catch(() => {});
        }
      }
    }
  }
  
  if (removedCount > 0) {
    console.log(`[PREP] Cleanup: removed ${removedCount} old jobs. Current size: ${JOBS.size}`);
  }
  
  // Log memory usage
  const memUsage = process.memoryUsage();
  console.log(`[PREP] Memory: RSS=${(memUsage.rss / 1024 / 1024).toFixed(0)}MB, Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB, Jobs=${JOBS.size}`);
}

function jobKey(meta) {
  const { client, modelFilename, variantName, resolution, views, view, format } = meta || {};
  const viewsArray = Array.isArray(views) ? views : (view ? [view] : []);
  const viewNames = viewsArray.map(v => (v && typeof v.name === 'string' ? v.name : '')).sort().join(',');
  const fmt = format || 'png';
  return `${client}::${modelFilename}::${variantName || ''}::${resolution || ''}::${viewNames}::${fmt}`;
}

function enqueueJob(meta) {
  const key = jobKey(meta);
  const existingId = KEY_TO_JOBID.get(key);
  if (existingId) {
    const existing = JOBS.get(existingId);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      return { jobId: existingId, alreadyRunning: true, position: existing.queuePosition || 0 };
    }
  }
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job = { 
    status: 'queued', 
    progress: 0, 
    queuePosition: 0, 
    stagingUrl: null, 
    error: null, 
    meta, 
    key,
    createdAt: Date.now() // Track creation time
  };
  JOBS.set(jobId, job);
  KEY_TO_JOBID.set(key, jobId);
  
  if (redis) {
    try {
      redis.rpush(QUEUE_KEY, JSON.stringify({ jobId, meta }));
      redis.hset(JOB_KEY(jobId), 'status', 'queued', 'client', meta.client || '');
    } catch (e) {
      console.error('[PREP] Redis enqueue failed, falling back in-memory:', e);
    }
  }
  try { console.log(`[PREP] Enqueued job ${jobId} key=${key}`); } catch {}
  scheduleScheduler();
  return { jobId, alreadyRunning: false, position: job.queuePosition };
}

// -------------------------------------------
// Redis-backed scheduler over multiple workers
// -------------------------------------------
const workerStates = RENDER_WORKERS.map(() => ({ busy: false, jobId: null }));
let schedulerStarted = false;

function scheduleScheduler() {
  if (schedulerStarted || !redis) return;
  schedulerStarted = true;
  
  // Main assignment loop
  (async function loop() {
    for (;;) {
      try {
        const freeIndex = workerStates.findIndex(w => !w.busy);
        if (freeIndex === -1) {
          await sleep(2000); // Increased: no free workers
          continue;
        }
        
        const raw = await redis.lpop(QUEUE_KEY);
        if (!raw) {
          await sleep(5000); // CRITICAL FIX: 5s instead of 750ms when queue is empty (saves 85% of Redis calls)
          continue;
        }
        
        const item = safeJson(raw);
        const jobId = item?.jobId;
        const meta = item?.meta || {};
        if (!jobId) continue;
        
        const job = JOBS.get(jobId) || { status: 'queued', progress: 0, meta, createdAt: Date.now() };
        
        // Stage GLB first
        job.status = 'preparing';
        JOBS.set(jobId, job);
        try { await redis.hset(JOB_KEY(jobId), 'status', 'preparing'); } catch {}
        
        let stagingUrl = null;
        try {
          stagingUrl = await processJob(jobId, job, { autoStart: false });
          job.stagingUrl = stagingUrl;
        } catch (e) {
          job.status = 'failed';
          job.error = (e && e.message) ? e.message : 'Failed to prepare GLB';
          job.progress = 100;
          job.completedAt = Date.now(); // Mark completion time
          try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
          continue;
        }
        
        if (job.cancelRequested) {
          job.status = 'failed';
          job.error = job.error || 'Cancelled by user (preparing)';
          job.progress = 100;
          job.completedAt = Date.now();
          try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
          continue;
        }
        
        // Assign to worker and start rendering
        job.status = 'running';
        job.queuePosition = 0;
        JOBS.set(jobId, job);
        try { console.log(`[PREP] Assigning ${jobId} to worker #${freeIndex}`); } catch {}
        
        const ok = await startRenderOnWorker(freeIndex, jobId, meta);
        if (!ok) {
          job.status = 'failed';
          job.error = 'Failed to start render';
          job.completedAt = Date.now();
          try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
          workerStates[freeIndex] = { busy: false, jobId: null };
          continue;
        }
        
        workerStates[freeIndex] = { busy: true, jobId };
        job.workerIndex = freeIndex;
        try { await redis.hset(JOB_KEY(jobId), 'status', 'running'); } catch {}
      } catch (e) {
        console.error('[PREP] Scheduler loop error:', e);
        await sleep(1000);
      }
    }
  })();
  
  // Poll running jobs (reduced frequency to save Redis calls)
  setInterval(pollRunningJobs, 5000); // CRITICAL FIX: 5s instead of 2s (saves 60% of polling calls)
  
  // Start cleanup interval
  startCleanupInterval();
}

async function pollRunningJobs() {
  for (let i = 0; i < workerStates.length; i++) {
    const st = workerStates[i];
    if (!st.busy || !st.jobId) continue;
    
    const jobId = st.jobId;
    const job = JOBS.get(jobId);
    const worker = RENDER_WORKERS[i];
    
    try {
      const res = await fetch(`${worker.url.replace(/\/$/, '')}/jobs/render/status?jobId=${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${worker.token}` },
        cache: 'no-store',
      });
      
      const js = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof js.progress === 'number' && job) job.progress = js.progress;
        
        if (js.status === 'completed') {
          if (job) {
            job.status = 'completed';
            job.progress = 100;
            job.imageUrl = js.imageUrl;
            job.completedAt = Date.now(); // Mark completion time
            if (js.imageUrls) job.imageUrls = js.imageUrls;
            if (js.images) job.images = js.images;
          }
          workerStates[i] = { busy: false, jobId: null };
          try { await redis.hset(JOB_KEY(jobId), 'status', 'completed'); } catch {}
          continue;
        }
        
        if (js.status === 'failed') {
          if (job) {
            job.status = 'failed';
            job.error = js.error || 'Render failed';
            job.progress = 100;
            job.completedAt = Date.now();
          }
          workerStates[i] = { busy: false, jobId: null };
          try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
          continue;
        }
      } else {
        if (res.status === 404 && job) {
          job.status = 'failed';
          job.error = 'Worker lost job';
          job.progress = 100;
          job.completedAt = Date.now();
          workerStates[i] = { busy: false, jobId: null };
          try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
        }
      }
    } catch (e) {
      if (job) {
        job.status = 'failed';
        job.error = 'Worker unreachable';
        job.progress = 100;
        job.completedAt = Date.now();
      }
      workerStates[i] = { busy: false, jobId: null };
      try { await redis.hset(JOB_KEY(jobId), 'status', 'failed'); } catch {}
    }
  }
}

async function startRenderOnWorker(workerIndex, jobId, meta) {
  try {
    const worker = RENDER_WORKERS[workerIndex];
    if (!worker || !worker.url || !worker.token) return false;
    
    const job = JOBS.get(jobId);
    const stagingUrl = job?.stagingUrl || buildStagingUrl(meta.client, jobId);
    
    const ready = await awaitCdnReadable(stagingUrl, { attempts: 6 });
    if (!ready) {
      console.warn(`[PREP] ${jobId} CDN not yet readable, proceeding anyway (worker has its own retries)`);
    }
    
    const callbackBase = RENDER_PUBLIC_BASE_URL || '';
    const cb = callbackBase ? `${callbackBase.replace(/\/$/, '')}/api/render/callback/image` : null;
    
    const payload = {
      jobId,
      glbUrl: stagingUrl,
      views: meta?.views || [meta?.view].filter(Boolean),
      background: meta?.background || 'ffffff',
      resolution: typeof meta?.resolution === 'number' ? meta.resolution : 1024,
      aspectRatio: meta?.aspectRatio || 'square',
      format: meta?.format || 'png',
      callbackUrl: cb,
      callbackToken: RENDER_CALLBACK_TOKEN,
      client: meta?.client,
      modelName: meta?.modelName || (typeof meta?.modelFilename === 'string' ? String(meta.modelFilename).replace(/\.(gltf|glb)$/i, '') : 'model'),
      variantName: meta?.variantName || null,
    };
    
    const resp = await fetch(`${worker.url.replace(/\/$/, '')}/jobs/render/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker.token}` },
      body: JSON.stringify(payload),
    });
    
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.error(`[PREP] ${jobId} worker#${workerIndex} start failed: ${resp.status} ${t}`);
      return false;
    }
    
    console.log(`[PREP] ${jobId} Render worker#${workerIndex} started`);
    return true;
  } catch (e) {
    console.error(`[PREP] ${jobId} worker#${workerIndex} start error:`, e);
    return false;
  }
}

function buildStagingUrl(client, jobId) {
  const basePath = bunnyBasePathFor(client || '');
  return `https://${PULL_ZONE_URL}/${basePath}/Renders/_staging/${jobId}.glb`;
}

function buildRenderFilename(view, resolution, background, timestamp, format) {
  return `${view}_${resolution}_${background}_${timestamp}.${format}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

async function awaitCdnReadable(url, { attempts = 6 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      let ok = false;
      try {
        const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        const len = Number(head.headers.get('content-length') || '0');
        ok = head.ok && len > 0;
      } catch {}
      if (!ok) {
        const get = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
        ok = get.ok && (get.status === 206 || get.status === 200);
      }
      if (ok) return true;
    } catch {}
    await sleep(Math.min(16000, 1000 * Math.pow(2, i)));
  }
  return false;
}

// Cancel endpoint
app.post('/jobs/render/cancel', auth, async (req, res) => {
  try {
    const jobId = String((req.body && req.body.jobId) || '');
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });
    let action = null;

    if (redis) {
      try {
        const rawList = await redis.lrange(QUEUE_KEY, 0, -1);
        const matches = rawList.filter(r => {
          const obj = safeJson(r) || {};
          return obj?.jobId === jobId;
        });
        if (matches.length > 0) {
          for (const m of matches) {
            await redis.lrem(QUEUE_KEY, 0, m);
          }
          const j = JOBS.get(jobId) || {};
          j.status = 'failed';
          j.error = 'Cancelled by user (queued)';
          j.progress = 0;
          j.completedAt = Date.now();
          JOBS.set(jobId, j);
          action = 'removed-from-queue';
        }
      } catch (e) {
        console.error('[PREP] Redis cancel error:', e);
      }
    }

    const job = JOBS.get(jobId);
    if (!action && job) {
      if (job.status === 'preparing') {
        job.cancelRequested = true;
        job.error = 'Cancelled by user (preparing)';
        action = 'cancel-preparing';
      }
      else if (job.status === 'running' && typeof job.workerIndex === 'number') {
        try {
          const worker = RENDER_WORKERS[job.workerIndex];
          if (worker) {
            const resp = await fetch(`${worker.url.replace(/\/$/, '')}/jobs/render/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker.token}` },
              body: JSON.stringify({ jobId })
            });
            if (!resp.ok) {
              const t = await resp.text().catch(() => '');
              console.warn(`[PREP] Cancel on worker failed ${resp.status}: ${t}`);
            }
          }
        } catch (e) {
          console.warn('[PREP] Worker cancel error:', e);
        }
        job.status = 'failed';
        job.error = 'Cancelled by user';
        job.progress = 100;
        job.completedAt = Date.now();
        if (workerStates[job.workerIndex]) workerStates[job.workerIndex] = { busy: false, jobId: null };
        action = 'cancel-running';
      }
    }

    if (!action) return res.status(404).json({ error: 'job not found' });
    return res.json({ success: true, action });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to cancel job' });
  }
});

function filterResourcesForImages(resources, gltf) {
  try {
    const keep = new Set();
    (gltf.images || []).forEach(img => {
      const uri = img && typeof img.uri === 'string' ? img.uri : null;
      if (uri && !uri.startsWith('data:')) keep.add(uri);
    });
    const filtered = {};
    Object.entries(resources || {}).forEach(([k, v]) => { if (keep.has(k)) filtered[k] = v; });
    return filtered;
  } catch (e) {
    return resources;
  }
}

function auth(req, res, next) {
  if (!JOB_API_TOKEN) return next();
  const hdr = req.headers['authorization'] || '';
  if (hdr === `Bearer ${JOB_API_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function isClientAllowed(clientName) {
  const simple = /^[A-Za-z0-9._-]+$/.test(clientName);
  if (CLIENTS_ALLOWLIST.length > 0) return simple && CLIENTS_ALLOWLIST.includes(clientName);
  return simple;
}

function bunnyBasePathFor(clientName) {
  return `${CLIENTS_ROOT}/${clientName}`;
}

function uploadToBunnyStorage(storagePath, content, contentType = 'model/gltf-binary') {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${ZONE}/${storagePath}`,
      headers: { AccessKey: ACCESS_KEY, 'Content-Type': contentType, 'Content-Length': buffer.length },
    };
    
    console.log(`[BUNNY] Uploading to https://${HOSTNAME}/${ZONE}/${storagePath}`);
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`[BUNNY] Upload SUCCESS`);
          resolve();
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', (err) => {
      console.error(`[BUNNY] Request error:`, err);
      reject(err);
    });
    req.write(buffer);
    req.end();
  });
}

/* Routes */
app.get('/health', (req, res) => res.json({ ok: true, service: 'render-prep', time: new Date().toISOString() }));

app.post('/jobs/render/prepare', auth, async (req, res) => {
  try {
    const { client, modelFilename, variantName, modelName, views, view, background, resolution, aspectRatio, format, isModularUpload, tempGLBPath } = req.body || {};
    if (!client || typeof client !== 'string' || !isClientAllowed(client)) {
      return res.status(400).json({ error: 'client is required/invalid' });
    }
    if (!modelFilename || typeof modelFilename !== 'string') {
      return res.status(400).json({ error: 'modelFilename is required' });
    }
    const viewsArray = Array.isArray(views) ? views : (view ? [view] : []);
    if (viewsArray.length === 0) {
      return res.status(400).json({ error: 'At least one view is required' });
    }
    const meta = { 
      client, 
      modelFilename, 
      variantName: variantName || null, 
      modelName, 
      views: viewsArray,
      view: viewsArray[0],
      background, 
      resolution,
      aspectRatio: aspectRatio || 'square',
      format: format || 'png',
      isModularUpload: isModularUpload || false,
      tempGLBPath: tempGLBPath || null
    };
    const { jobId, alreadyRunning, position } = enqueueJob(meta);
    return res.json({ jobId, alreadyRunning: !!alreadyRunning, queuePosition: position });
  } catch (e) {
    console.error('[PREP] Enqueue failed:', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to enqueue render prep' });
  }
});

app.get('/jobs/render/prepare/status', auth, (req, res) => {
  const jobId = String(req.query.jobId || '');
  if (!jobId) return res.status(400).json({ error: 'jobId is required' });
  const job = JOBS.get(jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const { status, progress, queuePosition, stagingUrl, error, meta } = job;
  return res.json({ status, progress, queuePosition, stagingUrl, error, meta });
});

app.get('/jobs/render/queue', auth, async (req, res) => {
  try {
    const client = String(req.query.client || '').trim();
    if (!client) return res.status(400).json({ error: 'client is required' });
    const items = [];
    const seen = new Set();
    const globalPos = {};
    let rawList = []; // CRITICAL FIX: Cache the lrange result to avoid duplicate Redis call
    
    if (redis) {
      try {
        rawList = await redis.lrange(QUEUE_KEY, 0, -1); // Single Redis call instead of two
        let pos = 1;
        for (const raw of rawList || []) {
          const obj = safeJson(raw) || {};
          const jobId = obj?.jobId;
          if (jobId && globalPos[jobId] == null) {
            globalPos[jobId] = pos++;
          }
        }
      } catch (e) {
        console.error('[PREP] Redis build global positions error:', e);
      }
    }

    for (const [jobId, job] of JOBS.entries()) {
      const meta = job?.meta || {};
      if (meta?.client !== client) continue;
      const status = String(job?.status || 'queued');
      if (status === 'queued') continue;
      
      let stage = 'preparing';
      if (status === 'queued') stage = 'queued';
      else if (status === 'running' || status === 'completed' || status === 'failed') stage = 'rendering';
      
      const rawProg = typeof job?.progress === 'number' ? job.progress : 0;
      
      // Worker already reports 0-100% progress, use it directly
      let combinedProgress = stage === 'queued' ? 0 : Math.max(0, Math.min(100, rawProg));
      
            items.push({
              jobId,
              client,
              modelName: meta?.modelName,
              variantName: meta?.variantName || null,
              view: meta?.view || null,
              views: meta?.views || null,
              background: meta?.background,
              resolution: meta?.resolution,
              format: meta?.format || 'png',
              status,
              stage,
              progress: rawProg,
              combinedProgress,
              queuePosition: job?.queuePosition || 0,
              imageUrl: job?.imageUrl,
              imageUrls: job?.imageUrls,
              images: job?.images,
              error: job?.error,
            });
      seen.add(jobId);
    }

    if (redis && rawList.length > 0) {
      try {
        // CRITICAL FIX: Reuse cached rawList instead of calling lrange again
        for (const raw of rawList) {
          const obj = safeJson(raw) || {};
          const jobId = obj?.jobId;
          const meta = obj?.meta || {};
          if (!jobId || seen.has(jobId)) continue;
          if (meta?.client !== client) continue;
          
          items.push({
            jobId,
            client,
            modelName: meta?.modelName,
            variantName: meta?.variantName || null,
            view: meta?.view || null,
            views: meta?.views || null,
            background: meta?.background,
            resolution: meta?.resolution,
            format: meta?.format || 'png',
            status: 'queued',
            stage: 'queued',
            progress: 0,
            combinedProgress: 0,
            queuePosition: globalPos[jobId] || 0,
          });
          seen.add(jobId);
        }
      } catch (e) {
        console.error('[PREP] Redis list error:', e);
      }
    }

    const queued = items
      .filter(it => it.status === 'queued')
      .sort((a, b) => (b.queuePosition || 0) - (a.queuePosition || 0));
    const others = items.filter(it => it.status !== 'queued').sort((a, b) => String(a.jobId).localeCompare(String(b.jobId)));
    const ordered = [...queued, ...others];
    return res.json({ items: ordered });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to get queue' });
  }
});

app.post('/jobs/render/clear-finished', auth, async (req, res) => {
  try {
    const client = String((req.body && req.body.client) || req.query.client || '').trim();
    if (!client) return res.status(400).json({ error: 'client is required' });
    let removed = 0;
    
    for (const [jobId, job] of Array.from(JOBS.entries())) {
      const meta = job?.meta || {};
      if (meta?.client !== client) continue;
      const st = String(job?.status || 'unknown');
      if (st === 'completed' || st === 'failed') {
        JOBS.delete(jobId);
        if (job.key) KEY_TO_JOBID.delete(job.key);
        removed++;
        
        // Clean up Redis
        if (redis) {
          redis.del(JOB_KEY(jobId)).catch(() => {});
        }
      }
    }
    return res.json({ success: true, removed });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to clear finished' });
  }
});

app.get('/jobs/render/blocked', auth, async (req, res) => {
  try {
    const client = String(req.query.client || '').trim();
    const model = String(req.query.model || '').trim();
    const variant = String(req.query.variant || '').trim() || null;
    if (!client || !model) return res.status(400).json({ error: 'client and model are required' });
    
    for (const [, job] of JOBS.entries()) {
      const meta = job?.meta || {};
      if (meta?.client !== client) continue;
      if (meta?.modelName !== model) continue;
      const jobVariant = meta?.variantName || null;
      const st = String(job?.status || 'queued');
      if ((jobVariant || null) === (variant || null) && st !== 'completed' && st !== 'failed') {
        return res.json({ blocked: true });
      }
    }
    
    if (redis) {
      try {
        const rawList = await redis.lrange(QUEUE_KEY, 0, -1);
        for (const raw of rawList || []) {
          const obj = safeJson(raw) || {};
          const meta = obj?.meta || {};
          if (meta?.client === client && meta?.modelName === model && (meta?.variantName || null) === (variant || null)) {
            return res.json({ blocked: true });
          }
        }
      } catch (e) {
        console.error('[PREP] Redis blocked check error:', e);
      }
    }
    return res.json({ blocked: false });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to get block status' });
  }
});

app.listen(PORT, () => {
  console.log(`Render prep service listening on :${PORT}`);
  console.log(`[PREP] Memory optimization enabled: max ${MAX_COMPLETED_JOBS_PER_CLIENT} completed jobs/client, ${JOB_TTL_MS}ms TTL`);
});

/* GLB preparation with SHARED IO instances (CRITICAL OPTIMIZATION) */
async function processJob(jobId, job) {
  const { client, modelFilename, variantName, isModularUpload, tempGLBPath } = job.meta || {};
  const basePath = bunnyBasePathFor(client);
  
  const checkCancel = () => {
    if (job && job.cancelRequested) throw new Error('Cancelled by user (preparing)');
  };
  
  // Handle modular upload (pre-uploaded GLB) - just copy to staging
  if (isModularUpload && tempGLBPath) {
    try { console.log(`[PREP] ${jobId} Modular upload detected, copying from temp: ${tempGLBPath}`); } catch {}
    
    const tempUrl = `https://${PULL_ZONE_URL}/${tempGLBPath}`;
    job.progress = 10;
    
    // Wait for CDN propagation before downloading
    try { console.log(`[PREP] ${jobId} Waiting 2s for CDN propagation...`); } catch {}
    await sleep(2000);
    
    // Download from temp location with retries
    let glbBuffer = null;
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tempRes = await fetch(tempUrl, { cache: 'no-store' });
        checkCancel();
        
        if (!tempRes.ok) {
          throw new Error(`HTTP ${tempRes.status}`);
        }
        
        glbBuffer = Buffer.from(await tempRes.arrayBuffer());
        
        if (glbBuffer.length === 0) {
          if (attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
            try { console.log(`[PREP] ${jobId} Got 0 bytes (attempt ${attempt + 1}/${maxRetries}), waiting ${waitTime}ms for CDN...`); } catch {}
            await sleep(waitTime);
            continue;
          } else {
            throw new Error('Downloaded temp GLB is empty (0 bytes) after all retries');
          }
        }
        
        try { console.log(`[PREP] ${jobId} Temp GLB downloaded successfully, size=${glbBuffer.length}`); } catch {}
        break;
      } catch (err) {
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          try { console.error(`[PREP] ${jobId} Fetch attempt ${attempt + 1}/${maxRetries} failed: ${err.message}, retrying in ${waitTime}ms...`); } catch {}
          await sleep(waitTime);
        } else {
          try { console.error(`[PREP] ${jobId} Failed to fetch temp GLB after ${maxRetries} attempts`); } catch {}
          throw err;
        }
      }
    }
    
    if (!glbBuffer || glbBuffer.length === 0) {
      throw new Error('Failed to download temp GLB');
    }
    
    job.progress = 60;
    checkCancel();
    
    // Upload directly to staging (no processing needed for modular configs)
    const stagingPath = `${basePath}/Renders/_staging/${jobId}.glb`;
    await uploadToBunnyStorage(stagingPath, glbBuffer, 'model/gltf-binary');
    job.progress = 90;
    checkCancel();
    
    const stagingUrl = `https://${PULL_ZONE_URL}/${stagingPath}`;
    try { console.log(`[PREP] ${jobId} Modular GLB uploaded to staging: ${stagingUrl}`); } catch {}
    
    return stagingUrl;
  }
  
  // Normal model processing flow
  const sourceUrl = `https://${PULL_ZONE_URL}/${basePath}/${encodeURIComponent(modelFilename)}`;
  
  try { console.log(`[PREP] ${jobId} Downloading source: ${sourceUrl}`); } catch {}

  // Get SHARED IO instances (CRITICAL: reuse across all jobs)
  const { readIO, writeIO } = await getSharedIO();

  // Download source
  job.progress = 8;
  const srcRes = await fetch(sourceUrl).catch((err) => {
    try { console.error(`[PREP] ${jobId} Fetch error:`, err); } catch {}
    throw err;
  });
  checkCancel();
  
  if (!srcRes.ok) {
    try { console.error(`[PREP] ${jobId} Failed to fetch source: ${srcRes.status}`); } catch {}
    throw new Error(`Failed to fetch source: ${srcRes.status}`);
  }
  
  const srcBuf = Buffer.from(await srcRes.arrayBuffer());
  job.progress = 12;
  checkCancel();
  
  const isGlb = modelFilename.toLowerCase().endsWith('.glb');
  try { console.log(`[PREP] ${jobId} Source bytes=${srcBuf.length} isGlb=${isGlb}`); } catch {}

  function bakeActiveVariantInGltf(gltf, variantName) {
    if (!gltf || !variantName) return;
    try {
      const extRoot = gltf.extensions || {};
      const kmv = extRoot.KHR_materials_variants;
      if (!kmv || !Array.isArray(kmv.variants)) return;
      const variantIndex = kmv.variants.findIndex(v => v && v.name === variantName);
      if (variantIndex < 0) return;

      const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
      meshes.forEach(mesh => {
        const prims = Array.isArray(mesh.primitives) ? mesh.primitives : [];
        prims.forEach(prim => {
          const ext = prim?.extensions?.KHR_materials_variants;
          const mappings = Array.isArray(ext?.mappings) ? ext.mappings : [];
          const match = mappings.find(m => Array.isArray(m?.variants) && m.variants.includes(variantIndex) && typeof m.material === 'number');
          if (match && typeof match.material === 'number') prim.material = match.material;
          if (prim.extensions && prim.extensions.KHR_materials_variants) {
            delete prim.extensions.KHR_materials_variants;
            if (Object.keys(prim.extensions).length === 0) delete prim.extensions;
          }
        });
      });

      if (gltf.extensions && gltf.extensions.KHR_materials_variants) {
        delete gltf.extensions.KHR_materials_variants;
        if (Object.keys(gltf.extensions).length === 0) delete gltf.extensions;
      }
      if (Array.isArray(gltf.extensionsUsed)) {
        gltf.extensionsUsed = gltf.extensionsUsed.filter(n => n !== 'KHR_materials_variants');
      }
      if (Array.isArray(gltf.extensionsRequired)) {
        gltf.extensionsRequired = gltf.extensionsRequired.filter(n => n !== 'KHR_materials_variants');
      }
    } catch (e) {}
  }

  function removeBasisUAndPrune(gltf) {
    try {
      if (Array.isArray(gltf.textures)) {
        gltf.textures.forEach(tx => {
          if (tx?.extensions?.KHR_texture_basisu) {
            delete tx.extensions.KHR_texture_basisu;
            if (Object.keys(tx.extensions).length === 0) delete tx.extensions;
          }
        });
      }
      if (Array.isArray(gltf.extensionsUsed)) gltf.extensionsUsed = gltf.extensionsUsed.filter(n => n !== 'KHR_texture_basisu');
      if (Array.isArray(gltf.extensionsRequired)) gltf.extensionsRequired = gltf.extensionsRequired.filter(n => n !== 'KHR_texture_basisu');
    } catch {}

    try {
      const usedMaterials = new Set();
      (gltf.meshes || []).forEach(mesh => {
        (mesh.primitives || []).forEach(prim => { if (typeof prim.material === 'number') usedMaterials.add(prim.material); });
      });
      const oldToNewMat = {}; const newMats = [];
      (gltf.materials || []).forEach((m, idx) => { if (usedMaterials.has(idx)) { oldToNewMat[idx] = newMats.length; newMats.push(m); } });
      (gltf.meshes || []).forEach(mesh => {
        (mesh.primitives || []).forEach(prim => { if (typeof prim.material === 'number' && prim.material in oldToNewMat) prim.material = oldToNewMat[prim.material]; });
      });
      gltf.materials = newMats;

      const collectTextures = (mat, set) => {
        const texFields = [
          mat?.pbrMetallicRoughness?.baseColorTexture,
          mat?.pbrMetallicRoughness?.metallicRoughnessTexture,
          mat?.normalTexture,
          mat?.occlusionTexture,
          mat?.emissiveTexture,
          mat?.extensions?.KHR_materials_sheen?.sheenColorTexture,
          mat?.extensions?.KHR_materials_sheen?.sheenRoughnessTexture,
        ];
        texFields.forEach(t => { if (t && typeof t.index === 'number') set.add(t.index); });
      };
      const usedTextures = new Set();
      (gltf.materials || []).forEach(m => collectTextures(m, usedTextures));
      const oldToNewTex = {}; const newTextures = [];
      (gltf.textures || []).forEach((t, idx) => { if (usedTextures.has(idx)) { oldToNewTex[idx] = newTextures.length; newTextures.push(t); } });
      (gltf.materials || []).forEach(m => {
        const remap = ti => { if (ti && typeof ti.index === 'number' && ti.index in oldToNewTex) ti.index = oldToNewTex[ti.index]; };
        remap(m?.pbrMetallicRoughness?.baseColorTexture);
        remap(m?.pbrMetallicRoughness?.metallicRoughnessTexture);
        remap(m?.normalTexture);
        remap(m?.occlusionTexture);
        remap(m?.emissiveTexture);
        if (m?.extensions?.KHR_materials_sheen) { remap(m.extensions.KHR_materials_sheen.sheenColorTexture); remap(m.extensions.KHR_materials_sheen.sheenRoughnessTexture); }
      });
      gltf.textures = newTextures;

      const usedImages = new Set();
      (gltf.textures || []).forEach(t => { if (typeof t.source === 'number') usedImages.add(t.source); });
      const oldToNewImg = {}; const newImages = [];
      (gltf.images || []).forEach((img, idx) => { if (usedImages.has(idx)) { oldToNewImg[idx] = newImages.length; newImages.push(img); } });
      (gltf.textures || []).forEach(t => { if (typeof t.source === 'number' && t.source in oldToNewImg) t.source = oldToNewImg[t.source]; });
      gltf.images = newImages;

      const usedSamplers = new Set();
      (gltf.textures || []).forEach(t => { if (typeof t.sampler === 'number') usedSamplers.add(t.sampler); });
      const oldToNewSampler = {}; const newSamplers = [];
      (gltf.samplers || []).forEach((s, idx) => { if (usedSamplers.has(idx)) { oldToNewSampler[idx] = newSamplers.length; newSamplers.push(s); } });
      (gltf.textures || []).forEach(t => { if (typeof t.sampler === 'number' && t.sampler in oldToNewSampler) t.sampler = oldToNewSampler[t.sampler]; });
      gltf.samplers = newSamplers;
    } catch {}
  }

  // Transform pipeline
  job.progress = 30;
  let doc;
  
  if (isGlb) {
    doc = await readIO.readBinary(new Uint8Array(srcBuf));
      checkCancel();
    
    const jsonOut = await readIO.writeJSON(doc);
    const gltf = jsonOut.json || {};
    const resMap = jsonOut.resources || {};
    bakeActiveVariantInGltf(gltf, variantName);
    job.progress = 40;
      checkCancel();
    
    removeBasisUAndPrune(gltf);
    const filteredRes = filterResourcesForImages(resMap, gltf);
    doc = await readIO.readJSON({ json: gltf, resources: filteredRes });
    try { console.log(`[PREP] ${jobId} GLB->JSON transform complete`); } catch {}
  } else {
    const jsonText = srcBuf.toString('utf8');
    const gltf = JSON.parse(jsonText);
    const baseDir = sourceUrl.slice(0, sourceUrl.lastIndexOf('/'));
    const resourceMap = {};
    
    const addResource = async uri => {
        checkCancel();
      if (!uri || typeof uri !== 'string') return;
      if (uri.startsWith('data:')) return;
      const isAbsolute = /^https?:\/\//i.test(uri);
      const url = isAbsolute ? uri : `${baseDir}/${uri}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch resource ${uri}: ${res.status}`);
      const ab = await res.arrayBuffer();
      resourceMap[uri] = new Uint8Array(ab);
    };
    
    try { if (Array.isArray(gltf.buffers)) { for (const b of gltf.buffers) await addResource(b?.uri); } } catch {}
    try { if (Array.isArray(gltf.images)) { for (const img of gltf.images) await addResource(img?.uri); } } catch {}
    
    bakeActiveVariantInGltf(gltf, variantName);
    job.progress = 40;
      checkCancel();
    
    removeBasisUAndPrune(gltf);
    const filteredRes = filterResourcesForImages(resourceMap, gltf);
    doc = await readIO.readJSON({ json: gltf, resources: filteredRes });
    try { console.log(`[PREP] ${jobId} GLTF JSON processed and reconstructed`); } catch {}
  }

  // Strip Draco flags
  try {
    const root = doc.getRoot?.();
    if (root) {
      for (const ext of root.listExtensionsUsed?.() || []) {
        if (ext?.extensionName === 'KHR_draco_mesh_compression') root.removeExtension(ext);
      }
      for (const ext of root.listExtensionsRequired?.() || []) {
        if (ext?.extensionName === 'KHR_draco_mesh_compression') root.removeExtension(ext);
      }
    }
  } catch {}

  // Write GLB
  job.progress = 55;
  const glb = await writeIO.writeBinary(doc);
    checkCancel();
  
  const glbBuffer = Buffer.from(glb);
  job.progress = 60;
  try { console.log(`[PREP] ${jobId} GLB written size=${glbBuffer.length}`); } catch {}

  // Upload to staging
  const stagingPath = `${basePath}/Renders/_staging/${jobId}.glb`;
  await uploadToBunnyStorage(stagingPath, glbBuffer, 'model/gltf-binary');
  job.progress = 90;
  checkCancel();
  
  const stagingUrl = `https://${PULL_ZONE_URL}/${stagingPath}`;
  try { console.log(`[PREP] ${jobId} Uploaded to ${stagingUrl}`); } catch {}

  return stagingUrl;
}

