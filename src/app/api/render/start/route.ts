import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';
import { spawn } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import https from 'https';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro: 60 seconds

interface StartBody {
  client: string;
  modelFilename: string;
  modelName: string;
  variantName?: string | null;
  view: { name: string };
  background: 'white' | 'transparent' | 'studio';
  resolution: number;
}

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';

const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

function generateJobId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}`;
}

async function downloadFromCdn(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(new Uint8Array(ab));
}

async function convertAndBakeWithCLI(
  sourceUrl: string,
  isGlb: boolean,
  variantName: string | null,
  tmpDir: string
): Promise<Buffer> {
  // Download source
  const srcBuf = await downloadFromCdn(sourceUrl);
  const inputPath = join(tmpDir, isGlb ? 'input.glb' : 'input.gltf');
  const outputPath = join(tmpDir, 'output.glb');
  await writeFile(inputPath, srcBuf);

  // If GLTF, download external resources
  if (!isGlb) {
    const gltfJson = JSON.parse(srcBuf.toString('utf8'));
    const baseDir = sourceUrl.slice(0, sourceUrl.lastIndexOf('/'));
    const downloads: Promise<void>[] = [];
    
    // Download images
    if (Array.isArray(gltfJson.images)) {
      for (const img of gltfJson.images) {
        const uri = img?.uri;
        if (uri && typeof uri === 'string' && !uri.startsWith('data:')) {
          const url = uri.startsWith('http') ? uri : `${baseDir}/${uri}`;
          downloads.push(
            downloadFromCdn(url).then(buf => writeFile(join(tmpDir, uri), buf))
          );
        }
      }
    }
    
    // Download buffers
    if (Array.isArray(gltfJson.buffers)) {
      for (const buf of gltfJson.buffers) {
        const uri = buf?.uri;
        if (uri && typeof uri === 'string' && !uri.startsWith('data:')) {
          const url = uri.startsWith('http') ? uri : `${baseDir}/${uri}`;
          downloads.push(
            downloadFromCdn(url).then(b => writeFile(join(tmpDir, uri), b))
          );
        }
      }
    }
    
    await Promise.all(downloads);
  }

  // Use gltf-transform CLI to convert + bake variant
  const args = ['--yes', '@gltf-transform/cli@latest', 'copy', inputPath, outputPath];
  if (variantName) {
    args.push('--', '--variant', variantName);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', args, { cwd: tmpDir });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`gltf-transform failed: ${stderr}`));
      }
      try {
        const glb = await readFile(outputPath);
        resolve(glb);
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', reject);
  });
}

async function uploadToBunny(filePath: string, buffer: Buffer, contentType: string): Promise<void> {
  const { zoneName } = getStorageZoneDetails();
  await new Promise<void>((resolve, reject) => {
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${zoneName}/${filePath}`,
      headers: {
        AccessKey: ACCESS_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartBody;
    const { client, modelFilename, modelName, variantName, view, background, resolution } = body || ({} as StartBody);
    if (!client || !modelFilename || !modelName || !view?.name || !background || !resolution) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const workerBase = process.env.RENDER_WORKER_BASE_URL;
    const workerToken = process.env.RENDER_WORKER_API_TOKEN;
    const callbackToken = process.env.RENDER_CALLBACK_TOKEN;
    if (!workerBase || !workerToken || !callbackToken) {
      return NextResponse.json({ error: 'Server not configured: missing RENDER_* envs' }, { status: 500 });
    }

    const clientConfig = getClientConfig(client);
    const basePublic = clientConfig.bunnyCdn.publicBaseUrl.replace(/\/$/, '');
    const modelBase = clientConfig.bunnyCdn.modelPath.replace(/\/$/, '');
    const sourceUrl = `${basePublic}/${modelBase}/${encodeURIComponent(modelFilename)}`;

    // Stage GLB with variant baked using gltf-transform CLI (handles Draco + external textures)
    const jobId = generateJobId();
    const tmpDir = join(tmpdir(), `render-${jobId}`);
    await mkdir(tmpdir(), { recursive: true });
    
    const isGlb = modelFilename.toLowerCase().endsWith('.glb');
    const bakedGlb = await convertAndBakeWithCLI(sourceUrl, isGlb, variantName || null, tmpDir);
    
    const stagingPath = `${modelBase}/Renders/_staging/${jobId}.glb`;
    await uploadToBunny(stagingPath, bakedGlb, 'model/gltf-binary');
    const stagingUrl = `${basePublic}/${stagingPath}`;

    // Call worker with staged GLB
    const publicBase = process.env.RENDER_PUBLIC_BASE_URL;
    const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
    
    let hdrFile: string | null = null;
    try {
      const u = new URL(clientConfig.hdrPath);
      hdrFile = u.pathname.split('/').pop() || null;
    } catch {}

    const payload = {
      jobId,
      glbUrl: stagingUrl,
      view,
      background,
      resolution,
      callbackUrl,
      callbackToken,
      client,
      modelName,
      variantName: variantName || null,
      hdrFile,
    };

    const res = await fetch(`${workerBase.replace(/\/$/, '')}/jobs/render/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerToken}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || 'Failed to start worker job' }, { status: res.status });
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to start render';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


