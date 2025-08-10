import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getClientConfig } from '@/config/clientConfig';
import { NodeIO, Document, Material as GTMaterial, Texture } from '@gltf-transform/core';
import { KHRTextureTransform, KHRMaterialsSheen, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { KHRMaterialsTransmission, KHRMaterialsVariants } from '@gltf-transform/extensions';

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

const uploadToBunny = async (
  filePath: string, 
  content: string, 
  contentType: string = 'application/json'
): Promise<void> => {
  const { zoneName } = getStorageZoneDetails();
  const buffer = Buffer.from(content);

  return new Promise((resolve, reject) => {
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${zoneName}/${filePath}`,
      headers: {
        AccessKey: ACCESS_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
      },
    } as const;

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
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

export async function POST(request: NextRequest) {
  try {
    const { client, materials } = await request.json();
    if (!client || !materials || !Array.isArray(materials)) {
      return NextResponse.json({ error: 'client and materials[] are required' }, { status: 400 });
    }

    const clientConfig = getClientConfig(client);
    const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;

    // Fetch current reference GLTF
    const response = await fetch(referenceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch reference GLTF: ${response.status}`);
    }
    const gltfText = await response.text();
    const gltfData = JSON.parse(gltfText);

    // Externalized arrays are no longer supported. Require embedded arrays in reference.gltf.
    if (typeof (gltfData as any).materials === 'string' ||
        typeof (gltfData as any).textures === 'string' ||
        typeof (gltfData as any).images === 'string' ||
        typeof (gltfData as any).externalImagesUri === 'string') {
      return NextResponse.json({
        error: 'Externalized materials/textures/images are no longer supported. Embed arrays directly in reference.gltf.'
      }, { status: 400 });
    }

    // Use glTF-Transform for non-destructive material upsert
    const io = new NodeIO();
    io.registerExtensions([
      KHRTextureTransform,
      KHRMaterialsSheen,
      KHRDracoMeshCompression,
      KHRMaterialsTransmission,
      KHRMaterialsVariants,
    ]);

    // Prepare resources for external buffers (if any)
    const resources: Record<string, Uint8Array> = {};
    const referenceDir = new URL('./', referenceUrl).toString();
    if (Array.isArray((gltfData as any).buffers)) {
      for (const buf of (gltfData as any).buffers) {
        if (buf && typeof buf.uri === 'string' && !buf.uri.startsWith('data:')) {
          const bufUrl = new URL(buf.uri, referenceDir).toString();
          const bufResp = await fetch(bufUrl);
          if (bufResp.ok) {
            const ab = await bufResp.arrayBuffer();
            resources[buf.uri] = new Uint8Array(ab);
          }
        }
      }
    }

    const document: Document = await io.readJSON({ json: gltfData, resources } as any);
    const root = document.getRoot();

    // Helper: normalize file key (strip leading 'images/')
    const normalizeKey = (key?: string | null): string | undefined => {
      if (!key) return undefined;
      return key.startsWith('images/') ? key.substring(7) : key;
    };

    // Build lookup maps: image by multiple keys (uri, name, base name), and texture by image
    const stripExt = (s?: string) => (s && s.includes('.') ? s.replace(/\.[^.]+$/, '') : s);
    const imageByKey = new Map<string, any>();
    (root as any).listImages?.().forEach((img: any) => {
      const uri: string | undefined = img.getURI?.();
      const name: string | undefined = img.getName?.();
      const uriKey = normalizeKey(uri || undefined);
      const nameKey = name && name.trim() ? name.trim() : undefined;
      const baseKey = stripExt(uriKey || nameKey);
      if (uriKey) imageByKey.set(uriKey, img);
      if (nameKey) imageByKey.set(nameKey, img);
      if (baseKey) imageByKey.set(baseKey, img);
    });

    const textureByImage = new Map<any, Texture>();
    root.listTextures().forEach((tex) => {
      const img = (tex as any).getImage?.();
      if (img) textureByImage.set(img, tex);
    });

    const ensureTextureForImageKey = (key?: string): Texture | undefined => {
      const k = normalizeKey(key);
      if (!k) return undefined;
      const hasExt = /\.[A-Za-z0-9]{2,5}$/.test(k);
      const candidates = hasExt ? [k] : [
        `${k}.ktx2`,
        `${k}.jpg`,
        `${k}.jpeg`,
        `${k}.png`,
        k, // base name (no ext)
      ];
      let img: any | undefined;
      for (const c of candidates) {
        const ck = normalizeKey(c) || c;
        const base = stripExt(ck || '') || '';
        img = imageByKey.get(ck) || imageByKey.get(base);
        if (img) break;
      }
      if (!img) return undefined; // don't create Images; non-destructive
      let tex = textureByImage.get(img);
      if (!tex) {
        tex = document.createTexture(`Tex_${k}`);
        if (typeof (tex as any).setImage === 'function') (tex as any).setImage(img);
        textureByImage.set(img, tex);
      }
      return tex;
    };

    const upsertMaterial = (m: any) => {
      if (!m?.name) return;
      // Find or create material by name
      let mat: GTMaterial | undefined = root.listMaterials().find((mm) => mm.getName() === m.name);
      if (!mat) {
        mat = document.createMaterial(m.name);
      }

      // Basic factors
      const base = Array.isArray(m.baseColor) ? m.baseColor : [1, 1, 1, 1];
      mat.setBaseColorFactor(base as [number, number, number, number]);
      if (typeof m.metallicFactor === 'number') mat.setMetallicFactor(m.metallicFactor);
      if (typeof m.roughnessFactor === 'number') mat.setRoughnessFactor(m.roughnessFactor);
      if (Array.isArray(m.emissiveFactor)) mat.setEmissiveFactor(m.emissiveFactor as [number, number, number]);

      // Helper to preserve existing TextureInfo (incl. KHR_texture_transform) when rebinding
    const setSlot = (newTex: Texture | undefined, getInfo: () => any, setTex: (t: Texture) => void) => {
        if (!newTex) return;
      const info = typeof getInfo === 'function' ? getInfo() : undefined;
      // Preserve existing TextureInfo (extensions/texCoord) if present
      if (info && typeof info.setTexture === 'function') {
          info.setTexture(newTex);
        } else {
          setTex(newTex);
        }
      };

      // BaseColor texture
      const baseTex = ensureTextureForImageKey(m.baseColorTexture);
      setSlot(baseTex, () => (mat as any).getBaseColorTextureInfo?.(), (t) => (mat as any).setBaseColorTexture(t));

      // MetallicRoughness texture
      const mrKey = normalizeKey(m.metallicRoughnessTexture || m.metallicTexture || m.roughnessTexture);
      const mrTex = ensureTextureForImageKey(mrKey);
      setSlot(mrTex, () => (mat as any).getMetallicRoughnessTextureInfo?.(), (t) => (mat as any).setMetallicRoughnessTexture(t));

      // Normal texture
      const normalTex = ensureTextureForImageKey(m.normalTexture);
      setSlot(normalTex, () => (mat as any).getNormalTextureInfo?.(), (t) => (mat as any).setNormalTexture(t));
      // Persist normal scale on the glTF-Transform document as well (not only in raw JSON later)
      try {
        if (typeof m.normalScale === 'number' && !isNaN(m.normalScale)) {
          const nInfo = (mat as any).getNormalTextureInfo?.();
          if (nInfo?.setScale) nInfo.setScale(m.normalScale);
          else if (nInfo) (nInfo as any).scale = m.normalScale;
        }
      } catch {}

      // Occlusion texture
      const aoTex = ensureTextureForImageKey(m.occlusionTexture);
      setSlot(aoTex, () => (mat as any).getOcclusionTextureInfo?.(), (t) => (mat as any).setOcclusionTexture(t));

      // Emissive texture
      const emissiveTex = ensureTextureForImageKey(m.emissiveTexture);
      setSlot(emissiveTex, () => (mat as any).getEmissiveTextureInfo?.(), (t) => (mat as any).setEmissiveTexture(t));

      // Sheen extension (optional)
      const hasSheenInputs = typeof m.sheenRoughnessFactor === 'number' || Array.isArray(m.sheenColor) || m.sheenRoughnessTexture || m.sheenColorTexture;
      if (hasSheenInputs) {
        const sheenExt = document.createExtension(KHRMaterialsSheen).createSheen();
        if (typeof m.sheenRoughnessFactor === 'number') sheenExt.setSheenRoughnessFactor(m.sheenRoughnessFactor);
        if (Array.isArray(m.sheenColor)) sheenExt.setSheenColorFactor(m.sheenColor as [number, number, number]);
        const sheenRoughTex = ensureTextureForImageKey(m.sheenRoughnessTexture || m.sheenTexture);
        if (sheenRoughTex) sheenExt.setSheenRoughnessTexture(sheenRoughTex);
        const sheenColorTex = ensureTextureForImageKey(m.sheenColorTexture);
        if (sheenColorTex) sheenExt.setSheenColorTexture(sheenColorTex);
        mat.setExtension('KHR_materials_sheen', sheenExt);
      }
    };

    // Upsert all provided materials
    materials.forEach(upsertMaterial);

    // Serialize back to JSON (non-destructive; unchanged data preserved)
    const updatedJSON = await io.writeJSON(document);
    const out = (updatedJSON as any).json ?? updatedJSON;
    // Ensure images retain URI when not embedded (avoid invalid entries with neither uri nor bufferView)
    try {
      if (Array.isArray(out.images) && Array.isArray(gltfData.images)) {
        const originalByName = new Map<string, any>();
        (gltfData.images as any[]).forEach((img: any) => {
          if (img?.name) originalByName.set(img.name, img);
        });
        (out.images as any[]).forEach((img: any, idx: number) => {
          const hasUri = typeof img?.uri === 'string' && img.uri.length > 0;
          const hasBufferView = typeof img?.bufferView === 'number';
          if (!hasUri && !hasBufferView) {
            const fallback = img?.name ? originalByName.get(img.name) : (gltfData.images as any[])[idx];
            if (fallback?.uri) {
              img.uri = fallback.uri;
              if (fallback.mimeType) img.mimeType = fallback.mimeType;
            }
          }
        });
      }
    } catch {}

    // Ensure newly referenced textures are materialized (non-destructive append only)
    try {
      const imagesArr: any[] = Array.isArray(out.images) ? out.images : (out.images = []);
      const texturesArr: any[] = Array.isArray(out.textures) ? out.textures : (out.textures = []);
      const samplersArr: any[] = Array.isArray(out.samplers) ? out.samplers : (out.samplers = []);
      const defaultSampler = samplersArr.length > 0 ? 0 : undefined;

      const toLower = (s?: string) => (s ? s.toLowerCase() : s);
      const stripImagesPrefix = (uri?: string) => (uri?.startsWith('images/') ? uri.slice(7) : uri);
      const baseName = (s?: string) => (s && s.includes('.') ? s.replace(/\.[^.]+$/, '') : s);

      const findImageIndexByKey = (keyRaw: string): number | undefined => {
        const key = toLower(keyRaw);
        for (let i = 0; i < imagesArr.length; i++) {
          const img = imagesArr[i];
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

      const getOrAddImage = (filename: string): number => {
        // Try exact, images/<filename>, base name matching
        const existing = findImageIndexByKey(filename) ?? findImageIndexByKey(stripImagesPrefix(filename) || '') ?? findImageIndexByKey(baseName(filename) || '');
        if (existing !== undefined) return existing;
        const clean = stripImagesPrefix(filename) || filename;
        const idx = imagesArr.length;
        imagesArr.push({ uri: `images/${clean}`, name: baseName(clean), mimeType: guessMime(clean) });
        return idx;
      };

      const findTextureForImage = (imageIndex: number): number | undefined => {
        for (let i = 0; i < texturesArr.length; i++) {
          if (texturesArr[i]?.source === imageIndex) return i;
        }
        return undefined;
      };

      const getOrAddTextureForImage = (imageIndex: number): number => {
        const exist = findTextureForImage(imageIndex);
        if (exist !== undefined) return exist;
        const idx = texturesArr.length;
        const tex: any = { source: imageIndex };
        if (defaultSampler !== undefined) tex.sampler = defaultSampler;
        texturesArr.push(tex);
        return idx;
      };

      const applySlot = (outMat: any, slotPath: string[], texKey?: string) => {
        if (!texKey) return;
        // Resolve filename: accept with or without images/ prefix
        const cleanKey = stripImagesPrefix(texKey) || texKey;
        // Add missing extension guesses
        const candidates = /\.[A-Za-z0-9]{2,5}$/.test(cleanKey)
          ? [cleanKey]
          : [`${cleanKey}.ktx2`, `${cleanKey}.jpg`, `${cleanKey}.jpeg`, `${cleanKey}.png`, cleanKey];
        let imageIndex: number | undefined;
        for (const cand of candidates) {
          const idx = findImageIndexByKey(cand);
          if (idx !== undefined) { imageIndex = idx; break; }
        }
        if (imageIndex === undefined) imageIndex = getOrAddImage(candidates[0]);
        const texIndex = getOrAddTextureForImage(imageIndex);
        // Walk to the nested path and PRESERVE existing object; only update index
        let target = outMat;
        for (let i = 0; i < slotPath.length - 1; i++) {
          const key = slotPath[i];
          if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
          target = target[key];
        }
        const lastKey = slotPath[slotPath.length - 1];
        if (typeof target[lastKey] !== 'object' || target[lastKey] === null) {
          target[lastKey] = { index: texIndex };
        } else {
          target[lastKey].index = texIndex;
        }
      };

      // Apply for all incoming materials (by name)
      if (Array.isArray(out.materials) && Array.isArray(materials)) {
        for (const m of materials as any[]) {
          if (!m?.name) continue;
          const outMat = (out.materials as any[]).find((x) => x?.name === m.name);
          if (!outMat) continue;
          applySlot(outMat, ['pbrMetallicRoughness', 'baseColorTexture'], m.baseColorTexture);
          applySlot(outMat, ['pbrMetallicRoughness', 'metallicRoughnessTexture'], m.metallicRoughnessTexture || (m as any).metallicTexture || (m as any).roughnessTexture);
          applySlot(outMat, ['normalTexture'], m.normalTexture);
          // Persist normalTexture.scale (normal strength) explicitly in raw JSON
          // Only when a normal texture index is present to avoid creating invalid TextureInfo objects
          if (
            typeof m.normalScale === 'number' &&
            !isNaN(m.normalScale) &&
            outMat.normalTexture &&
            typeof outMat.normalTexture.index === 'number'
          ) {
            outMat.normalTexture.scale = m.normalScale;
          }
          applySlot(outMat, ['occlusionTexture'], m.occlusionTexture);
          applySlot(outMat, ['emissiveTexture'], m.emissiveTexture);
          // Sheen optional
          if (m.sheenRoughnessTexture || (m as any).sheenTexture || m.sheenColorTexture) {
            outMat.extensions = outMat.extensions || {};
            outMat.extensions.KHR_materials_sheen = outMat.extensions.KHR_materials_sheen || {};
            if (m.sheenRoughnessTexture || (m as any).sheenTexture) {
              applySlot(outMat.extensions.KHR_materials_sheen, ['sheenRoughnessTexture'], m.sheenRoughnessTexture || (m as any).sheenTexture);
            }
            if (m.sheenColorTexture) {
              applySlot(outMat.extensions.KHR_materials_sheen, ['sheenColorTexture'], m.sheenColorTexture);
            }
          }
        }
      }
    } catch {}

    // Enforce deletions: restrict materials to posted names and remap mesh/variant indices
    try {
      if (Array.isArray(out.materials) && Array.isArray(materials)) {
        const desiredNames = new Set((materials as any[]).map((m) => m?.name).filter(Boolean));
        const oldMaterials: any[] = out.materials as any[];
        const oldIndexToName: (string | undefined)[] = oldMaterials.map((m) => m?.name);
        // Build new materials array preserving order of posted list
        const nameToMat = new Map<string, any>();
        oldMaterials.forEach((m) => { if (m?.name) nameToMat.set(m.name, m); });
        const newMaterials: any[] = [];
        (materials as any[]).forEach((m) => {
          const existing = m?.name ? nameToMat.get(m.name) : undefined;
          if (existing) newMaterials.push(existing);
        });
        // Fallback to ensure at least one material exists
        if (newMaterials.length === 0 && oldMaterials.length > 0) newMaterials.push(oldMaterials[0]);
        out.materials = newMaterials;
        const nameToNewIndex = new Map<string, number>();
        (out.materials as any[]).forEach((m: any, idx: number) => { if (m?.name) nameToNewIndex.set(m.name, idx); });

        // Remap mesh primitive.material indices
        if (Array.isArray(out.meshes)) {
          (out.meshes as any[]).forEach((mesh: any) => {
            if (!Array.isArray(mesh?.primitives)) return;
            mesh.primitives.forEach((prim: any) => {
              const oldIdx = prim?.material;
              if (typeof oldIdx === 'number') {
                const oldName = oldIndexToName[oldIdx];
                const newIdx = oldName ? nameToNewIndex.get(oldName) : undefined;
                prim.material = typeof newIdx === 'number' ? newIdx : 0;
              }
              // Remap KHR_materials_variants mappings
              const maps = prim?.extensions?.KHR_materials_variants?.mappings;
              if (Array.isArray(maps)) {
                maps.forEach((map: any) => {
                  const oldMapIdx = map?.material;
                  if (typeof oldMapIdx === 'number') {
                    const oldName = oldIndexToName[oldMapIdx];
                    const newIdx = oldName ? nameToNewIndex.get(oldName) : undefined;
                    map.material = typeof newIdx === 'number' ? newIdx : 0;
                  }
                });
              }
            });
          });
        }
      }
    } catch {}

    // Integrity check: compare counts before/after to ensure non-destructive structure
    try {
      const keysToCheck = [
        'buffers',
        'bufferViews',
        'accessors',
        'images',
        'textures',
        'samplers',
        'materials',
        'meshes',
        'nodes',
        'scenes',
        'skins',
        'animations',
        'cameras',
      ] as const;
      const originalCounts: Record<string, number> = {};
      const updatedCounts: Record<string, number> = {};
      keysToCheck.forEach((k) => {
        const o = (gltfData as any)[k];
        const u = (out as any)[k];
        originalCounts[k] = Array.isArray(o) ? o.length : 0;
        updatedCounts[k] = Array.isArray(u) ? u.length : 0;
      });
      const deltas: Record<string, number> = {};
      keysToCheck.forEach((k) => (deltas[k] = updatedCounts[k] - originalCounts[k]));
      // Log summary
      console.log('[SAVE INTEGRITY] counts', { originalCounts, updatedCounts, deltas });
      const decreased = keysToCheck.filter((k) => deltas[k] < 0);
      if (decreased.length > 0) {
        console.warn('[SAVE INTEGRITY] Decreased array sizes detected:', decreased.map((k) => ({ key: k, from: originalCounts[k], to: updatedCounts[k] })));
      }
    } catch (e) {
      console.warn('[SAVE INTEGRITY] Skipped integrity check due to error:', e);
    }

    // Final upload
    const updatedGltfContent = JSON.stringify(out, null, 2);
    const filePath = `${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;
    await uploadToBunny(filePath, updatedGltfContent, 'model/gltf+json');
    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${filePath}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving materials:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save materials' }, { status: 500 });
  }
}


