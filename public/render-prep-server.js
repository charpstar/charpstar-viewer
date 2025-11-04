'use strict';

const https = require('https');
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  next(err);
});

/* Env/config */
const PORT = process.env.RENDER_PREP_PORT || 8081;
const JOB_API_TOKEN = process.env.JOB_API_TOKEN || '';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const ZONE = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT || 'Client-Editor';
const CLIENTS_ALLOWLIST = (process.env.CLIENTS_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);

/* Auth */
function auth(req, res, next) {
  if (!JOB_API_TOKEN) return next();
  const hdr = req.headers['authorization'] || '';
  if (hdr === `Bearer ${JOB_API_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

/* Helpers */
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
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed: ${res.statusCode} ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

/* Routes */
app.get('/health', (req, res) => res.json({ ok: true, service: 'render-prep', time: new Date().toISOString() }));

/* Render preparation endpoint - converts GLTF to GLB with variant baking */
app.post('/jobs/render/prepare', auth, async (req, res) => {
  try {
    const { client, modelFilename, variantName } = req.body || {};
    if (!client || typeof client !== 'string' || !isClientAllowed(client)) {
      return res.status(400).json({ error: 'client is required/invalid' });
    }
    if (!modelFilename || typeof modelFilename !== 'string') {
      return res.status(400).json({ error: 'modelFilename is required' });
    }

    // Import gltf-transform dependencies
    const { NodeIO } = require('@gltf-transform/core');
    const { 
      KHRMaterialsVariants, 
      KHRDracoMeshCompression, 
      KHRTextureBasisu, 
      KHRTextureTransform, 
      KHRMaterialsSheen 
    } = require('@gltf-transform/extensions');
    const draco3d = require('draco3dgltf');

    const basePath = bunnyBasePathFor(client);
    const sourceUrl = `https://${PULL_ZONE_URL}/${basePath}/${encodeURIComponent(modelFilename)}`;
    
    console.log(`[PREP] Downloading ${sourceUrl}`);
    
    // Download source GLTF/GLB
    const srcRes = await fetch(sourceUrl);
    if (!srcRes.ok) throw new Error(`Failed to fetch source: ${srcRes.status}`);
    const srcBuf = Buffer.from(await srcRes.arrayBuffer());
    const isGlb = modelFilename.toLowerCase().endsWith('.glb');

    // Helper: bake variant into GLTF JSON
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
      } catch (e) {
        console.error('[PREP] Variant baking error:', e);
      }
    }

    // Helper: remove BasisU and prune unused resources
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
        if (Array.isArray(gltf.extensionsUsed)) {
          gltf.extensionsUsed = gltf.extensionsUsed.filter(n => n !== 'KHR_texture_basisu');
        }
        if (Array.isArray(gltf.extensionsRequired)) {
          gltf.extensionsRequired = gltf.extensionsRequired.filter(n => n !== 'KHR_texture_basisu');
        }
      } catch {}

      // Prune unused materials/textures/images/samplers
      try {
        const usedMaterials = new Set();
        (gltf.meshes || []).forEach(mesh => {
          (mesh.primitives || []).forEach(prim => {
            if (typeof prim.material === 'number') usedMaterials.add(prim.material);
          });
        });
        const oldToNewMat = {};
        const newMats = [];
        (gltf.materials || []).forEach((m, idx) => {
          if (usedMaterials.has(idx)) {
            oldToNewMat[idx] = newMats.length;
            newMats.push(m);
          }
        });
        (gltf.meshes || []).forEach(mesh => {
          (mesh.primitives || []).forEach(prim => {
            if (typeof prim.material === 'number' && prim.material in oldToNewMat) {
              prim.material = oldToNewMat[prim.material];
            }
          });
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

        const oldToNewTex = {};
        const newTextures = [];
        (gltf.textures || []).forEach((t, idx) => {
          if (usedTextures.has(idx)) {
            oldToNewTex[idx] = newTextures.length;
            newTextures.push(t);
          }
        });
        (gltf.materials || []).forEach(m => {
          const remap = ti => { if (ti && typeof ti.index === 'number' && ti.index in oldToNewTex) ti.index = oldToNewTex[ti.index]; };
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

        const usedImages = new Set();
        (gltf.textures || []).forEach(t => { if (typeof t.source === 'number') usedImages.add(t.source); });
        const oldToNewImg = {};
        const newImages = [];
        (gltf.images || []).forEach((img, idx) => {
          if (usedImages.has(idx)) {
            oldToNewImg[idx] = newImages.length;
            newImages.push(img);
          }
        });
        (gltf.textures || []).forEach(t => { if (typeof t.source === 'number' && t.source in oldToNewImg) t.source = oldToNewImg[t.source]; });
        gltf.images = newImages;

        const usedSamplers = new Set();
        (gltf.textures || []).forEach(t => { if (typeof t.sampler === 'number') usedSamplers.add(t.sampler); });
        const oldToNewSampler = {};
        const newSamplers = [];
        (gltf.samplers || []).forEach((s, idx) => {
          if (usedSamplers.has(idx)) {
            oldToNewSampler[idx] = newSamplers.length;
            newSamplers.push(s);
          }
        });
        (gltf.textures || []).forEach(t => { if (typeof t.sampler === 'number' && t.sampler in oldToNewSampler) t.sampler = oldToNewSampler[t.sampler]; });
        gltf.samplers = newSamplers;
      } catch (e) {
        console.error('[PREP] Pruning error:', e);
      }
    }

    function filterResourcesForImages(resources, gltf) {
      try {
        const keep = new Set();
        (gltf.images || []).forEach(img => {
          const uri = img?.uri;
          if (uri && typeof uri === 'string' && !uri.startsWith('data:')) keep.add(uri);
        });
        const filtered = {};
        Object.entries(resources || {}).forEach(([k, v]) => { if (keep.has(k)) filtered[k] = v; });
        return filtered;
      } catch { return resources; }
    }

    console.log('[PREP] Converting to GLB...');

    // Convert to GLB
    let decoderModule;
    if (draco3d?.createDecoderModule) {
      try {
        const locateFile = file => {
          const p1 = path.join(__dirname, 'node_modules', 'draco3dgltf', file);
          if (fs.existsSync(p1)) return p1;
          const p2 = path.join(path.dirname(require.resolve('draco3dgltf/package.json')), file);
          if (fs.existsSync(p2)) return p2;
          return file;
        };
        decoderModule = await draco3d.createDecoderModule({ locateFile });
      } catch (e) {
        console.error('[PREP] Draco decoder init error:', e);
      }
    }

    const readIO = new NodeIO()
      .registerExtensions([KHRMaterialsVariants, KHRDracoMeshCompression, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen])
      .registerDependencies(decoderModule ? { 'draco3d.decoder': decoderModule } : {});

    const writeIO = new NodeIO()
      .registerExtensions([KHRMaterialsVariants, KHRTextureBasisu, KHRTextureTransform, KHRMaterialsSheen]);

    let doc;
    if (isGlb) {
      doc = await readIO.readBinary(new Uint8Array(srcBuf));
      const jsonOut = await readIO.writeJSON(doc);
      const gltf = jsonOut.json || {};
      const resMap = jsonOut.resources || {};
      bakeActiveVariantInGltf(gltf, variantName);
      removeBasisUAndPrune(gltf);
      const filteredRes = filterResourcesForImages(resMap, gltf);
      doc = await readIO.readJSON({ json: gltf, resources: filteredRes });
    } else {
      const jsonText = srcBuf.toString('utf8');
      const gltf = JSON.parse(jsonText);
      const baseDir = sourceUrl.slice(0, sourceUrl.lastIndexOf('/'));
      const resourceMap = {};
      const addResource = async uri => {
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
      removeBasisUAndPrune(gltf);
      const filteredRes = filterResourcesForImages(resourceMap, gltf);
      doc = await readIO.readJSON({ json: gltf, resources: filteredRes });
    }

    // Strip Draco extension flags
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

    const glb = await writeIO.writeBinary(doc);
    const glbBuffer = Buffer.from(glb);

    console.log(`[PREP] GLB size: ${glbBuffer.length} bytes`);

    // Generate job ID and upload to staging
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const stagingPath = `${basePath}/Renders/_staging/${jobId}.glb`;
    
    console.log(`[PREP] Uploading to ${stagingPath}`);
    
    await uploadToBunnyStorage(stagingPath, glbBuffer, 'model/gltf-binary');
    const stagingUrl = `https://${PULL_ZONE_URL}/${stagingPath}`;

    console.log(`[PREP] Success: ${stagingUrl}`);

    return res.json({ jobId, stagingUrl });
  } catch (e) {
    console.error('[PREP] Render prepare failed:', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to prepare render' });
  }
});

app.listen(PORT, () => {
  console.log(`Render prep service listening on :${PORT}`);
});


