'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  next(err);
});

/* Env/config */
const PORT = process.env.PORT || 8080;
const JOB_API_TOKEN = process.env.JOB_API_TOKEN || '';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const ZONE = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT || 'Client-Editor';
const CLIENTS_ALLOWLIST = (process.env.CLIENTS_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);

/* Jobs storage */
const JOBS_DIR = path.join(__dirname, 'jobs');
fs.mkdirSync(JOBS_DIR, { recursive: true });

// On boot, mark running jobs as terminated so UI never stalls
try {
  const files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const p = path.join(JOBS_DIR, f);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && (j.status === 'queued' || j.status === 'running')) {
      j.status = 'terminated';
      j.completedAt = new Date().toISOString();
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    }
  }
} catch {}

/* Concurrency lock and cancel */
const runningByClient = new Map(); // clientName -> jobId
const cancelByJobId = new Set();   // jobId in cancel state

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
function jobFile(jobId) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}
function saveJob(job) {
  fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
}
function loadJob(jobId) {
  const f = jobFile(jobId);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
async function purgeCache(fileUrl) {
  try {
    const res = await fetch('https://api.bunny.net/purge?async=false', {
      method: 'POST',
      headers: { AccessKey: process.env.BUNNY_API_KEY || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [fileUrl] }),
    });
    if (!res.ok) console.warn('Cache purge warning:', res.status);
  } catch (e) {
    console.error('Error purging cache:', e);
  }
}
async function fetchGltfJson(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error('Empty response');
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error(`JSON parse error for ${url}:`, e.message);
        console.error(`Response length: ${text.length} bytes`);
        console.error(`First 200 chars: ${text.substring(0, 200)}`);
        console.error(`Last 200 chars: ${text.substring(Math.max(0, text.length - 200))}`);
        throw new Error(`Invalid JSON: ${e.message}`);
      }
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        console.log(`Retry ${attempt + 1}/${retries} for ${url}: ${e.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${lastError.message}`);
}
function uploadToBunnyStorage(storagePath, content, contentType = 'model/gltf+json') {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${ZONE}/${storagePath}`,
      headers: { AccessKey: ACCESS_KEY, 'Content-Type': contentType, 'Content-Length': buffer.length },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 201) resolve();
      else reject(new Error(`Upload failed: ${res.statusCode}`));
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

/* GLTF JSON utils */
function ensureArrays(obj) {
  obj.images = Array.isArray(obj.images) ? obj.images : (obj.images = []);
  obj.textures = Array.isArray(obj.textures) ? obj.textures : (obj.textures = []);
  obj.samplers = Array.isArray(obj.samplers) ? obj.samplers : (obj.samplers = []);
  obj.materials = Array.isArray(obj.materials) ? obj.materials : (obj.materials = []);
  obj.meshes = Array.isArray(obj.meshes) ? obj.meshes : (obj.meshes = []);
  obj.extensions = obj.extensions || {};
}
const toLower = (s) => (s ? String(s).toLowerCase() : s);
const baseName = (s) => (s && s.includes('.') ? s.replace(/\.[^.]+$/, '') : s);
const stripImagesPrefix = (uri) => (uri && uri.startsWith('images/') ? uri.slice(7) : uri);
function findImageIndexByKey(obj, keyRaw) {
  const key = toLower(keyRaw);
  for (let i = 0; i < obj.images.length; i++) {
    const img = obj.images[i];
    const uri = toLower(stripImagesPrefix(img?.uri));
    const name = toLower(img?.name);
    const uriBase = toLower(baseName(uri));
    const nameBase = toLower(baseName(name));
    if (uri === key || name === key || uriBase === key || nameBase === key) return i;
  }
  return undefined;
}
function guessMime(fname) {
  const lower = (fname || '').toLowerCase();
  if (lower.endsWith('.ktx2')) return 'image/ktx2';
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}
function getOrAddImage(obj, filename) {
  const existing =
    findImageIndexByKey(obj, filename) ??
    findImageIndexByKey(obj, stripImagesPrefix(filename) || '') ??
    findImageIndexByKey(obj, baseName(filename) || '');
  if (existing !== undefined) return existing;
  const clean = stripImagesPrefix(filename) || filename;
  const idx = obj.images.length;
  obj.images.push({ uri: `images/${clean}`, name: baseName(clean), mimeType: guessMime(clean) });
  return idx;
}
function findTextureForImage(obj, imageIndex) {
  for (let i = 0; i < obj.textures.length; i++) {
    if (obj.textures[i]?.source === imageIndex) return i;
  }
  return undefined;
}
function getOrAddTextureForImage(obj, imageIndex) {
  const exist = findTextureForImage(obj, imageIndex);
  if (exist !== undefined) return exist;
  const idx = obj.textures.length;
  const tex = { source: imageIndex };
  if (obj.samplers.length > 0) tex.sampler = 0;
  obj.textures.push(tex);
  return idx;
}
function getRefTexKey(ref, texIndex) {
  if (typeof texIndex !== 'number') return undefined;
  const tex = Array.isArray(ref.textures) ? ref.textures[texIndex] : undefined;
  const img = tex && typeof tex.source === 'number' && Array.isArray(ref.images) ? ref.images[tex.source] : undefined;
  const key = img?.uri || img?.name;
  if (!key) return undefined;
  return key.startsWith('images/') ? key.substring(7) : key;
}
function applySlotRaw(outObj, outMat, slotPath, texKey, transformSrc, usedTextureTransformRef, slotName) {
  if (!texKey) return;
  const cleanKey = stripImagesPrefix(texKey) || texKey;
  const candidates = /\.[A-Za-z0-9]{2,5}$/.test(cleanKey) ? [cleanKey] : [`${cleanKey}.ktx2`, `${cleanKey}.jpg`, `${cleanKey}.jpeg`, `${cleanKey}.png`, cleanKey];
  let imageIndex;
  for (const cand of candidates) {
    const idx = findImageIndexByKey(outObj, cand);
    if (idx !== undefined) { imageIndex = idx; break; }
  }
  if (imageIndex === undefined) imageIndex = getOrAddImage(outObj, candidates[0]);
  const texIndex = getOrAddTextureForImage(outObj, imageIndex);

  // Walk path
  let target = outMat;
  for (let i = 0; i < slotPath.length - 1; i++) {
    const key = slotPath[i];
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
    target = target[key];
  }
  const lastKey = slotPath[slotPath.length - 1];
  if (typeof target[lastKey] !== 'object' || target[lastKey] === null) target[lastKey] = { index: texIndex };
  else target[lastKey].index = texIndex;

  // Preserve texCoord (UV set) from reference slot when present
  try {
    const tc = transformSrc && typeof transformSrc.texCoord === 'number' ? transformSrc.texCoord : undefined;
    if (tc !== undefined) {
      target[lastKey].texCoord = tc;
    }
  } catch {}

  // Preserve transform info from reference
  try {
    const xform = transformSrc?.extensions?.KHR_texture_transform;
    if (xform && typeof xform === 'object') {
      let scale = Array.isArray(xform.scale) ? [...xform.scale] : undefined;
      let rotation = typeof xform.rotation === 'number' ? xform.rotation : undefined;
      const offset = Array.isArray(xform.offset) ? xform.offset : undefined;
      // For normal maps, enforce non-negative tiling to avoid unintended Y inversion
      if (slotName === 'normalTexture') {
        if (Array.isArray(scale)) scale = [Math.abs(scale[0]), Math.abs(scale[1])];
        // Note: Rotation is now preserved for normal maps
      }
      if (scale || rotation !== undefined || offset) {
        target[lastKey].extensions = target[lastKey].extensions || {};
        target[lastKey].extensions.KHR_texture_transform = target[lastKey].extensions.KHR_texture_transform || {};
        if (scale) target[lastKey].extensions.KHR_texture_transform.scale = [...scale];
        if (rotation !== undefined) target[lastKey].extensions.KHR_texture_transform.rotation = rotation;
        if (offset) target[lastKey].extensions.KHR_texture_transform.offset = [...offset];
        usedTextureTransformRef.used = true;
      }
    }
  } catch {}
}

/* Apply reference materials into target GLTF; cooperative cancel via shouldCancel() */
async function applyReferenceToTarget(clientName, filename, shouldCancel) {
  const basePath = bunnyBasePathFor(clientName);
  const refUrl = `https://${PULL_ZONE_URL}/${basePath}/reference/reference.gltf`;
  const tgtUrl = `https://${PULL_ZONE_URL}/${basePath}/${filename}`;
  if (shouldCancel()) throw new Error('Cancelled');

  const refJson = await fetchGltfJson(refUrl);
  if (shouldCancel()) throw new Error('Cancelled');
  const tgtJson = await fetchGltfJson(tgtUrl);

  // Validate basic glTF structure
  if (!tgtJson || typeof tgtJson !== 'object') {
    throw new Error(`Target glTF is not a valid object: ${filename}`);
  }
  if (!refJson || typeof refJson !== 'object') {
    throw new Error('Reference glTF is not a valid object');
  }

  if (['materials', 'textures', 'images'].some((k) => typeof refJson[k] === 'string')) {
    throw new Error('Reference glTF must embed materials/textures/images arrays');
  }

  const out = structuredClone(tgtJson);
  ensureArrays(out);

  // AO selection in target
  let aoImageIndex;
  try {
    if (Array.isArray(out.images) && out.images.length > 0) {
      const idxByName = out.images.findIndex((img) => `${img?.name || ''} ${img?.uri || ''}`.toLowerCase().includes('ao'));
      aoImageIndex = idxByName >= 0 ? idxByName : 0;
    }
  } catch {}
  const aoTexIndex = typeof aoImageIndex === 'number' ? getOrAddTextureForImage(out, aoImageIndex) : undefined;

  // Build target materials from reference
  const refMaterials = Array.isArray(refJson.materials) ? refJson.materials : [];
  const refMaterialNames = refMaterials.map((m, idx) =>
    (m && typeof m.name === 'string' && m.name.length > 0) ? m.name : `Mat_${idx}`
  );
  const refMeshBaseAssignments = new Map();
  const refMeshes = Array.isArray(refJson.meshes) ? refJson.meshes : [];
  refMeshes.forEach((mesh, meshIdx) => {
    if (!Array.isArray(mesh?.primitives)) return;
    const meshName = typeof mesh?.name === 'string' && mesh.name.length > 0 ? mesh.name : `Mesh_${meshIdx}`;
    const desiredMaterials = mesh.primitives.map((prim) => {
      const matIdx = typeof prim?.material === 'number' ? prim.material : undefined;
      if (typeof matIdx !== 'number') return undefined;
      return refMaterialNames[matIdx];
    });
    refMeshBaseAssignments.set(meshName, desiredMaterials);
  });
  const newMaterials = [];
  const usedTextureTransformRef = { used: false };

  for (let idx = 0; idx < refMaterials.length; idx++) {
    if (shouldCancel()) throw new Error('Cancelled');
    const rmat = refMaterials[idx];
    const name = typeof rmat?.name === 'string' ? rmat.name : `Mat_${idx}`;
    const pbrR = rmat?.pbrMetallicRoughness || {};
    const tgtMat = { name, pbrMetallicRoughness: {} };

    tgtMat.pbrMetallicRoughness.baseColorFactor = Array.isArray(pbrR.baseColorFactor) ? [...pbrR.baseColorFactor] : [1, 1, 1, 1];
    tgtMat.pbrMetallicRoughness.metallicFactor = typeof pbrR.metallicFactor === 'number' ? pbrR.metallicFactor : 1;
    tgtMat.pbrMetallicRoughness.roughnessFactor = typeof pbrR.roughnessFactor === 'number' ? pbrR.roughnessFactor : 1;
    tgtMat.emissiveFactor = Array.isArray(rmat.emissiveFactor) ? [...rmat.emissiveFactor] : [0, 0, 0];
    if (typeof rmat.alphaMode === 'string') tgtMat.alphaMode = rmat.alphaMode;
    if (typeof rmat.alphaCutoff === 'number') tgtMat.alphaCutoff = rmat.alphaCutoff;

    const baseKey = getRefTexKey(refJson, pbrR.baseColorTexture?.index);
    if (baseKey) applySlotRaw(out, tgtMat, ['pbrMetallicRoughness', 'baseColorTexture'], baseKey, pbrR.baseColorTexture, usedTextureTransformRef, 'baseColorTexture');

    const mrKey = getRefTexKey(refJson, pbrR.metallicRoughnessTexture?.index);
    if (mrKey) applySlotRaw(out, tgtMat, ['pbrMetallicRoughness', 'metallicRoughnessTexture'], mrKey, pbrR.metallicRoughnessTexture, usedTextureTransformRef, 'metallicRoughnessTexture');

    const nKey = getRefTexKey(refJson, rmat.normalTexture?.index);
    if (nKey) {
      applySlotRaw(out, tgtMat, ['normalTexture'], nKey, rmat.normalTexture, usedTextureTransformRef, 'normalTexture');
      if (typeof rmat.normalTexture?.scale === 'number') {
        const nScaleVal = Math.abs(rmat.normalTexture.scale);
        tgtMat.normalTexture = tgtMat.normalTexture || { index: tgtMat.normalTexture?.index };
        tgtMat.normalTexture.scale = nScaleVal;
      }
    }

    if (typeof aoTexIndex === 'number') {
      tgtMat.occlusionTexture = { index: aoTexIndex, texCoord: 1 };
      if (typeof rmat.occlusionTexture?.strength === 'number') {
        tgtMat.occlusionTexture.strength = rmat.occlusionTexture.strength;
      }
    }

    const eKey = getRefTexKey(refJson, rmat.emissiveTexture?.index);
    if (eKey) applySlotRaw(out, tgtMat, ['emissiveTexture'], eKey, rmat.emissiveTexture, usedTextureTransformRef, 'emissiveTexture');

    const sRef = rmat?.extensions?.KHR_materials_sheen;
    if (sRef) {
      tgtMat.extensions = tgtMat.extensions || {};
      const sTgt = (tgtMat.extensions.KHR_materials_sheen = tgtMat.extensions.KHR_materials_sheen || {});
      if (typeof sRef.sheenRoughnessFactor === 'number') sTgt.sheenRoughnessFactor = sRef.sheenRoughnessFactor;
      if (Array.isArray(sRef.sheenColorFactor)) sTgt.sheenColorFactor = [...sRef.sheenColorFactor];
      const srKey = getRefTexKey(refJson, sRef.sheenRoughnessTexture?.index);
      const scKey = getRefTexKey(refJson, sRef.sheenColorTexture?.index);
        if (srKey) applySlotRaw(out, { extensions: { KHR_materials_sheen: sTgt } }, ['extensions', 'KHR_materials_sheen', 'sheenRoughnessTexture'], srKey, sRef.sheenRoughnessTexture, usedTextureTransformRef, 'sheenRoughnessTexture');
        if (scKey) applySlotRaw(out, { extensions: { KHR_materials_sheen: sTgt } }, ['extensions', 'KHR_materials_sheen', 'sheenColorTexture'], scKey, sRef.sheenColorTexture, usedTextureTransformRef, 'sheenColorTexture');
    }

    newMaterials.push(tgtMat);
  }

  // 1) Replace materials
  const oldMaterials = Array.isArray(tgtJson.materials) ? tgtJson.materials : [];
  const oldIndexToName = oldMaterials.map(m => (m && typeof m.name === 'string') ? m.name : undefined);
  out.materials = newMaterials;

  // 2) Remap primitive.material indices by name (old -> new)
  const nameToNewIndex = new Map();
  (Array.isArray(out.materials) ? out.materials : []).forEach((m, idx) => { if (m && m.name) nameToNewIndex.set(m.name, idx); });
  (Array.isArray(out.meshes) ? out.meshes : []).forEach((mesh) => {
    (Array.isArray(mesh.primitives) ? mesh.primitives : []).forEach((prim) => {
      const oldIdx = prim?.material;
      if (typeof oldIdx === 'number') {
        const oldName = oldIndexToName[oldIdx];
        const newIdx = oldName ? nameToNewIndex.get(oldName) : undefined;
        prim.material = (typeof newIdx === 'number') ? newIdx : 0;
      }
    });
  });

  // 2b) Apply reference default material assignments by mesh name (handles non-variant mesh additions)
  try {
    const outMaterialsArr = Array.isArray(out.materials) ? out.materials : [];
    const outMaterialNamesByIndex = outMaterialsArr.map((m) => (m && typeof m.name === 'string') ? m.name : undefined);
    (Array.isArray(out.meshes) ? out.meshes : []).forEach((mesh, meshIdx) => {
      const meshName = typeof mesh?.name === 'string' && mesh.name.length > 0 ? mesh.name : `Mesh_${meshIdx}`;
      const desiredMaterialNames = refMeshBaseAssignments.get(meshName);
      if (!Array.isArray(desiredMaterialNames) || desiredMaterialNames.length === 0) return;
      const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
      prims.forEach((prim, primIdx) => {
        const desiredName = desiredMaterialNames[primIdx];
        if (!desiredName) return;
        const newIdx = nameToNewIndex.get(desiredName);
        if (typeof newIdx !== 'number') return;
        const currentIdx = typeof prim?.material === 'number' ? prim.material : undefined;
        const currentName = typeof currentIdx === 'number' ? outMaterialNamesByIndex[currentIdx] : undefined;
        if (currentName === desiredName) return;
        prim.material = newIdx;
      });
    });
  } catch {}

  // 3) Remap KHR_materials_variants mapping.material indices by name (preserve variant names and per-variant assignments)
  try {
    const meshes = Array.isArray(out.meshes) ? out.meshes : [];
    meshes.forEach((mesh) => {
      const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
      prims.forEach((prim) => {
        const maps = prim?.extensions?.KHR_materials_variants?.mappings;
        if (!Array.isArray(maps)) return;
        maps.forEach((map) => {
          const oldIdx = map?.material;
          if (typeof oldIdx === 'number') {
            const oldName = oldIndexToName[oldIdx]; // from step (1) above
            const newIdx = oldName ? nameToNewIndex.get(oldName) : undefined; // from step (2) above
            map.material = (typeof newIdx === 'number') ? newIdx : 0;
          }
        });
      });
    });

    // Ensure extension is flagged as used
    out.extensionsUsed = Array.isArray(out.extensionsUsed) ? out.extensionsUsed : [];
    if (!out.extensionsUsed.includes('KHR_materials_variants')) out.extensionsUsed.push('KHR_materials_variants');
  } catch {}

  // 3b) Ensure occlusionTexture.strength default when AO texture exists but strength missing
  try {
    (Array.isArray(out.materials) ? out.materials : []).forEach((m) => {
      const hasAO = typeof m?.occlusionTexture?.index === 'number';
      const hasStrength = typeof m?.occlusionTexture?.strength === 'number';
      if (hasAO && !hasStrength) {
        m.occlusionTexture = m.occlusionTexture || {};
        m.occlusionTexture.strength = 1;
      }
    });
  } catch {}

  // 4) Copy reference variant mappings additively (preserve existing variant names; add missing variants by name)
  try {
    const refKmv = refJson?.extensions?.KHR_materials_variants;
    const refVariants = Array.isArray(refKmv?.variants) ? refKmv.variants : [];
    if (refVariants.length > 0 && Array.isArray(refJson.meshes) && Array.isArray(out.meshes)) {
      // Build ref variant index -> name
      const refVarIdxToName = new Map();
      refVariants.forEach((v, i) => { if (v && typeof v.name === 'string') refVarIdxToName.set(i, v.name); });

      // Ensure target variants root exists and build name -> index map without renaming
      out.extensions = out.extensions || {};
      const tgtKmv = (out.extensions.KHR_materials_variants = out.extensions.KHR_materials_variants || { variants: [] });
      tgtKmv.variants = Array.isArray(tgtKmv.variants) ? tgtKmv.variants : [];
      const tgtVarNameToIdx = new Map();
      tgtKmv.variants.forEach((v, i) => { if (v && typeof v.name === 'string') tgtVarNameToIdx.set(v.name, i); });

      // Helper: get or add target variant index by name (add-only)
      const ensureTgtVarIndex = (varName) => {
        let idx = tgtVarNameToIdx.get(varName);
        if (typeof idx === 'number') return idx;
        tgtKmv.variants.push({ name: varName });
        idx = tgtKmv.variants.length - 1;
        tgtVarNameToIdx.set(varName, idx);
        return idx;
      };

      // Walk reference meshes/primitives and replicate mappings by mesh name
      const refMaterialsArr = Array.isArray(refJson.materials) ? refJson.materials : [];
      const refIndexToName = new Map();
      refMaterialsArr.forEach((m, i) => { if (m && typeof m.name === 'string') refIndexToName.set(i, m.name); });

      const tgtNameToIndex = new Map();
      (Array.isArray(out.materials) ? out.materials : []).forEach((m, i) => { if (m && typeof m.name === 'string') tgtNameToIndex.set(m.name, i); });

      out.meshes.forEach((tMesh, meshIndex) => {
        const meshName = typeof tMesh?.name === 'string' && tMesh.name.length > 0 ? tMesh.name : `Mesh_${meshIndex}`;
        // Find reference mesh with same name
        const rMesh = refJson.meshes.find((rm, rIdx) => {
          const nm = typeof rm?.name === 'string' && rm.name.length > 0 ? rm.name : `Mesh_${rIdx}`;
          return nm === meshName;
        });
        if (!rMesh || !Array.isArray(rMesh.primitives) || !Array.isArray(tMesh?.primitives)) return;

        // For each target primitive, add mappings mirrored from any reference primitive (best-effort name-based)
        tMesh.primitives.forEach((tPrim) => {
          const rMaps = [];
          rMesh.primitives.forEach((rPrim) => {
            const maps = rPrim?.extensions?.KHR_materials_variants?.mappings;
            if (Array.isArray(maps)) rMaps.push(...maps);
          });
          if (rMaps.length === 0) return;

          tPrim.extensions = tPrim.extensions || {};
          tPrim.extensions.KHR_materials_variants = tPrim.extensions.KHR_materials_variants || {};
          const ext = tPrim.extensions.KHR_materials_variants;
          ext.mappings = Array.isArray(ext.mappings) ? ext.mappings : [];

          rMaps.forEach((rMap) => {
            const refMatIdx = rMap?.material;
            const refMatName = typeof refMatIdx === 'number' ? refIndexToName.get(refMatIdx) : undefined;
            if (!refMatName) return;
            const tgtMatIdx = tgtNameToIndex.get(refMatName);
            if (typeof tgtMatIdx !== 'number') return;

            // Convert ref variant indices to target variant indices by name
            const outVarIdxs = [];
            const rVars = Array.isArray(rMap?.variants) ? rMap.variants : [];
            rVars.forEach((vi) => {
              const vName = refVarIdxToName.get(vi);
              if (typeof vName === 'string' && vName.length > 0) {
                const tIdx = ensureTgtVarIndex(vName);
                outVarIdxs.push(tIdx);
              }
            });
            if (outVarIdxs.length === 0) return;

            // Add or merge mapping for this material
            const existing = ext.mappings.find((m) => m && typeof m.material === 'number' && m.material === tgtMatIdx);
            if (existing) {
              existing.variants = Array.isArray(existing.variants) ? existing.variants : [];
              outVarIdxs.forEach((v) => { if (!existing.variants.includes(v)) existing.variants.push(v); });
            } else {
              ext.mappings.push({ material: tgtMatIdx, variants: outVarIdxs });
            }
          });
        });
      });

      // Mark extension used
      out.extensionsUsed = Array.isArray(out.extensionsUsed) ? out.extensionsUsed : [];
      if (!out.extensionsUsed.includes('KHR_materials_variants')) out.extensionsUsed.push('KHR_materials_variants');
    }
  } catch {}

  // Ensure KHR_texture_transform listed if used
  try {
    if (usedTextureTransformRef.used) {
      out.extensionsUsed = Array.isArray(out.extensionsUsed) ? out.extensionsUsed : [];
      if (!out.extensionsUsed.includes('KHR_texture_transform')) out.extensionsUsed.push('KHR_texture_transform');
    }
  } catch {}

  // Cleanup optional empty arrays to satisfy strict validators
  try {
    if (Array.isArray(out.samplers) && out.samplers.length === 0) delete out.samplers;
    if (Array.isArray(out.textures) && out.textures.length === 0) delete out.textures;
    // keep images unless truly empty
    if (Array.isArray(out.images) && out.images.length === 0) delete out.images;
  } catch {}

  // Upload
  const storagePath = `${bunnyBasePathFor(clientName)}/${filename}`;
  await uploadToBunnyStorage(storagePath, JSON.stringify(out, null, 2), 'model/gltf+json');
  const finalUrl = `https://${PULL_ZONE_URL}/${storagePath}`;
  await purgeCache(finalUrl);
  return { success: true, url: finalUrl };
}

