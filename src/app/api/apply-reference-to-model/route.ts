import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getClientConfig } from '@/config/clientConfig';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  return { zoneName };
};

const purgeCache = async (fileUrl: string): Promise<void> => {
  try {
    const purgeResponse = await fetch('https://api.bunny.net/purge?async=false', {
      method: 'POST',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: [fileUrl] })
    });
    if (!purgeResponse.ok) {
      console.warn(`Cache purge warning: ${purgeResponse.status}`);
    }
  } catch (error) {
    console.error('Error purging cache:', error);
  }
};

async function fetchGltfJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch glTF: ${res.status}`);
  const text = await res.text();
  return JSON.parse(text);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client: string | undefined = body?.client;
    const target: string | undefined = body?.target; // relative path under client models dir, e.g. 'Temp/ModelX.gltf'
    const revertToBackup: string | undefined = body?.revertToBackup; // optional backup file name to restore reference.gltf
    if (!client || !target) return NextResponse.json({ error: 'client and target are required' }, { status: 400 });

    const clientConfig = getClientConfig(client);
    const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.referencePath}`;

    // Compute target URL from publicBaseUrl + modelPath
    const base = (clientConfig as any).bunnyCdn?.publicBaseUrl?.replace(/\/$/, '') || 'https://cdn.charpstar.net';
    const modelRoot = (clientConfig as any).bunnyCdn?.modelPath?.replace(/\/$/, '') || '';
    const targetUrl = `${base}/${modelRoot}/${target.replace(/^\/+/, '')}`;

    // If revertToBackup is provided, first restore the backup to the active reference.gltf
    if (revertToBackup && typeof revertToBackup === 'string') {
      // Copy from backups folder to reference/reference.gltf
      const zoneName = getStorageZoneDetails().zoneName;
      const backupDir = clientConfig.bunnyCdn.backupsPath.replace(/\/$/, '');
      const backupPath = `${backupDir}/${revertToBackup}`;
      const destPath = `${clientConfig.bunnyCdn.referencePath}`;
      // Download backup via pull zone then upload to storage (avoids signed storage GET)
      const backupResp = await fetch(`https://${BUNNY_PULL_ZONE_URL}/${backupPath}`);
      if (!backupResp.ok) return NextResponse.json({ error: 'Failed to fetch backup file' }, { status: 400 });
      const content = await backupResp.text();
      // Upload
      await new Promise<void>((resolve, reject) => {
        const buffer = Buffer.from(content);
        const options = {
          method: 'PUT',
          host: HOSTNAME,
          path: `/${zoneName}/${destPath}`,
          headers: {
            AccessKey: ACCESS_KEY,
            'Content-Type': 'model/gltf+json',
            'Content-Length': buffer.length,
          },
        } as const;
        const req = https.request(options, (res) => {
          if (res.statusCode === 200 || res.statusCode === 201) resolve();
          else reject(new Error(`Restore failed: ${res.statusCode}`));
        });
        req.on('error', reject);
        req.write(buffer);
        req.end();
      });
      await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${destPath}`);
    }

    // Load reference and target
    const refJson = await fetchGltfJson(referenceUrl);
    const tgtJson = await fetchGltfJson(targetUrl);

    if (typeof (refJson as any).materials === 'string' ||
        typeof (refJson as any).textures === 'string' ||
        typeof (refJson as any).images === 'string') {
      return NextResponse.json({ error: 'Reference glTF must embed materials/textures/images arrays' }, { status: 400 });
    }

    // Work on raw JSON objects for robust handling without Draco decoder
    const out = structuredClone(tgtJson);

    // Helpers to map images across target by keys (uri/name/base)
    const normalizeKey = (key?: string | null): string | undefined => {
      if (!key) return undefined;
      return key.startsWith('images/') ? key.substring(7) : key;
    };
    const stripExt = (s?: string) => (s && s.includes('.') ? s.replace(/\.[^.]+$/, '') : s);
    // Utilities over raw JSON
    const toLower = (s?: string) => (s ? s.toLowerCase() : s);
    const stripImagesPrefix = (uri?: string) => (uri?.startsWith('images/') ? uri.slice(7) : uri);
    const baseName = (s?: string) => (s && s.includes('.') ? s.replace(/\.[^.]+$/, '') : s);

    const ensureArrays = (obj: any) => {
      obj.images = Array.isArray(obj.images) ? obj.images : (obj.images = []);
      obj.textures = Array.isArray(obj.textures) ? obj.textures : (obj.textures = []);
      obj.samplers = Array.isArray(obj.samplers) ? obj.samplers : (obj.samplers = []);
      obj.materials = Array.isArray(obj.materials) ? obj.materials : (obj.materials = []);
      obj.meshes = Array.isArray(obj.meshes) ? obj.meshes : (obj.meshes = []);
    };
    ensureArrays(out);

    const findImageIndexByKey = (obj: any, keyRaw: string): number | undefined => {
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
    };
    const guessMime = (fname: string) => {
      const lower = fname.toLowerCase();
      if (lower.endsWith('.ktx2')) return 'image/ktx2';
      if (lower.endsWith('.png')) return 'image/png';
      return 'image/jpeg';
    };
    const getOrAddImage = (obj: any, filename: string): number => {
      const existing = findImageIndexByKey(obj, filename) ?? findImageIndexByKey(obj, stripImagesPrefix(filename) || '') ?? findImageIndexByKey(obj, baseName(filename) || '');
      if (existing !== undefined) return existing;
      const clean = stripImagesPrefix(filename) || filename;
      const idx = obj.images.length;
      obj.images.push({ uri: `images/${clean}`, name: baseName(clean), mimeType: guessMime(clean) });
      return idx;
    };
    const findTextureForImage = (obj: any, imageIndex: number): number | undefined => {
      for (let i = 0; i < obj.textures.length; i++) {
        if (obj.textures[i]?.source === imageIndex) return i;
      }
      return undefined;
    };
    const getOrAddTextureForImage = (obj: any, imageIndex: number): number => {
      const exist = findTextureForImage(obj, imageIndex);
      if (exist !== undefined) return exist;
      const idx = obj.textures.length;
      const tex: any = { source: imageIndex };
      if (obj.samplers.length > 0) tex.sampler = 0;
      obj.textures.push(tex);
      return idx;
    };

    // Determine a global AO texture in the target: prefer first image whose name/uri contains 'ao'; else first image.
    let aoImageIndex: number | undefined = undefined;
    try {
      if (Array.isArray(out.images) && out.images.length > 0) {
        const idxByName = out.images.findIndex((img: any) => {
          const s = `${img?.name || ''} ${img?.uri || ''}`.toLowerCase();
          return s.includes('ao');
        });
        aoImageIndex = idxByName >= 0 ? idxByName : 0;
      }
    } catch {}
    const aoTexIndex: number | undefined = typeof aoImageIndex === 'number' ? getOrAddTextureForImage(out, aoImageIndex) : undefined;

    const getRefTexKey = (ref: any, texIndex?: number) => {
      if (typeof texIndex !== 'number') return undefined;
      const tex = Array.isArray(ref.textures) ? ref.textures[texIndex] : undefined;
      const img = tex && typeof tex.source === 'number' && Array.isArray(ref.images) ? ref.images[tex.source] : undefined;
      const key = img?.uri || img?.name;
      return normalizeKey(key || undefined);
    };

    // Build materials from scratch based on reference JSON
    const refMaterials: any[] = Array.isArray(refJson.materials) ? refJson.materials : [];
    const newMaterials: any[] = [];
    let usedTextureTransform = false;
    refMaterials.forEach((rmat: any) => {
      const name: string | undefined = typeof rmat?.name === 'string' ? rmat.name : undefined;
      if (!name) return;
      ensureArrays(out);
      const tgtMat: any = { name, pbrMetallicRoughness: {} };
      newMaterials.push(tgtMat);
      const pbrR = rmat.pbrMetallicRoughness || {};
      // Explicit defaults
      tgtMat.pbrMetallicRoughness.baseColorFactor = Array.isArray(pbrR.baseColorFactor) ? [...pbrR.baseColorFactor] : [1, 1, 1, 1];
      tgtMat.pbrMetallicRoughness.metallicFactor = typeof pbrR.metallicFactor === 'number' ? pbrR.metallicFactor : 1;
      tgtMat.pbrMetallicRoughness.roughnessFactor = typeof pbrR.roughnessFactor === 'number' ? pbrR.roughnessFactor : 1;
      tgtMat.emissiveFactor = Array.isArray(rmat.emissiveFactor) ? [...rmat.emissiveFactor] : [0, 0, 0];
      // Preserve transparency settings from reference
      if (typeof rmat.alphaMode === 'string') tgtMat.alphaMode = rmat.alphaMode;
      if (typeof rmat.alphaCutoff === 'number') tgtMat.alphaCutoff = rmat.alphaCutoff;

      const applySlotRaw = (outMat: any, slotPath: string[], texKey?: string, transformSrc?: any) => {
        if (!texKey) return;
        const cleanKey = stripImagesPrefix(texKey) || texKey;
        const candidates = /\.[A-Za-z0-9]{2,5}$/.test(cleanKey) ? [cleanKey] : [`${cleanKey}.ktx2`, `${cleanKey}.jpg`, `${cleanKey}.jpeg`, `${cleanKey}.png`, cleanKey];
        let imageIndex: number | undefined;
        for (const cand of candidates) {
          const idx = findImageIndexByKey(out, cand);
          if (idx !== undefined) { imageIndex = idx; break; }
        }
        if (imageIndex === undefined) imageIndex = getOrAddImage(out, candidates[0]);
        const texIndex = getOrAddTextureForImage(out, imageIndex);
        let target = outMat;
        for (let i = 0; i < slotPath.length - 1; i++) {
          const key = slotPath[i];
          if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
          target = target[key];
        }
        const lastKey = slotPath[slotPath.length - 1];
        if (typeof target[lastKey] !== 'object' || target[lastKey] === null) target[lastKey] = { index: texIndex };
        else target[lastKey].index = texIndex;
        // Copy KHR_texture_transform props (scale, rotation, offset)
        try {
          const xform = transformSrc?.extensions?.KHR_texture_transform;
          if (xform && typeof xform === 'object') {
            const scale = Array.isArray(xform.scale) ? xform.scale : undefined;
            const rotation = typeof xform.rotation === 'number' ? xform.rotation : undefined;
            const offset = Array.isArray(xform.offset) ? xform.offset : undefined;
            if (scale || rotation !== undefined || offset) {
              target[lastKey].extensions = target[lastKey].extensions || {};
              target[lastKey].extensions.KHR_texture_transform = target[lastKey].extensions.KHR_texture_transform || {};
              if (scale) target[lastKey].extensions.KHR_texture_transform.scale = [...scale];
              if (rotation !== undefined) target[lastKey].extensions.KHR_texture_transform.rotation = rotation;
              if (offset) target[lastKey].extensions.KHR_texture_transform.offset = [...offset];
              usedTextureTransform = true;
            }
          }
        } catch {}
      };

      // BaseColor (destructive)
      const baseIdx = pbrR.baseColorTexture?.index;
      const baseKey = getRefTexKey(refJson, baseIdx);
      if (baseKey) applySlotRaw(tgtMat, ['pbrMetallicRoughness', 'baseColorTexture'], baseKey, pbrR.baseColorTexture);
      else if (tgtMat?.pbrMetallicRoughness) delete tgtMat.pbrMetallicRoughness.baseColorTexture;

      // MetallicRoughness (destructive)
      const mrIdx = pbrR.metallicRoughnessTexture?.index;
      const mrKey = getRefTexKey(refJson, mrIdx);
      if (mrKey) applySlotRaw(tgtMat, ['pbrMetallicRoughness', 'metallicRoughnessTexture'], mrKey, pbrR.metallicRoughnessTexture);
      else if (tgtMat?.pbrMetallicRoughness) delete tgtMat.pbrMetallicRoughness.metallicRoughnessTexture;

      // Normal + scale (destructive)
      const nIdx = rmat.normalTexture?.index;
      const nKey = getRefTexKey(refJson, nIdx);
      if (nKey) {
        applySlotRaw(tgtMat, ['normalTexture'], nKey, rmat.normalTexture);
        if (typeof rmat.normalTexture?.scale === 'number') {
          tgtMat.normalTexture = tgtMat.normalTexture || { index: tgtMat.normalTexture?.index };
          tgtMat.normalTexture.scale = rmat.normalTexture.scale;
        } else if (tgtMat.normalTexture && 'scale' in tgtMat.normalTexture) {
          delete tgtMat.normalTexture.scale;
        }
      } else if (tgtMat.normalTexture) delete tgtMat.normalTexture;

      // Occlusion + strength: force-link to target's AO texture for all materials
      if (typeof aoTexIndex === 'number') {
        tgtMat.occlusionTexture = { index: aoTexIndex, texCoord: 1 };
        if (typeof rmat.occlusionTexture?.strength === 'number') {
          tgtMat.occlusionTexture.strength = rmat.occlusionTexture.strength;
        }
      } else if (tgtMat.occlusionTexture) {
        delete tgtMat.occlusionTexture;
      }

      // Emissive (destructive)
      const eIdx = rmat.emissiveTexture?.index;
      const eKey = getRefTexKey(refJson, eIdx);
      if (eKey) applySlotRaw(tgtMat, ['emissiveTexture'], eKey, rmat.emissiveTexture);
      else if (tgtMat.emissiveTexture) delete tgtMat.emissiveTexture;

      // Sheen
      const sRef = rmat.extensions?.KHR_materials_sheen;
      if (sRef) {
        tgtMat.extensions = tgtMat.extensions || {};
        tgtMat.extensions.KHR_materials_sheen = tgtMat.extensions.KHR_materials_sheen || {};
        const sTgt = tgtMat.extensions.KHR_materials_sheen;
        if (typeof sRef.sheenRoughnessFactor === 'number') sTgt.sheenRoughnessFactor = sRef.sheenRoughnessFactor;
        if (Array.isArray(sRef.sheenColorFactor)) sTgt.sheenColorFactor = [...sRef.sheenColorFactor];
        const srIdx = sRef.sheenRoughnessTexture?.index;
        const scIdx = sRef.sheenColorTexture?.index;
        const srKey = getRefTexKey(refJson, srIdx);
        const scKey = getRefTexKey(refJson, scIdx);
        if (srKey) {
          sTgt.sheenRoughnessTexture = sTgt.sheenRoughnessTexture || {};
          applySlotRaw({ extensions: { KHR_materials_sheen: sTgt } }, ['extensions','KHR_materials_sheen','sheenRoughnessTexture'], srKey, sRef.sheenRoughnessTexture);
        } else if (sTgt.sheenRoughnessTexture) delete sTgt.sheenRoughnessTexture;
        if (scKey) {
          sTgt.sheenColorTexture = sTgt.sheenColorTexture || {};
          applySlotRaw({ extensions: { KHR_materials_sheen: sTgt } }, ['extensions','KHR_materials_sheen','sheenColorTexture'], scKey, sRef.sheenColorTexture);
        } else if (sTgt.sheenColorTexture) delete sTgt.sheenColorTexture;
      }
      else if (tgtMat.extensions && tgtMat.extensions.KHR_materials_sheen) {
        // Remove sheen entirely if not present in reference
        delete tgtMat.extensions.KHR_materials_sheen;
        if (Object.keys(tgtMat.extensions).length === 0) delete tgtMat.extensions;
      }
    });

    // Replace target materials array with newly built one
    out.materials = newMaterials;

    // Ensure extensionsUsed lists applicable extensions
    try {
      out.extensionsUsed = Array.isArray(out.extensionsUsed) ? out.extensionsUsed : [];
      const addUsed = (name: string) => { if (!out.extensionsUsed.includes(name)) out.extensionsUsed.push(name); };
      if (usedTextureTransform) addUsed('KHR_texture_transform');
      // Sheen if present
      const sheenPresent = newMaterials.some((m: any) => m?.extensions?.KHR_materials_sheen);
      if (sheenPresent) addUsed('KHR_materials_sheen');
      // Variants always added below
      addUsed('KHR_materials_variants');
    } catch {}

    // (Removed legacy reaffirm step; applySlotRaw already ensures image/texture indices)

    // Preserve existing variant names and per-variant material assignments.
    // Remap mapping.material indices to the new material indices by original material name.
    try {
      const outJson = out;
      const oldMaterialsArr: any[] = Array.isArray(tgtJson.materials) ? tgtJson.materials : [];
      const oldIndexToName: (string | undefined)[] = oldMaterialsArr.map((m: any) => (m && typeof m.name === 'string') ? m.name : undefined);
      const newMaterialsArr: any[] = Array.isArray(outJson.materials) ? outJson.materials : [];
      const nameToNewIndex = new Map<string, number>();
      newMaterialsArr.forEach((m: any, idx: number) => { if (m?.name) nameToNewIndex.set(m.name, idx); });

      const meshes: any[] = Array.isArray(outJson.meshes) ? outJson.meshes : [];
      meshes.forEach((mesh: any) => {
        const prims: any[] = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
        prims.forEach((prim: any) => {
          const maps = prim?.extensions?.KHR_materials_variants?.mappings;
          if (!Array.isArray(maps)) return;
          maps.forEach((map: any) => {
            const oldIdx = map?.material;
            if (typeof oldIdx === 'number') {
              const oldName = oldIndexToName[oldIdx];
              const newIdx = oldName ? nameToNewIndex.get(oldName) : undefined;
              map.material = (typeof newIdx === 'number') ? newIdx : 0;
            }
          });
        });
      });

      // Ensure extension is flagged as used
      outJson.extensionsUsed = Array.isArray(outJson.extensionsUsed) ? outJson.extensionsUsed : [];
      if (!outJson.extensionsUsed.includes('KHR_materials_variants')) outJson.extensionsUsed.push('KHR_materials_variants');
    } catch {}

    // Upload back to Bunny (overwrite target)
    const { zoneName } = getStorageZoneDetails();
    // Build storage path relative to zone from targetUrl
    const targetUrlObj = new URL(targetUrl);
    const storagePath = targetUrlObj.pathname.replace(/^\//, '');

    await new Promise<void>((resolve, reject) => {
      const content = JSON.stringify(out, null, 2);
      const buffer = Buffer.from(content);
      const options = {
        method: 'PUT',
        host: HOSTNAME,
        path: `/${zoneName}/${storagePath}`,
        headers: {
          AccessKey: ACCESS_KEY,
          'Content-Type': 'model/gltf+json',
          'Content-Length': buffer.length,
        },
      } as const;
      const req = https.request(options, (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed: ${res.statusCode}`));
      });
      req.on('error', reject);
      req.write(buffer);
      req.end();
    });

    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${storagePath}`);

    // Also return the updated file for download with a unique name
    const downloadName = `updated-${Date.now()}-${storagePath.split('/').pop() || 'model.gltf'}`;
    const res = NextResponse.json({ success: true, url: `https://${BUNNY_PULL_ZONE_URL}/${storagePath}` });
    res.headers.set('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.headers.set('Content-Type', 'application/json');
    return res;
  } catch (error) {
    console.error('apply-reference-to-model error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to apply reference to target' }, { status: 500 });
  }
}


