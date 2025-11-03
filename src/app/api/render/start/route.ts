import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { clients, getClientConfig } from '@/config/clientConfig';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsVariants, KHRDracoMeshCompression, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import path from 'path';
import fs from 'fs';

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
  if (!res.ok) throw new Error(`Failed to fetch source GLB: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(new Uint8Array(ab));
}

function joinUrl(baseDir: string, uri: string): string {
  const sep = baseDir.endsWith('/') ? '' : '/';
  return `${baseDir}${sep}${uri}`;
}

function bakeActiveVariantInGltf(gltf: any, variantName?: string | null) {
  if (!gltf || !variantName) return;
  try {
    const extRoot = (gltf.extensions || {});
    const kmv = extRoot.KHR_materials_variants;
    if (!kmv || !Array.isArray(kmv.variants)) return;
    const variantIndex = kmv.variants.findIndex((v: any) => v && v.name === variantName);
    if (variantIndex < 0) return;

    const meshes: any[] = Array.isArray(gltf.meshes) ? gltf.meshes : [];
    meshes.forEach((mesh) => {
      const prims: any[] = Array.isArray(mesh.primitives) ? mesh.primitives : [];
      prims.forEach((prim) => {
        const ext = prim?.extensions?.KHR_materials_variants;
        const mappings: any[] = Array.isArray(ext?.mappings) ? ext.mappings : [];
        const match = mappings.find((m) => Array.isArray(m?.variants) && m.variants.includes(variantIndex) && typeof m.material === 'number');
        if (match && typeof match.material === 'number') {
          prim.material = match.material;
        }
        if (prim.extensions && prim.extensions.KHR_materials_variants) {
          delete prim.extensions.KHR_materials_variants;
          if (Object.keys(prim.extensions).length === 0) delete prim.extensions;
        }
      });
    });

    // Remove root variant extension
    if (gltf.extensions && gltf.extensions.KHR_materials_variants) {
      delete gltf.extensions.KHR_materials_variants;
      if (Object.keys(gltf.extensions).length === 0) delete gltf.extensions;
    }
    // Remove from used/required
    if (Array.isArray(gltf.extensionsUsed)) {
      gltf.extensionsUsed = gltf.extensionsUsed.filter((n: string) => n !== 'KHR_materials_variants');
    }
    if (Array.isArray(gltf.extensionsRequired)) {
      gltf.extensionsRequired = gltf.extensionsRequired.filter((n: string) => n !== 'KHR_materials_variants');
    }
  } catch {}
}

function removeBasisUAndPrune(gltf: any) {
  try {
    // Remove KHR_texture_basisu from textures and root
    if (Array.isArray(gltf.textures)) {
      gltf.textures.forEach((tx: any) => {
        if (tx?.extensions?.KHR_texture_basisu) {
          delete tx.extensions.KHR_texture_basisu;
          if (Object.keys(tx.extensions).length === 0) delete tx.extensions;
        }
      });
    }
    if (Array.isArray(gltf.extensionsUsed)) {
      gltf.extensionsUsed = gltf.extensionsUsed.filter((n: string) => n !== 'KHR_texture_basisu');
    }
    if (Array.isArray(gltf.extensionsRequired)) {
      gltf.extensionsRequired = gltf.extensionsRequired.filter((n: string) => n !== 'KHR_texture_basisu');
    }
  } catch {}

  // Prune unused materials/textures/images/samplers
  try {
    const usedMaterials = new Set<number>();
    (gltf.meshes || []).forEach((mesh: any) => {
      (mesh.primitives || []).forEach((prim: any) => {
        if (typeof prim.material === 'number') usedMaterials.add(prim.material);
      });
    });
    const oldToNewMat: Record<number, number> = {};
    const newMats: any[] = [];
    (gltf.materials || []).forEach((m: any, idx: number) => {
      if (usedMaterials.has(idx)) {
        oldToNewMat[idx] = newMats.length;
        newMats.push(m);
      }
    });
    (gltf.meshes || []).forEach((mesh: any) => {
      (mesh.primitives || []).forEach((prim: any) => {
        if (typeof prim.material === 'number' && prim.material in oldToNewMat) prim.material = oldToNewMat[prim.material];
      });
    });
    gltf.materials = newMats;

    const collectTextures = (mat: any, set: Set<number>) => {
      const texFields = [
        mat?.pbrMetallicRoughness?.baseColorTexture,
        mat?.pbrMetallicRoughness?.metallicRoughnessTexture,
        mat?.normalTexture,
        mat?.occlusionTexture,
        mat?.emissiveTexture,
        // KHR_materials_sheen
        mat?.extensions?.KHR_materials_sheen?.sheenColorTexture,
        mat?.extensions?.KHR_materials_sheen?.sheenRoughnessTexture,
      ];
      texFields.forEach((t) => { if (t && typeof t.index === 'number') set.add(t.index); });
    };
    const usedTextures = new Set<number>();
    (gltf.materials || []).forEach((m: any) => collectTextures(m, usedTextures));

    const oldToNewTex: Record<number, number> = {};
    const newTextures: any[] = [];
    (gltf.textures || []).forEach((t: any, idx: number) => {
      if (usedTextures.has(idx)) {
        oldToNewTex[idx] = newTextures.length;
        newTextures.push(t);
      }
    });
    // Remap texture indices in materials
    (gltf.materials || []).forEach((m: any) => {
      const remap = (ti: any) => { if (ti && typeof ti.index === 'number' && ti.index in oldToNewTex) ti.index = oldToNewTex[ti.index]; };
      remap(m?.pbrMetallicRoughness?.baseColorTexture);
      remap(m?.pbrMetallicRoughness?.metallicRoughnessTexture);
      remap(m?.normalTexture);
      remap(m?.occlusionTexture);
      remap(m?.emissiveTexture);
      if (m?.extensions?.KHR_materials_sheen) {
        remap(m.extensions.KHR_materials_sheen.sheenColorTexture);
        remap(m.extensions.KHR_materials_sheen.sheenRoughnessTexture);
      }
    });
    gltf.textures = newTextures;

    const usedImages = new Set<number>();
    (gltf.textures || []).forEach((t: any) => { if (typeof t.source === 'number') usedImages.add(t.source); });
    const oldToNewImg: Record<number, number> = {};
    const newImages: any[] = [];
    (gltf.images || []).forEach((img: any, idx: number) => {
      if (usedImages.has(idx)) {
        oldToNewImg[idx] = newImages.length;
        newImages.push(img);
      }
    });
    (gltf.textures || []).forEach((t: any) => { if (typeof t.source === 'number' && t.source in oldToNewImg) t.source = oldToNewImg[t.source]; });
    gltf.images = newImages;

    const usedSamplers = new Set<number>();
    (gltf.textures || []).forEach((t: any) => { if (typeof t.sampler === 'number') usedSamplers.add(t.sampler); });
    const oldToNewSampler: Record<number, number> = {};
    const newSamplers: any[] = [];
    (gltf.samplers || []).forEach((s: any, idx: number) => {
      if (usedSamplers.has(idx)) { oldToNewSampler[idx] = newSamplers.length; newSamplers.push(s); }
    });
    (gltf.textures || []).forEach((t: any) => { if (typeof t.sampler === 'number' && t.sampler in oldToNewSampler) t.sampler = oldToNewSampler[t.sampler]; });
    gltf.samplers = newSamplers;
  } catch {}
}

function filterResourcesForImages(resources: Record<string, Uint8Array>, gltf: any) {
  try {
    const keep = new Set<string>();
    (gltf.images || []).forEach((img: any) => {
      const uri = img?.uri;
      if (uri && typeof uri === 'string' && !uri.startsWith('data:')) keep.add(uri);
    });
    const filtered: Record<string, Uint8Array> = {};
    Object.entries(resources || {}).forEach(([k, v]) => { if (keep.has(k)) filtered[k] = v; });
    return filtered;
  } catch { return resources; }
}

async function convertToGlb(buffer: Buffer, sourceUrl: string, isGlb: boolean, variantName?: string | null): Promise<Buffer> {
  // Build separate IOs: one for reading (with Draco decoder), one for writing (no Draco encoder required).
  let decoderModule: any = undefined;
  if ((draco3d as any)?.createDecoderModule) {
    try {
      const locateFile = (file: string) => {
        const p1 = path.join(process.cwd(), 'node_modules', 'draco3dgltf', file);
        if (fs.existsSync(p1)) return p1;
        const p2 = path.join(path.dirname(require.resolve('draco3dgltf/package.json')), file);
        if (fs.existsSync(p2)) return p2;
        return file;
      };
      decoderModule = await (draco3d as any).createDecoderModule({ locateFile });
    } catch {}
  }

  const readIO = new NodeIO()
    .registerExtensions([KHRMaterialsVariants, KHRDracoMeshCompression, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen, KHRMaterialsTransmission])
    .registerDependencies(decoderModule ? { 'draco3d.decoder': decoderModule } : {} as any);

  const writeIO = new NodeIO()
    .registerExtensions([KHRMaterialsVariants, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen, KHRMaterialsTransmission]); // exclude Draco

  let doc;
  if (isGlb) {
    doc = await readIO.readBinary(new Uint8Array(buffer));
    // Convert to JSON for variant baking/pruning
    const jsonOut: any = await readIO.writeJSON(doc as any);
    const gltf = (jsonOut as any).json || {};
    const resMap: Record<string, Uint8Array> = (jsonOut as any).resources || {};
    bakeActiveVariantInGltf(gltf, variantName);
    removeBasisUAndPrune(gltf);
    const filteredRes = filterResourcesForImages(resMap, gltf);
    doc = await readIO.readJSON({ json: gltf, resources: filteredRes } as any);
  } else {
    // GLTF JSON with external resources → fetch and pack into GLB
    const jsonText = buffer.toString('utf8');
    const gltf = JSON.parse(jsonText);
    const baseDir = sourceUrl.slice(0, sourceUrl.lastIndexOf('/'));
    const resourceMap: Record<string, Uint8Array> = {};
    const addResource = async (uri?: string) => {
      if (!uri || typeof uri !== 'string') return;
      if (uri.startsWith('data:')) return;
      const isAbsolute = /^https?:\/\//i.test(uri);
      const url = isAbsolute ? uri : joinUrl(baseDir, uri);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch resource ${uri}: ${res.status}`);
      const ab = await res.arrayBuffer();
      resourceMap[uri] = new Uint8Array(ab);
    };
    try { if (Array.isArray(gltf.buffers)) { for (const b of gltf.buffers) await addResource(b?.uri); } } catch {}
    try { if (Array.isArray(gltf.images)) { for (const img of gltf.images) await addResource(img?.uri); } } catch {}
    // Bake variant and prune before building Document
    bakeActiveVariantInGltf(gltf, variantName);
    removeBasisUAndPrune(gltf);
    const filteredRes = filterResourcesForImages(resourceMap, gltf);
    const jsonDoc: any = { json: gltf, resources: filteredRes };
    doc = await readIO.readJSON(jsonDoc);
  }

  // Strip Draco extension flags so writer won't require encoder.
  try {
    const root: any = (doc as any).getRoot?.();
    if (root) {
      for (const ext of root.listExtensionsUsed?.() || []) {
        if (ext?.extensionName === 'KHR_draco_mesh_compression') root.removeExtension(ext);
      }
      for (const ext of root.listExtensionsRequired?.() || []) {
        if (ext?.extensionName === 'KHR_draco_mesh_compression') root.removeExtension(ext);
      }
    }
  } catch {}

  const glb = await writeIO.writeBinary(doc);
  return Buffer.from(glb as Uint8Array);
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

    // Download original asset (GLB/GLTF)
    const srcBuf = await downloadFromCdn(sourceUrl);
    const isGlb = modelFilename.toLowerCase().endsWith('.glb');
    // Always stage as GLB to ensure embedded resources for Blender
    const bakedGlb = await convertToGlb(srcBuf, sourceUrl, isGlb, variantName || null);

    const jobId = generateJobId();
    const stagingPath = `${modelBase}/Renders/_staging/${jobId}.glb`;

    await uploadToBunny(stagingPath, bakedGlb, 'model/gltf-binary');

    const stagingUrl = `${basePublic}/${stagingPath}`;

    // Call remote worker
    const publicBase = process.env.RENDER_PUBLIC_BASE_URL;
    const callbackUrl = `${(publicBase ? publicBase.replace(/\/$/, '') : new URL(request.url).origin)}/api/render/callback/image`;
    // Derive hdr file name from client config (basename of hdrPath), pass to worker
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