/* List models from Bunny Storage */
async function listModels(clientName) {
  const basePath = bunnyBasePathFor(clientName);
  const url = `https://${HOSTNAME}/${ZONE}/${basePath}/`;
  const res = await fetch(url, { headers: { AccessKey: ACCESS_KEY } });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const json = await res.json();
  const files = Array.isArray(json) ? json : [];
  return files
    .map((e) => (e && e.ObjectName ? e.ObjectName.split('/').pop() : null))
    .filter((n) => typeof n === 'string' && (n.endsWith('.gltf') || n.endsWith('.glb')));
}

/* Logs */
function makeJobLog(job) {
  const lines = [];
  lines.push(`Client: ${job.client}`);
  lines.push(`Job: ${job.id}`);
  lines.push(`Status: ${job.status}`);
  lines.push(`Started: ${job.createdAt}`);
  lines.push(`Completed: ${job.completedAt || ''}`);
  lines.push(`Totals: done=${job.done} failed=${job.failed} total=${job.total}`);
  lines.push('');
  lines.push('Files:');
  (job.processedFiles || []).forEach((f) => {
    const ok = f.status === 'success' ? 'OK' : f.status === 'failed' ? 'FAIL' : 'PENDING';
    const err = f.error ? ` - ${f.error}` : '';
    lines.push(`${ok} ${f.filename}${err}`);
  });
  return lines.join('\n');
}
async function uploadLogAndAttach(job) {
  const content = makeJobLog(job);
  const basePath = bunnyBasePathFor(job.client);
  const stamp = new Date(job.completedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  const relPath = `${basePath}/logs/apply-${stamp}.txt`;
  await uploadToBunnyStorage(relPath, content, 'text/plain; charset=utf-8');
  await purgeCache(`https://${PULL_ZONE_URL}/${relPath}`);
  job.logUrl = `https://${PULL_ZONE_URL}/${relPath}`;
  saveJob(job);
}

/* Run job; check cancel frequently */
async function runApplyJob(jobId, clientName, targets) {
  try {
    let job = loadJob(jobId);
    if (!job) return;

    job.status = 'running';
    saveJob(job);

    const shouldCancel = () => cancelByJobId.has(jobId) || (loadJob(jobId)?.status === 'cancelled');

    for (const filename of targets) {
      if (shouldCancel()) { job.status = 'cancelled'; saveJob(job); break; }
      if (!/\.gltf$/i.test(filename || '')) continue;

      job = loadJob(jobId);
      if (!job) return;
      if (job.status === 'cancelled') break;

      const entry = { filename, status: 'processing' };
      job.processedFiles.push(entry);
      saveJob(job);

      try {
        const result = await applyReferenceToTarget(clientName, filename, shouldCancel);
        if (shouldCancel()) { throw new Error('Cancelled'); }
        entry.status = 'success';
        entry.url = result.url;
        job.done += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Apply failed';
        entry.status = 'failed';
        entry.error = msg;
        if (msg !== 'Cancelled') job.failed += 1;
        if (msg === 'Cancelled') job.status = 'cancelled';
      }

      saveJob(job);
      if (job.status === 'cancelled') break;
    }

    job = loadJob(jobId);
    if (!job) return;
    if (job.status !== 'cancelled') job.status = 'completed';
    job.completedAt = new Date().toISOString();
    saveJob(job);
    await uploadLogAndAttach(job);
  } finally {
    const job = loadJob(jobId);
    if (job && job.client) runningByClient.delete(job.client);
    cancelByJobId.delete(jobId);
  }
}

/* Routes */
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/jobs/apply/start', auth, async (req, res) => {
  try {
    const { client, targets } = req.body || {};
    if (!client || typeof client !== 'string' || !isClientAllowed(client)) {
      return res.status(400).json({ error: 'client is required/invalid' });
    }

    if (runningByClient.has(client)) {
      const existingId = runningByClient.get(client);
      const existing = existingId ? loadJob(existingId) : null;
      return res.json({ jobId: existingId, total: existing?.total ?? 0, alreadyRunning: true });
    }

    const modelListRaw = Array.isArray(targets) && targets.length > 0 ? targets : await listModels(client);
    const modelList = modelListRaw.map(fn => (typeof fn === 'string' ? fn.trim() : ''))
                                  .filter(fn => fn && /\.gltf$/i.test(fn));
    if (modelList.length === 0) return res.status(400).json({ error: 'No .gltf models found for client' });

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job = { id: jobId, client, total: modelList.length, done: 0, failed: 0, processedFiles: [], createdAt: new Date().toISOString(), status: 'queued' };
    saveJob(job);

    runningByClient.set(client, jobId);
    (async () => { try { await runApplyJob(jobId, client, modelList); } catch {} })();

    return res.json({ jobId, total: job.total });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to start job' });
  }
});

