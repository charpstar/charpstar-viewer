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
    const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.referencePath}`;

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
      if (m.baseColorTexture == null) {
        (mat as any).setBaseColorTexture(null as any);
      } else {
        const baseTex = ensureTextureForImageKey(m.baseColorTexture);
        setSlot(baseTex, () => (mat as any).getBaseColorTextureInfo?.(), (t) => (mat as any).setBaseColorTexture(t));
      }
      // BaseColor texture tiling (KHR_texture_transform scale)
      try {
        const info = (mat as any).getBaseColorTextureInfo?.();
        const scale = Array.isArray((m as any).baseColorTextureScale) ? (m as any).baseColorTextureScale : undefined;
        if (info && Array.isArray(scale) && scale.length === 2 && scale.every((v: any) => typeof v === 'number')) {
          let xform = info.getExtension?.('KHR_texture_transform');
          if (!xform) {
            const ext = document.createExtension(KHRTextureTransform);
            xform = (ext as any).createTextureTransform?.();
            info.setExtension?.('KHR_texture_transform', xform);
          }
          if (xform?.setScale) xform.setScale(scale as [number, number]);
          else if (xform) (xform as any).scale = scale;
        }
      } catch {}

      // MetallicRoughness texture
      const mrKey = normalizeKey(m.metallicRoughnessTexture || m.metallicTexture || m.roughnessTexture);
      if (m.metallicRoughnessTexture == null && (m as any).metallicTexture == null && (m as any).roughnessTexture == null) {
        (mat as any).setMetallicRoughnessTexture?.(null as any);
      } else {
        const mrTex = ensureTextureForImageKey(mrKey);
        setSlot(mrTex, () => (mat as any).getMetallicRoughnessTextureInfo?.(), (t) => (mat as any).setMetallicRoughnessTexture(t));
      }

      // Normal texture
      if (m.normalTexture == null) {
        (mat as any).setNormalTexture(null as any);
      } else {
        const normalTex = ensureTextureForImageKey(m.normalTexture);
        setSlot(normalTex, () => (mat as any).getNormalTextureInfo?.(), (t) => (mat as any).setNormalTexture(t));
      }
      // Persist normal scale on the glTF-Transform document as well (not only in raw JSON later)
      try {
        if (typeof m.normalScale === 'number' && !isNaN(m.normalScale)) {
          const nInfo = (mat as any).getNormalTextureInfo?.();
          if (nInfo?.setScale) nInfo.setScale(m.normalScale);
          else if (nInfo) (nInfo as any).scale = m.normalScale;
        }
      } catch {}
      // Normal texture tiling (KHR_texture_transform scale)
      try {
        const nInfo = (mat as any).getNormalTextureInfo?.();
        const nScale = Array.isArray((m as any).normalTextureScale) ? (m as any).normalTextureScale : undefined;
        if (nInfo && Array.isArray(nScale) && nScale.length === 2 && nScale.every((v: any) => typeof v === 'number')) {
          let nx = nInfo.getExtension?.('KHR_texture_transform');
          if (!nx) {
            const ext = document.createExtension(KHRTextureTransform);
            nx = (ext as any).createTextureTransform?.();
            nInfo.setExtension?.('KHR_texture_transform', nx);
          }
          if (nx?.setScale) nx.setScale(nScale as [number, number]);
          else if (nx) (nx as any).scale = nScale;
        }
      } catch {}

      // Occlusion texture
      if (m.occlusionTexture == null) {
        (mat as any).setOcclusionTexture(null as any);
      } else {
        const aoTex = ensureTextureForImageKey(m.occlusionTexture);
        setSlot(aoTex, () => (mat as any).getOcclusionTextureInfo?.(), (t) => (mat as any).setOcclusionTexture(t));
      }
      // Persist occlusion strength on the glTF-Transform document
      try {
        if (typeof m.occlusionStrength === 'number' && !isNaN(m.occlusionStrength)) {
          const oInfo = (mat as any).getOcclusionTextureInfo?.();
          if (oInfo?.setStrength) oInfo.setStrength(m.occlusionStrength);
          else if (oInfo) (oInfo as any).strength = m.occlusionStrength;
        }
      } catch {}

      // Emissive texture
      if (m.emissiveTexture == null) {
        (mat as any).setEmissiveTexture(null as any);
      } else {
        const emissiveTex = ensureTextureForImageKey(m.emissiveTexture);
        setSlot(emissiveTex, () => (mat as any).getEmissiveTextureInfo?.(), (t) => (mat as any).setEmissiveTexture(t));
      }

      // Sheen extension (preserve existing TextureInfo; only set what is provided)
      const hasSheenInputs =
        typeof m.sheenRoughnessFactor === 'number' ||
        Array.isArray(m.sheenColor) ||
        m.sheenRoughnessTexture ||
        (m as any).sheenTexture ||
        m.sheenColorTexture;
      if (hasSheenInputs) {
        let sheenExt = (mat as any).getExtension?.('KHR_materials_sheen');
        if (!sheenExt) {
          sheenExt = document.createExtension(KHRMaterialsSheen).createSheen();
          (mat as any).setExtension?.('KHR_materials_sheen', sheenExt);
        }
        if (typeof m.sheenRoughnessFactor === 'number') {
          sheenExt.setSheenRoughnessFactor(m.sheenRoughnessFactor);
        }
        if (Array.isArray(m.sheenColor)) {
          sheenExt.setSheenColorFactor(m.sheenColor as [number, number, number]);
        }
        if ((Object.prototype.hasOwnProperty.call(m as any, 'sheenRoughnessTexture') && (m as any).sheenRoughnessTexture === null) ||
            (Object.prototype.hasOwnProperty.call(m as any, 'sheenTexture') && (m as any).sheenTexture === null)) {
          sheenExt.setSheenRoughnessTexture(null as any);
        } else if (m.sheenRoughnessTexture || (m as any).sheenTexture) {
          const newSheenRoughTex = ensureTextureForImageKey(m.sheenRoughnessTexture || (m as any).sheenTexture);
          if (newSheenRoughTex) {
            setSlot(newSheenRoughTex, () => sheenExt.getSheenRoughnessTextureInfo?.(), (t) => sheenExt.setSheenRoughnessTexture(t));
            // Persist sheen roughness texCoord on TextureInfo if provided
            try {
              const info = sheenExt.getSheenRoughnessTextureInfo?.();
              const tc = (m as any).sheenRoughnessTextureTexCoord;
              if (info && typeof tc === 'number') {
                if (typeof (info as any).setTexCoord === 'function') (info as any).setTexCoord(tc);
                else (info as any).texCoord = tc;
              }
            } catch {}
          }
        }
        if (Object.prototype.hasOwnProperty.call(m as any, 'sheenColorTexture') && (m as any).sheenColorTexture === null) {
          sheenExt.setSheenColorTexture(null as any);
        } else if (m.sheenColorTexture) {
          const newSheenColorTex = ensureTextureForImageKey(m.sheenColorTexture);
          if (newSheenColorTex) {
            setSlot(newSheenColorTex, () => sheenExt.getSheenColorTextureInfo?.(), (t) => sheenExt.setSheenColorTexture(t));
            // Persist sheen color texCoord on TextureInfo if provided
            try {
              const info = sheenExt.getSheenColorTextureInfo?.();
              const tc = (m as any).sheenColorTextureTexCoord;
              if (info && typeof tc === 'number') {
                if (typeof (info as any).setTexCoord === 'function') (info as any).setTexCoord(tc);
                else (info as any).texCoord = tc;
              }
            } catch {}
          }
        }
      } else {
        // No sheen inputs provided: if the incoming material explicitly provided nulls for sheen textures and no factors,
        // we remove the sheen extension entirely to honor full removal.
        const providedNullSheen =
          (Object.prototype.hasOwnProperty.call(m as any, 'sheenColorTexture') && (m as any).sheenColorTexture === null) ||
          (Object.prototype.hasOwnProperty.call(m as any, 'sheenRoughnessTexture') && (m as any).sheenRoughnessTexture === null) ||
          (Object.prototype.hasOwnProperty.call(m as any, 'sheenTexture') && (m as any).sheenTexture === null);
        if (providedNullSheen) {
          (mat as any).setExtension?.('KHR_materials_sheen', null as any);
        }
      }
    };

    // Upsert all provided materials
    materials.forEach(upsertMaterial);

    // Serialize back to JSON (non-destructive; unchanged data preserved)
    const writeResult: any = await io.writeJSON(document);
    const out = (writeResult as any).json ?? writeResult;
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

    // Preserve explicit values that glTF-Transform omits as defaults (e.g., roughnessFactor=1, emissiveFactor=[0,0,0])
    try {
      if (Array.isArray((gltfData as any).materials) && Array.isArray((out as any).materials)) {
        const originalByName = new Map<string, any>();
        ((gltfData as any).materials as any[]).forEach((m) => { if (m?.name) originalByName.set(m.name, m); });
        const postedByName = new Map<string, any>();
        (materials as any[]).forEach((m) => { if (m?.name) postedByName.set(m.name, m); });

        ((out as any).materials as any[]).forEach((m) => {
          if (!m?.name) return;
          const orig = originalByName.get(m.name) || {};
          const posted = postedByName.get(m.name) || {};

          // Ensure nested objects exist when needed
          m.pbrMetallicRoughness = m.pbrMetallicRoughness || {};
          const oPMR = (orig as any).pbrMetallicRoughness || {};

          // Preserve roughnessFactor if present in original, not explicitly provided by client, and missing in output
          const clientProvidedRoughness = Object.prototype.hasOwnProperty.call(posted, 'roughnessFactor');
          const origHadRoughness = Object.prototype.hasOwnProperty.call(oPMR, 'roughnessFactor');
          const outHasRoughness = Object.prototype.hasOwnProperty.call(m.pbrMetallicRoughness, 'roughnessFactor');
          if (!clientProvidedRoughness && origHadRoughness && !outHasRoughness) {
            m.pbrMetallicRoughness.roughnessFactor = oPMR.roughnessFactor;
          }

          // Preserve emissiveFactor if present in original, not explicitly provided by client, and missing in output
          const clientProvidedEmissive = Object.prototype.hasOwnProperty.call(posted, 'emissiveFactor');
          const origHadEmissive = Object.prototype.hasOwnProperty.call(orig, 'emissiveFactor');
          const outHasEmissive = Object.prototype.hasOwnProperty.call(m, 'emissiveFactor');
          if (!clientProvidedEmissive && origHadEmissive && !outHasEmissive) {
            m.emissiveFactor = [...(orig as any).emissiveFactor];
          }

          // Preserve alphaMode and alphaCutoff for transparency if original had them and client didn't specify
          const clientProvidedAlphaMode = Object.prototype.hasOwnProperty.call(posted, 'alphaMode');
          const clientProvidedAlphaCutoff = Object.prototype.hasOwnProperty.call(posted, 'alphaCutoff');
          const origHadAlphaMode = Object.prototype.hasOwnProperty.call(orig, 'alphaMode');
          const origHadAlphaCutoff = Object.prototype.hasOwnProperty.call(orig, 'alphaCutoff');
          const outHasAlphaMode = Object.prototype.hasOwnProperty.call(m, 'alphaMode');
          const outHasAlphaCutoff = Object.prototype.hasOwnProperty.call(m, 'alphaCutoff');
          if (!clientProvidedAlphaMode && origHadAlphaMode && !outHasAlphaMode) {
            m.alphaMode = (orig as any).alphaMode;
          }
          if (!clientProvidedAlphaCutoff && origHadAlphaCutoff && !outHasAlphaCutoff) {
            m.alphaCutoff = (orig as any).alphaCutoff;
          }
        });
      }
    } catch {}

    // Apply requested variant mesh assignments for new/edited materials
    try {
      // Build map: material name -> array of mesh names to assign as variants
      const variantMeshesByMaterial = new Map<string, string[]>();
      (materials as any[]).forEach((m) => {
        if (m?.name && Array.isArray((m as any).variantMeshes) && (m as any).variantMeshes.length > 0) {
          const unique = Array.from(new Set((m as any).variantMeshes as Array<string | null | undefined>))
            .filter((v): v is string => typeof v === 'string' && v.length > 0);
          if (unique.length > 0) variantMeshesByMaterial.set(m.name, unique);
        }
      });
      if (variantMeshesByMaterial.size > 0 && Array.isArray((out as any).materials)) {
        // Helper: resolve material index by name from current out.materials
        const nameToIndex = new Map<string, number>();
        (out.materials as any[]).forEach((m: any, idx: number) => { if (m?.name) nameToIndex.set(m.name, idx); });

        // Ensure top-level KHR_materials_variants exists and prepare variant name lookup
        (out as any).extensions = (out as any).extensions || {};
        const extRoot = (out as any).extensions;
        const kmv = (extRoot.KHR_materials_variants = extRoot.KHR_materials_variants || { variants: [{ name: 'default' }] });
        const variantsArr: any[] = Array.isArray(kmv.variants) ? kmv.variants : (kmv.variants = [{ name: 'default' }]);
        const variantNameToIndex = new Map<string, number>();
        variantsArr.forEach((v: any, i: number) => { if (v && typeof v.name === 'string') variantNameToIndex.set(v.name, i); });

        // Iterate meshes and primitives, add mapping when mesh name matches
        if (Array.isArray((out as any).meshes)) {
          ((out as any).meshes as any[]).forEach((mesh: any) => {
            const meshName: string | undefined = typeof mesh?.name === 'string' ? mesh.name : undefined;
            if (!meshName || !Array.isArray(mesh?.primitives)) return;
            // Determine if any material requests this mesh
            const requestingMaterials: Array<{ name: string; index: number; varIdx: number }> = [];
            variantMeshesByMaterial.forEach((meshNames, matName) => {
              if (meshNames.includes(meshName)) {
                const idx = nameToIndex.get(matName);
                if (typeof idx === 'number') {
                  // Ensure a variant exists with the material's exact name
                  let vIdx = variantNameToIndex.get(matName);
                  if (typeof vIdx !== 'number') {
                    variantsArr.push({ name: matName });
                    vIdx = variantsArr.length - 1;
                    variantNameToIndex.set(matName, vIdx);
                  }
                  requestingMaterials.push({ name: matName, index: idx, varIdx: vIdx });
                }
              }
            });
            if (requestingMaterials.length === 0) return;

            mesh.primitives.forEach((prim: any) => {
              // If assigning this mesh to new/edited materials, seed their AO from the mesh's current base material
              try {
                const outMaterialsArr: any[] = Array.isArray((out as any).materials) ? (out as any).materials : [];
                const baseMatIdx: number | undefined = (typeof prim?.material === 'number') ? prim.material : undefined;
                const baseMat: any | undefined = (typeof baseMatIdx === 'number') ? outMaterialsArr[baseMatIdx] : undefined;
                const baseAOIdx: number | undefined = (typeof baseMat?.occlusionTexture?.index === 'number') ? baseMat.occlusionTexture.index : undefined;
                const baseAOTexCoord: number | undefined = (typeof baseMat?.occlusionTexture?.texCoord === 'number') ? baseMat.occlusionTexture.texCoord : undefined;
                const baseAOStrength: number | undefined = (typeof baseMat?.occlusionTexture?.strength === 'number') ? baseMat.occlusionTexture.strength : undefined;
                if (typeof baseAOIdx === 'number') {
                  requestingMaterials.forEach(({ index }) => {
                    const tgt = outMaterialsArr[index];
                    if (!tgt) return;
                    const hasAO = typeof tgt?.occlusionTexture?.index === 'number';
                    if (!hasAO) {
                      tgt.occlusionTexture = { index: baseAOIdx, texCoord: (typeof baseAOTexCoord === 'number' ? baseAOTexCoord : 1) };
                      tgt.occlusionTexture.strength = (typeof baseAOStrength === 'number') ? baseAOStrength : 1;
                    }
                  });
                }
              } catch {}
              // Ensure extension containers
              prim.extensions = prim.extensions || {};
              prim.extensions.KHR_materials_variants = prim.extensions.KHR_materials_variants || {};
              const ext = prim.extensions.KHR_materials_variants;
              ext.mappings = Array.isArray(ext.mappings) ? ext.mappings : [];

              // Add/merge mapping for each requested material at the material-named variant index
              requestingMaterials.forEach(({ index, varIdx }) => {
                const existing = ext.mappings.find((m: any) => m && typeof m.material === 'number' && m.material === index);
                if (existing) {
                  existing.variants = Array.isArray(existing.variants) ? existing.variants : [];
                  if (!existing.variants.includes(varIdx)) existing.variants.push(varIdx);
                } else {
                  ext.mappings.push({ material: index, variants: [varIdx] });
                }
              });
            });
          });
        }

        // Ensure extensionsUsed includes KHR_materials_variants
        try {
          (out as any).extensionsUsed = Array.isArray((out as any).extensionsUsed) ? (out as any).extensionsUsed : [];
          if (!(out as any).extensionsUsed.includes('KHR_materials_variants')) (out as any).extensionsUsed.push('KHR_materials_variants');
        } catch {}
      }
    } catch {}

    // Ensure occlusionTexture.strength defaults to 1 when occlusion texture is present but strength missing
    try {
      if (Array.isArray((out as any).materials)) {
        (out as any).materials.forEach((m: any) => {
          const hasAO = typeof m?.occlusionTexture?.index === 'number';
          const hasStrength = typeof m?.occlusionTexture?.strength === 'number';
          if (hasAO && !hasStrength) {
            m.occlusionTexture = m.occlusionTexture || {};
            m.occlusionTexture.strength = 1;
          }
        });
      }
    } catch {}

    // Inline binary buffer as data URI to avoid external .bin files. Keep images external.
    try {
      if (Array.isArray(out.buffers) && writeResult && writeResult.resources) {
        const resources: Record<string, Uint8Array> = writeResult.resources as any;
        (out.buffers as any[]).forEach((buf: any) => {
          const uri: string | undefined = buf?.uri;
          if (!uri) return;
          const data = (resources as any)[uri];
          if (!data) return;
          const base64 = Buffer.from(data).toString('base64');
          buf.uri = `data:application/octet-stream;base64,${base64}`;
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

      let usedTextureTransform = false;

      const applySlot = (outMat: any, slotPath: string[], texKey?: string, transformScale?: [number, number]) => {
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
        // KHR_texture_transform scale (e.g., tiling) if provided
        if (Array.isArray(transformScale) && transformScale.length === 2) {
          target[lastKey].extensions = target[lastKey].extensions || {};
          target[lastKey].extensions.KHR_texture_transform = target[lastKey].extensions.KHR_texture_transform || {};
          target[lastKey].extensions.KHR_texture_transform.scale = [...transformScale];
          usedTextureTransform = true;
        }
      };

      // Apply for all incoming materials (by name)
      if (Array.isArray(out.materials) && Array.isArray(materials)) {
        for (const m of materials as any[]) {
          if (!m?.name) continue;
          const outMat = (out.materials as any[]).find((x) => x?.name === m.name);
          if (!outMat) continue;
          applySlot(outMat, ['pbrMetallicRoughness', 'baseColorTexture'], m.baseColorTexture, (m as any).baseColorTextureScale);
          applySlot(outMat, ['pbrMetallicRoughness', 'metallicRoughnessTexture'], m.metallicRoughnessTexture || (m as any).metallicTexture || (m as any).roughnessTexture);
          applySlot(outMat, ['normalTexture'], m.normalTexture, (m as any).normalTextureScale);
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
          // Persist occlusionTexture.strength in raw JSON when texture index exists
          try {
            if (
              typeof m.occlusionStrength === 'number' &&
              !isNaN(m.occlusionStrength) &&
              outMat.occlusionTexture &&
              typeof outMat.occlusionTexture.index === 'number'
            ) {
              outMat.occlusionTexture.strength = m.occlusionStrength;
            }
          } catch {}
          applySlot(outMat, ['emissiveTexture'], m.emissiveTexture);
          // Sheen optional
          if (m.sheenRoughnessTexture || (m as any).sheenTexture || m.sheenColorTexture) {
            outMat.extensions = outMat.extensions || {};
            outMat.extensions.KHR_materials_sheen = outMat.extensions.KHR_materials_sheen || {};
            if (m.sheenRoughnessTexture || (m as any).sheenTexture) {
              applySlot(outMat.extensions.KHR_materials_sheen, ['sheenRoughnessTexture'], m.sheenRoughnessTexture || (m as any).sheenTexture, (m as any).sheenRoughnessTextureScale);
              const tc = (m as any).sheenRoughnessTextureTexCoord;
              if (typeof tc === 'number') {
                const tgt = outMat.extensions.KHR_materials_sheen;
                tgt.sheenRoughnessTexture = tgt.sheenRoughnessTexture || {};
                tgt.sheenRoughnessTexture.texCoord = tc;
              }
            }
            if (m.sheenColorTexture) {
              applySlot(outMat.extensions.KHR_materials_sheen, ['sheenColorTexture'], m.sheenColorTexture, (m as any).sheenColorTextureScale);
              const tc = (m as any).sheenColorTextureTexCoord;
              if (typeof tc === 'number') {
                const tgt = outMat.extensions.KHR_materials_sheen;
                tgt.sheenColorTexture = tgt.sheenColorTexture || {};
                tgt.sheenColorTexture.texCoord = tc;
              }
            }
          }
        }
      }

      // Ensure extensionsUsed contains KHR_texture_transform if we wrote any transforms
      if (usedTextureTransform) {
        try {
          (out as any).extensionsUsed = Array.isArray((out as any).extensionsUsed) ? (out as any).extensionsUsed : [];
          if (!(out as any).extensionsUsed.includes('KHR_texture_transform')) (out as any).extensionsUsed.push('KHR_texture_transform');
        } catch {}
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

    // Preserve existing sheen texture bindings (and their KHR_texture_transform) for materials where they were not explicitly changed
    try {
      if (Array.isArray((gltfData as any).materials) && Array.isArray((out as any).materials)) {
        const originalByName = new Map<string, any>();
        ((gltfData as any).materials as any[]).forEach((m) => { if (m?.name) originalByName.set(m.name, m); });
        ((out as any).materials as any[]).forEach((m) => {
          if (!m?.name) return;
          const orig = originalByName.get(m.name);
          if (!orig) return;
          const oSheen = orig?.extensions?.KHR_materials_sheen;
          if (!oSheen) return;
          m.extensions = m.extensions || {};
          const tSheen = m.extensions.KHR_materials_sheen || {};
          // Determine whether client explicitly changed each sheen texture (presence of key, even if null)
          const input = (materials as any[]).find((im) => im?.name === m.name) || {};
          const changedColor = Object.prototype.hasOwnProperty.call(input, 'sheenColorTexture');
          const changedRough = Object.prototype.hasOwnProperty.call(input, 'sheenRoughnessTexture') || Object.prototype.hasOwnProperty.call(input, 'sheenTexture');
          // If target lacks sheen textures but original had them, copy original TextureInfo objects verbatim
          if ((tSheen.sheenColorTexture == null) && oSheen.sheenColorTexture && !changedColor) {
            tSheen.sheenColorTexture = { ...oSheen.sheenColorTexture };
          }
          if ((tSheen.sheenRoughnessTexture == null) && oSheen.sheenRoughnessTexture && !changedRough) {
            tSheen.sheenRoughnessTexture = { ...oSheen.sheenRoughnessTexture };
          }
          // Preserve factors if target omitted them
          if (tSheen.sheenColorFactor == null && Array.isArray(oSheen.sheenColorFactor)) {
            tSheen.sheenColorFactor = [...oSheen.sheenColorFactor];
          }
          if (tSheen.sheenRoughnessFactor == null && typeof oSheen.sheenRoughnessFactor === 'number') {
            tSheen.sheenRoughnessFactor = oSheen.sheenRoughnessFactor;
          }
          if (Object.keys(tSheen).length > 0) {
            m.extensions.KHR_materials_sheen = tSheen;
          }
        });
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

    // Before we upload the updated reference.gltf, create a timestamped backup
    try {
      const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = clientConfig.bunnyCdn.backupsPath.replace(/\/$/, '');
      const backupFilePath = `${backupDir}/reference-${backupTimestamp}.gltf`;
      await uploadToBunny(backupFilePath, gltfText, 'model/gltf+json');
    } catch (e) {
      console.warn('Backup of reference.gltf failed; proceeding with save', e);
    }

    // Final upload
    const updatedGltfContent = JSON.stringify(out, null, 2);
    const filePath = `${clientConfig.bunnyCdn.referencePath}`;
    await uploadToBunny(filePath, updatedGltfContent, 'model/gltf+json');
    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${filePath}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving materials:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save materials' }, { status: 500 });
  }
}


