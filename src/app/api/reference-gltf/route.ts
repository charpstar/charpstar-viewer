import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';
import { NodeIO, Document, Material, Texture } from '@gltf-transform/core';
import { KHRTextureTransform, KHRMaterialsSheen, KHRMaterialsTransmission, KHRMaterialsVariants } from '@gltf-transform/extensions';

const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    const listBackups = searchParams.get('listBackups');
    if (!client) return NextResponse.json({ error: 'Client parameter is required' }, { status: 400 });

    const clientConfig = getClientConfig(client);
    const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;
    console.log(`Fetching reference GLTF for client ${client}: ${referenceUrl}`);

    // If listing backups only, return backup list
    if (listBackups === '1') {
      // Backups live under <basePath>/reference/backup/
      const backupsBase = `${clientConfig.bunnyCdn.basePath}/reference/backup/`;
      // We cannot list via pull zone; use storage API
      const zone = (process.env.BUNNY_STORAGE_ZONE_NAME || '').split('/')[0];
      const host = (process.env.BUNNY_REGION || '') ? `${process.env.BUNNY_REGION}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
      const resp = await fetch(`https://${host}/${zone}/${backupsBase}`, {
        method: 'GET',
        headers: { 'AccessKey': process.env.BUNNY_ACCESS_KEY || '' }
      });
      let items: any[] = [];
      if (resp.ok) {
        try { items = await resp.json(); } catch {}
      }
      const backups = (Array.isArray(items) ? items : [])
        .filter((e: any) => e && e.ObjectName && !e.IsDirectory && /\.gltf$/i.test(e.ObjectName))
        .map((e: any) => ({
          name: e.ObjectName as string,
          url: `https://${BUNNY_PULL_ZONE_URL}/${backupsBase}${e.ObjectName}`,
          size: e.Length,
          lastModified: e.LastChanged,
        }));
      return NextResponse.json({ backups });
    }

    // Fetch reference JSON
    const response = await fetch(referenceUrl);
    if (!response.ok) throw new Error(`Failed to fetch reference GLTF: ${response.status}`);
    const gltfText = await response.text();
    const gltfData = JSON.parse(gltfText);

    // Prepare external buffer resources (skip images to avoid heavy downloads)
    const resources: Record<string, Uint8Array> = {};
    const referenceDir = new URL('./', referenceUrl).toString();
    if (Array.isArray(gltfData.buffers)) {
      const tasks = gltfData.buffers.map(async (buf: any) => {
        if (buf && typeof buf.uri === 'string' && !buf.uri.startsWith('data:')) {
          const bufUrl = new URL(buf.uri, referenceDir).toString();
          const bufResp = await fetch(bufUrl);
          if (bufResp.ok) resources[buf.uri] = new Uint8Array(await bufResp.arrayBuffer());
        }
      });
      await Promise.all(tasks);
    }

    // Read with glTF-Transform (non-destructive)
    const io = new NodeIO();
    // Register only non-Draco extensions; reference should not require Draco
    io.registerExtensions([
      KHRTextureTransform,
      KHRMaterialsSheen,
      KHRMaterialsTransmission,
      KHRMaterialsVariants,
    ]);
    const document: Document = await io.readJSON({ json: gltfData, resources } as any);
    const root = document.getRoot();

    const stripImagesPrefix = (uri?: string | null) => {
      if (!uri) return undefined;
      return uri.startsWith('images/') ? uri.slice(7) : uri;
    };

    // Extract materials DTO (use PBR block for base/mr)
    let materials = root.listMaterials().map((mat: Material) => {
      const pbr = (mat as any).getPBRMetallicRoughness?.();
      const baseInfo = pbr?.getBaseColorTextureInfo?.();
      const mrInfo = pbr?.getMetallicRoughnessTextureInfo?.();
      const nInfo = (mat as any).getNormalTextureInfo?.();
      const oInfo = (mat as any).getOcclusionTextureInfo?.();
      const eInfo = (mat as any).getEmissiveTextureInfo?.();

      const baseTex = pbr?.getBaseColorTexture?.();
      const mrTex = pbr?.getMetallicRoughnessTexture?.();
      const nTex = (mat as any).getNormalTexture?.();
      const oTex = (mat as any).getOcclusionTexture?.();
      const eTex = (mat as any).getEmissiveTexture?.();

      const texToKey = (tex?: Texture | null): string | undefined => {
        const img = (tex as any)?.getImage?.();
        const uri: string | undefined = img?.getURI?.();
        const name: string | undefined = img?.getName?.();
        return stripImagesPrefix(uri || name || undefined);
      };

      const sheen = (mat as any).getExtension?.('KHR_materials_sheen');
      const baseTransform = baseInfo?.getExtension?.('KHR_texture_transform' as any) as any;
      const mrTransform = mrInfo?.getExtension?.('KHR_texture_transform' as any) as any;
      const normalTransform = nInfo?.getExtension?.('KHR_texture_transform' as any) as any;
      const baseScale = baseTransform?.getScale?.();
      const mrScale = mrTransform?.getScale?.();
      const normalScale = normalTransform?.getScale?.();
      // Sheen texture transform scales
      const sheenColorInfo = sheen?.getSheenColorTextureInfo?.();
      const sheenRoughInfo = sheen?.getSheenRoughnessTextureInfo?.();
      const sheenColorTransform = sheenColorInfo?.getExtension?.('KHR_texture_transform' as any) as any;
      const sheenRoughTransform = sheenRoughInfo?.getExtension?.('KHR_texture_transform' as any) as any;
      const sheenColorScale = sheenColorTransform?.getScale?.();
      const sheenRoughScale = sheenRoughTransform?.getScale?.();

      const dto: any = {
        name: mat.getName() || 'Unnamed Material',
        baseColor: (pbr?.getBaseColorFactor?.() || (mat as any).getBaseColorFactor?.() || [1, 1, 1, 1]),
        metallicFactor: (pbr?.getMetallicFactor?.() ?? (mat as any).getMetallicFactor?.() ?? 0),
        roughnessFactor: (pbr?.getRoughnessFactor?.() ?? (mat as any).getRoughnessFactor?.() ?? 0.5),
        emissiveFactor: (mat as any).getEmissiveFactor?.() || [0, 0, 0],
        normalScale: nInfo?.getScale?.() ?? 1,
        // Prefer TextureInfo strength when occlusion texture exists; fallback later to raw JSON
        occlusionStrength: (oInfo?.getStrength?.() ?? undefined),
        baseColorTexture: texToKey(baseTex),
        metallicRoughnessTexture: texToKey(mrTex),
        normalTexture: texToKey(nTex),
        occlusionTexture: texToKey(oTex),
        emissiveTexture: texToKey(eTex),
        // Texture tiling (KHR_texture_transform scale)
        baseColorTextureScale: Array.isArray(baseScale) ? baseScale : undefined,
        metallicRoughnessTextureScale: Array.isArray(mrScale) ? mrScale : undefined,
        normalTextureScale: Array.isArray(normalScale) ? normalScale : undefined,
        sheenRoughnessFactor: sheen?.getSheenRoughnessFactor?.(),
        sheenRoughnessTexture: texToKey(sheen?.getSheenRoughnessTexture?.()),
        sheenColor: sheen?.getSheenColorFactor?.(),
        sheenColorTexture: texToKey(sheen?.getSheenColorTexture?.()),
        sheenColorTextureScale: Array.isArray(sheenColorScale) ? sheenColorScale : undefined,
        sheenRoughnessTextureScale: Array.isArray(sheenRoughScale) ? sheenRoughScale : undefined,
      };

      // Fallback for normalScale: read from raw JSON if present (ensures 0 is preserved)
      try {
        const matJson = (gltfData.materials || []).find((mj: any) => mj?.name === dto.name);
        const ns = matJson?.normalTexture?.scale;
        if (typeof ns === 'number') dto.normalScale = ns;
      } catch {}

      return dto;
    });

    // Fallback: if some texture fields are missing, resolve directly from original JSON by name
    const imagesJson: any[] = Array.isArray(gltfData.images) ? gltfData.images : [];
    const texturesJson: any[] = Array.isArray(gltfData.textures) ? gltfData.textures : [];
    const materialsJson: any[] = Array.isArray(gltfData.materials) ? gltfData.materials : [];

    const getUriFromTexIndex = (idx?: number) => {
      if (typeof idx !== 'number') return undefined;
      const tex = texturesJson[idx];
      if (!tex || typeof tex.source !== 'number') return undefined;
      const img = imagesJson[tex.source];
      const uri = img?.uri || img?.name;
      return typeof uri === 'string' ? stripImagesPrefix(uri) : undefined;
    };

    materials = materials.map((m) => {
      const original = materialsJson.find((mj: any) => mj?.name === m.name);
      if (!original) return m;
      const pbr = original.pbrMetallicRoughness || {};
      const baseIdx = pbr.baseColorTexture?.index;
      const mrIdx = pbr.metallicRoughnessTexture?.index;
      const nIdx = original.normalTexture?.index;
      const oIdx = original.occlusionTexture?.index;
      const eIdx = original.emissiveTexture?.index;
      // Sheen extension fallbacks
      const sheenExt = original.extensions?.KHR_materials_sheen || {};
      const sheenColorIdx = sheenExt.sheenColorTexture?.index;
      const sheenRoughIdx = sheenExt.sheenRoughnessTexture?.index;
      const sheenColorScaleRaw = sheenExt?.sheenColorTexture?.extensions?.KHR_texture_transform?.scale;
      const sheenRoughScaleRaw = sheenExt?.sheenRoughnessTexture?.extensions?.KHR_texture_transform?.scale;
      // Texture transform (tiling) fallbacks
      const baseScale = pbr.baseColorTexture?.extensions?.KHR_texture_transform?.scale;
      const mrScaleRaw = pbr.metallicRoughnessTexture?.extensions?.KHR_texture_transform?.scale;
      const normalScale = original.normalTexture?.extensions?.KHR_texture_transform?.scale;
      return {
        ...m,
        baseColorTexture: m.baseColorTexture ?? getUriFromTexIndex(baseIdx),
        metallicRoughnessTexture: m.metallicRoughnessTexture ?? getUriFromTexIndex(mrIdx),
        normalTexture: m.normalTexture ?? getUriFromTexIndex(nIdx),
        occlusionTexture: m.occlusionTexture ?? getUriFromTexIndex(oIdx),
        emissiveTexture: m.emissiveTexture ?? getUriFromTexIndex(eIdx),
        sheenColorTexture: (m as any).sheenColorTexture ?? getUriFromTexIndex(sheenColorIdx),
        sheenRoughnessTexture: (m as any).sheenRoughnessTexture ?? getUriFromTexIndex(sheenRoughIdx),
        baseColorTextureScale: (m as any).baseColorTextureScale ?? (Array.isArray(baseScale) ? baseScale : undefined),
        metallicRoughnessTextureScale: (m as any).metallicRoughnessTextureScale ?? (Array.isArray(mrScaleRaw) ? mrScaleRaw : undefined),
        normalTextureScale: (m as any).normalTextureScale ?? (Array.isArray(normalScale) ? normalScale : undefined),
          sheenColorTextureScale: (m as any).sheenColorTextureScale ?? (Array.isArray(sheenColorScaleRaw) ? sheenColorScaleRaw : undefined),
          sheenRoughnessTextureScale: (m as any).sheenRoughnessTextureScale ?? (Array.isArray(sheenRoughScaleRaw) ? sheenRoughScaleRaw : undefined),
        // Fallback for occlusionStrength: read from raw JSON when present
        occlusionStrength: m.occlusionStrength ?? (typeof original.occlusionTexture?.strength === 'number' ? original.occlusionTexture.strength : m.occlusionStrength),
      };
    });

    // Compute variant mesh usage per material (from raw JSON for accuracy)
    try {
      const meshesJson: any[] = Array.isArray(gltfData.meshes) ? gltfData.meshes : [];
      const materialsJsonArr: any[] = Array.isArray(gltfData.materials) ? gltfData.materials : [];
      const materialIndexToVariantMeshes = new Map<number, Set<string>>();
      meshesJson.forEach((mesh: any, meshIndex: number) => {
        const meshName = typeof mesh?.name === 'string' && mesh.name.length > 0 ? mesh.name : `Mesh_${meshIndex}`;
        const primitives: any[] = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
        primitives.forEach((prim: any) => {
          const maps = prim?.extensions?.KHR_materials_variants?.mappings;
          if (Array.isArray(maps)) {
            maps.forEach((map: any) => {
              const matIndex = map?.material;
              if (typeof matIndex === 'number') {
                if (!materialIndexToVariantMeshes.has(matIndex)) materialIndexToVariantMeshes.set(matIndex, new Set());
                materialIndexToVariantMeshes.get(matIndex)!.add(meshName);
              }
            });
          }
        });
      });
      const nameToVariantMeshes = new Map<string, string[]>();
      materialsJsonArr.forEach((mat: any, idx: number) => {
        const name = typeof mat?.name === 'string' && mat.name.length > 0 ? mat.name : `Material_${idx}`;
        const set = materialIndexToVariantMeshes.get(idx);
        if (set && set.size > 0) nameToVariantMeshes.set(name, Array.from(set).sort());
      });
      materials = materials.map((m: any) => ({
        ...m,
        variantMeshes: nameToVariantMeshes.get(m.name) || [],
      }));
    } catch {}

    // Build arrays for UI
    const textures = root.listTextures().map((tex: Texture, index: number) => ({
      name: tex.getName() || `Texture_${index}`,
    }));
    const images = Array.isArray(gltfData.images)
      ? gltfData.images.map((img: any, index: number) => ({
          name: img.name || `Image_${index}`,
          uri: stripImagesPrefix(img.uri || undefined),
          mimeType: img.mimeType,
        }))
      : [];

    // Provide list of mesh names for UI (variant assignment)
    const meshes = Array.isArray(gltfData.meshes)
      ? gltfData.meshes.map((m: any, idx: number) => (typeof m?.name === 'string' && m.name.length > 0 ? m.name : `Mesh_${idx}`))
      : [];

    const res = NextResponse.json({
      materials,
      textures,
      images,
      meshes,
      lastModified: new Date().toISOString(),
    });
    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
  } catch (error) {
    console.error('Error fetching reference GLTF:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch reference GLTF' }, { status: 500 });
  }
}