app.get('/jobs/apply/status', auth, (req, res) => {
  const jobId = String(req.query.jobId || '');
  if (!jobId) return res.status(400).json({ error: 'jobId is required' });
  const job = loadJob(jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  return res.json(job);
});

app.get('/jobs/apply/client-status', auth, (req, res) => {
  const client = String(req.query.client || '');
  if (!client || !isClientAllowed(client)) return res.status(400).json({ error: 'invalid client' });
  const jobId = runningByClient.get(client) || null;
  const active = !!jobId;
  return res.json({ active, jobId });
});

app.post('/jobs/apply/cancel', auth, async (req, res) => {
  try {
    const { jobId } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = loadJob(String(jobId));
    if (!job) return res.status(404).json({ error: 'job not found' });

    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    try {
      job.processedFiles = Array.isArray(job.processedFiles) ? job.processedFiles : [];
      if (!job.processedFiles.some(f => f && f.filename === 'Cancelled by user')) {
        job.processedFiles.push({ filename: 'Cancelled by user', status: 'failed', error: 'Cancelled' });
      }
    } catch {}
    saveJob(job);
    cancelByJobId.add(jobId);
    if (job.client) runningByClient.delete(job.client);

    if (typeof job.logUrl === 'string' && job.logUrl.length > 0) {
      return res.json({ success: true, logUrl: job.logUrl });
    }
    await uploadLogAndAttach(job);
    return res.json({ success: true, logUrl: job.logUrl });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to cancel job' });
  }
});

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
      } catch {}
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
      } catch {}
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
      } catch {}
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

    // Generate job ID and upload to staging
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const stagingPath = `${basePath}/Renders/_staging/${jobId}.glb`;
    await uploadToBunnyStorage(stagingPath, glbBuffer, 'model/gltf-binary');
    const stagingUrl = `https://${PULL_ZONE_URL}/${stagingPath}`;

    return res.json({ jobId, stagingUrl });
  } catch (e) {
    console.error('Render prepare failed:', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to prepare render' });
  }
});

app.listen(PORT, () => {
  console.log(`Apply service listening on :${PORT}`);
});