import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';
import { NodeIO, Document, Material, Texture } from '@gltf-transform/core';
import { KHRTextureTransform, KHRMaterialsSheen, KHRMaterialsTransmission, KHRMaterialsVariants } from '@gltf-transform/extensions';

const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client');
    if (!client) return NextResponse.json({ error: 'Client parameter is required' }, { status: 400 });

    const clientConfig = getClientConfig(client);
    const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;
    console.log(`Fetching reference GLTF for client ${client}: ${referenceUrl}`);

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

      const dto: any = {
        name: mat.getName() || 'Unnamed Material',
        baseColor: (pbr?.getBaseColorFactor?.() || (mat as any).getBaseColorFactor?.() || [1, 1, 1, 1]),
        metallicFactor: (pbr?.getMetallicFactor?.() ?? (mat as any).getMetallicFactor?.() ?? 0),
        roughnessFactor: (pbr?.getRoughnessFactor?.() ?? (mat as any).getRoughnessFactor?.() ?? 0.5),
        emissiveFactor: (mat as any).getEmissiveFactor?.() || [0, 0, 0],
        normalScale: nInfo?.getScale?.() ?? 1,
        occlusionStrength: oInfo?.getStrength?.() ?? 1,
        baseColorTexture: texToKey(baseTex),
        metallicRoughnessTexture: texToKey(mrTex),
        normalTexture: texToKey(nTex),
        occlusionTexture: texToKey(oTex),
        emissiveTexture: texToKey(eTex),
        sheenRoughnessFactor: sheen?.getSheenRoughnessFactor?.(),
        sheenRoughnessTexture: texToKey(sheen?.getSheenRoughnessTexture?.()),
        sheenColor: sheen?.getSheenColorFactor?.(),
        sheenColorTexture: texToKey(sheen?.getSheenColorTexture?.()),
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
      return {
        ...m,
        baseColorTexture: m.baseColorTexture ?? getUriFromTexIndex(baseIdx),
        metallicRoughnessTexture: m.metallicRoughnessTexture ?? getUriFromTexIndex(mrIdx),
        normalTexture: m.normalTexture ?? getUriFromTexIndex(nIdx),
        occlusionTexture: m.occlusionTexture ?? getUriFromTexIndex(oIdx),
        emissiveTexture: m.emissiveTexture ?? getUriFromTexIndex(eIdx),
      };
    });

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

    const res = NextResponse.json({
      materials,
      textures,
      images,
      lastModified: new Date().toISOString(),
    });
    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
  } catch (error) {
    console.error('Error fetching reference GLTF:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch reference GLTF' }, { status: 500 });
  }
}
