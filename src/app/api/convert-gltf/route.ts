import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getDefaultClientName, getClientConfig } from '@/config/clientConfig';
import { GltfData, GltfMaterial, GltfTexture, GltfImage, GltfMesh } from '@/types/gltf';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';
const DEFAULT_CLIENT = getDefaultClientName();

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

// Helper to upload a file to BunnyCDN
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
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(buffer);
    req.end();
  });
};

// Helper to purge cache for a file
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

// Helper to upload processed GLTF to client folder
const uploadToClientFolder = async (content: string, filename: string, clientConfig: any): Promise<void> => {
  const basePath = clientConfig.bunnyCdn.basePath;
  const filePath = `${basePath}/${filename}`;
  
  // Upload the GLTF file
  await uploadToBunny(filePath, content, 'model/gltf+json');
  
  // Purge cache for the uploaded GLTF
  const gltfUrl = `https://${BUNNY_PULL_ZONE_URL}/${encodeURI(filePath)}`;
  await purgeCache(gltfUrl);
  
  console.log(`Successfully uploaded ${filename} to ${filePath}`);
};

// Helper function to get image sort key (AO images first, then alphabetical)
function getImageSortKey(image: GltfImage, index: number): string {
  let imageName = '';
  if (image.name) {
    imageName = image.name;
  } else if (image.uri) {
    const filename = image.uri.split('/').pop() || '';
    imageName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  }

  // AO images get priority (prefix "000_")
  if (imageName.endsWith('_AO')) {
    return `000_${imageName.toLowerCase()}`;
  }

  // Regular sorting for non-AO images
  if (imageName) {
    return `001_${imageName.toLowerCase()}`;
  } else {
    return `zzz_embedded_${index.toString().padStart(4, '0')}`; // Put embedded images at end
  }
}

// Helper function to get texture sort key (AO texture first, then alphabetical)
function getTextureSortKey(texture: GltfTexture, index: number): string {
  const textureName = texture.name || '';

  // Special AO texture gets top priority (prefix "000_")
  if (textureName === 'tex_AmbientOcclusion_A') {
    return `000_${textureName.toLowerCase()}`;
  }

  // Regular sorting for other textures
  if (textureName) {
    return `001_${textureName.toLowerCase()}`;
  } else {
    return `zzz_unnamed_${index.toString().padStart(4, '0')}`; // Put unnamed textures at end
  }
}

// Helper function to find all texture references in materials
function findAllTextureReferences(gltfData: GltfData): Array<{ object: any; key: string }> {
  const references: Array<{ object: any; key: string }> = [];

  const materials = Array.isArray(gltfData.materials) ? gltfData.materials : [];
  materials.forEach((material: GltfMaterial) => {
    // PBR textures
    const pbr = material.pbrMetallicRoughness;
    if (pbr) {
      if (pbr.baseColorTexture && typeof pbr.baseColorTexture.index === 'number') {
        references.push({ object: pbr.baseColorTexture, key: 'index' });
      }
      if (pbr.metallicRoughnessTexture && typeof pbr.metallicRoughnessTexture.index === 'number') {
        references.push({ object: pbr.metallicRoughnessTexture, key: 'index' });
      }
    }

    // Other material textures
    if (material.normalTexture && typeof material.normalTexture.index === 'number') {
      references.push({ object: material.normalTexture, key: 'index' });
    }
    if (material.occlusionTexture && typeof material.occlusionTexture.index === 'number') {
      references.push({ object: material.occlusionTexture, key: 'index' });
    }
    if (material.emissiveTexture && typeof material.emissiveTexture.index === 'number') {
      references.push({ object: material.emissiveTexture, key: 'index' });
    }

    // Extension textures
    const extensions = material.extensions;
    if (extensions) {
      Object.values(extensions).forEach((extData: any) => {
        if (typeof extData === 'object' && extData !== null) {
          Object.values(extData).forEach((propValue: any) => {
            if (typeof propValue === 'object' && propValue !== null && typeof propValue.index === 'number') {
              references.push({ object: propValue, key: 'index' });
            }
          });
        }
      });
    }
  });

  return references;
}

// Helper function to find all image references in textures
function findAllImageReferences(gltfData: GltfData): Array<{ object: any; key: string }> {
  const references: Array<{ object: any; key: string }> = [];

  const textures = Array.isArray(gltfData.textures) ? gltfData.textures : [];
  textures.forEach((texture: GltfTexture) => {
    if (typeof texture.source === 'number') {
      references.push({ object: texture, key: 'source' });
    }
  });

  return references;
}

// Helper to find target AO image (AO image in uploaded file)
function findTargetAOImage(targetData: GltfData): number | null {
  const images = Array.isArray(targetData.images) ? targetData.images : [];

  const isAOName = (label: string): boolean => {
    if (!label) return false;
    const lower = label.toLowerCase();
    // Common AO name patterns, case-insensitive
    return (
      lower.endsWith('_ao') ||
      lower.endsWith('-ao') ||
      /(^|[_\-.])ao($|[_\-.])/.test(lower) ||
      lower.includes('ambientocclusion') ||
      lower.includes('occlusion') // fallback heuristic
    );
  };

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const label = (typeof image.name === 'string' && image.name.trim())
      ? image.name
      : (typeof image.uri === 'string' ? image.uri : '');
    if (isAOName(label)) {
      return i;
    }
  }
  return null;
}

// Helper to find reference AO texture (AO texture in reference file)
function findReferenceAOTexture(referenceData: GltfData): number | null {
  const textures = Array.isArray(referenceData.textures) ? referenceData.textures : [];
  
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    if (texture.name === 'tex_AmbientOcclusion_A') {
      return i;
    }
  }
  
  return null;
}

// Helper function to handle AO texture preservation
function handleAOTextures(
  targetData: GltfData,
  referenceData: GltfData
): {
  updatedTextures: GltfTexture[];
  updatedImages: GltfImage[];
  aoTextureIndex: number | null;
} {
  const referenceTextures = Array.isArray(referenceData.textures) ? referenceData.textures : [];
  const referenceImages = Array.isArray(referenceData.images) ? referenceData.images : [];

  const targetImages = Array.isArray(targetData.images) ? targetData.images : [];

  // If target has no images, just return reference assets untouched
  if (targetImages.length === 0) {
    return {
      updatedTextures: [...referenceTextures] as GltfTexture[],
      updatedImages: [...referenceImages] as GltfImage[],
      aoTextureIndex: findReferenceAOTexture(referenceData),
    };
  }

  // Simple rule: use the FIRST image from target as the AO image
  const aoImageFromTarget = JSON.parse(JSON.stringify(targetImages[0])) as GltfImage;

  // Replace reference image[0] (AO) with the target AO image to avoid any index shifts
  const updatedImages: GltfImage[] = [...referenceImages];
  if (updatedImages.length === 0) {
    // If reference unexpectedly has no images, start with AO at index 0
    updatedImages.push(aoImageFromTarget);
  } else {
    updatedImages[0] = aoImageFromTarget;
  }

  // Keep texture indices stable; only ensure AO texture points to image[0]
  const updatedTextures: GltfTexture[] = referenceTextures.map((t: any) => ({ ...t })) as any;

  // Find AO texture in reference, if any; otherwise create it
  let aoTextureIndex = findReferenceAOTexture(referenceData);
  if (typeof aoTextureIndex === 'number' && aoTextureIndex >= 0 && aoTextureIndex < updatedTextures.length) {
    (updatedTextures[aoTextureIndex] as any).source = 0;
  } else {
    const newAoTex = { name: 'tex_AmbientOcclusion_A', source: 0 } as any;
    updatedTextures.push(newAoTex);
    aoTextureIndex = updatedTextures.length - 1;
  }

  console.log('AO Texture (replace ref image[0]) wired to image index 0:', {
    aoTextureIndex,
    aoImageName: (aoImageFromTarget as any)?.name,
    aoImageMime: (aoImageFromTarget as any)?.mimeType,
  });

  return { updatedTextures, updatedImages, aoTextureIndex };
}

// Helper function to ensure required extensions are present
function ensureExtensions(targetData: GltfData) {
  if (!targetData.extensionsUsed) {
    targetData.extensionsUsed = [];
  }
  if (!targetData.extensionsRequired) {
    targetData.extensionsRequired = [];
  }

  const requiredExtensions = ['KHR_texture_transform', 'KHR_materials_variants'];
  const usedExtensions = ['KHR_texture_transform', 'KHR_materials_variants'];

  usedExtensions.forEach(ext => {
    if (!targetData.extensionsUsed!.includes(ext)) {
      targetData.extensionsUsed!.push(ext);
    }
  });

  requiredExtensions.forEach(ext => {
    if (!targetData.extensionsRequired!.includes(ext)) {
      targetData.extensionsRequired!.push(ext);
    }
  });
}

// Helper function to update variant mappings (from materia-updater)
function updateVariantMappings(
  primitive: any,
  materialIndexMapping: Map<number | string, number>
) {
  if (primitive.extensions?.KHR_materials_variants?.mappings) {
    primitive.extensions.KHR_materials_variants.mappings = 
      primitive.extensions.KHR_materials_variants.mappings.map((mapping: any) => ({
        ...mapping,
        material: materialIndexMapping.get(mapping.material) ?? mapping.material
      }));
  }
}

// Helper function to reorder textures and images alphabetically (from materia-updater)
function reorderTexturesAndImages(targetData: GltfData): void {
  const images = Array.isArray(targetData.images) ? targetData.images : [];
  const textures = Array.isArray(targetData.textures) ? targetData.textures : [];

  if (images.length === 0 && textures.length === 0) {
    return;
  }

  console.log(`Reordering ${images.length} images and ${textures.length} textures`);

  // Find all references before sorting
  const textureReferences = findAllTextureReferences(targetData);
  const imageReferences = findAllImageReferences(targetData);

  console.log(`Found ${textureReferences.length} texture references`);
  console.log(`Found ${imageReferences.length} image references`);

  // Sort images
  if (images.length > 0) {
    console.log('Sorting images alphabetically...');

    // Create list of (original_index, image, sort_key)
    const imageItems = images.map((img: GltfImage, i: number) => ({
      originalIndex: i,
      image: img,
      sortKey: getImageSortKey(img, i)
    }));

    // Sort by sort key
    const sortedImageItems = imageItems.sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));

    // Create mapping from old index to new index
    const oldToNewImage = new Map<number, number>();
    const newImages: GltfImage[] = [];

    sortedImageItems.forEach((item: any, newIdx: number) => {
      oldToNewImage.set(item.originalIndex, newIdx);
      newImages.push(item.image);

      const imageName = item.image.name || item.image.uri || `embedded_${item.originalIndex}`;
      const isAO = imageName.endsWith('_AO');
      const priorityMarker = isAO ? ' [AO]' : '';
      console.log(`  ${item.originalIndex} → ${newIdx}: ${imageName}${priorityMarker}`);
    });

    // Update image references
    imageReferences.forEach(ref => {
      const oldIndex = ref.object[ref.key];
      if (oldToNewImage.has(oldIndex)) {
        const newIndex = oldToNewImage.get(oldIndex)!;
        ref.object[ref.key] = newIndex;
      }
    });

    targetData.images = newImages;
  }

  // Sort textures
  if (textures.length > 0) {
    console.log('Sorting textures alphabetically...');

    // Create list of (original_index, texture, sort_key)
    const textureItems = textures.map((tex: GltfTexture, i: number) => ({
      originalIndex: i,
      texture: tex,
      sortKey: getTextureSortKey(tex, i)
    }));

    // Sort by sort key
    const sortedTextureItems = textureItems.sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));

    // Create mapping from old index to new index
    const oldToNewTexture = new Map<number, number>();
    const newTextures: GltfTexture[] = [];

    sortedTextureItems.forEach((item: any, newIdx: number) => {
      oldToNewTexture.set(item.originalIndex, newIdx);
      newTextures.push(item.texture);

      const textureName = item.texture.name || `unnamed_${item.originalIndex}`;
      const isAO = textureName === 'tex_AmbientOcclusion_A';
      const priorityMarker = isAO ? ' [AO]' : '';
      console.log(`  ${item.originalIndex} → ${newIdx}: ${textureName}${priorityMarker}`);
    });

    // Update texture references
    textureReferences.forEach(ref => {
      const oldIndex = ref.object[ref.key];
      if (oldToNewTexture.has(oldIndex)) {
        const newIndex = oldToNewTexture.get(oldIndex)!;
        ref.object[ref.key] = newIndex;
      }
    });

    targetData.textures = newTextures;
  }

  console.log('Texture and image reordering completed');
}

// Deep clone function (simple version)
function cloneDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => cloneDeep(item)) as any;
  if (typeof obj === 'object') {
    const clonedObj = {} as any;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = cloneDeep(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    if (!requestBody || !requestBody.gltfContent || !requestBody.filename || !requestBody.client) {
      return NextResponse.json({ 
        error: 'Missing required fields: gltfContent, filename, and client' 
      }, { status: 400 });
    }
    
    const { gltfContent, filename, client, customFilename } = requestBody;
    const clientConfig = getClientConfig(client);
    
    console.log(`Enhanced GLTF processing: ${filename} for client: ${client}`);
    
    // Parse the uploaded GLTF content (target)
    let targetData: GltfData;
    try {
      targetData = typeof gltfContent === 'string' ? JSON.parse(gltfContent) : gltfContent;
    } catch (parseError) {
      return NextResponse.json({ 
        error: 'Invalid GLTF JSON format' 
      }, { status: 400 });
    }

    // Fetch the reference GLTF file from client's reference folder
    let referenceData: GltfData;
    try {
      const referenceUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/reference/reference.gltf`;
      console.log(`Fetching reference GLTF from: ${referenceUrl}`);
      
      const referenceResponse = await fetch(referenceUrl);
      console.log(`Reference GLTF response status: ${referenceResponse.status}`);
      
      if (!referenceResponse.ok) {
        throw new Error(`Reference GLTF not found (${referenceResponse.status}). Please ensure reference.gltf exists in the reference folder.`);
      }
      
      const referenceText = await referenceResponse.text();
      referenceData = JSON.parse(referenceText);
      console.log('Successfully loaded reference GLTF with:');
      console.log(`  - materials: ${Array.isArray(referenceData.materials) ? referenceData.materials.length + ' items' : typeof referenceData.materials + ' - ' + referenceData.materials}`);
      console.log(`  - textures: ${Array.isArray(referenceData.textures) ? referenceData.textures.length + ' items' : typeof referenceData.textures + ' - ' + referenceData.textures}`);
      console.log(`  - images: ${Array.isArray(referenceData.images) ? referenceData.images.length + ' items' : typeof referenceData.images + ' - ' + referenceData.images}`);
      console.log(`  - meshes: ${Array.isArray(referenceData.meshes) ? referenceData.meshes.length + ' items' : typeof referenceData.meshes + ' - ' + referenceData.meshes}`);
      
    } catch (referenceError) {
      console.error('Error loading reference GLTF:', referenceError);
      const errorMessage = referenceError instanceof Error ? referenceError.message : 'Unknown error';
      return NextResponse.json({ 
        error: `Failed to load reference GLTF: ${errorMessage}` 
      }, { status: 400 });
    }

    // Externalized arrays are no longer supported. Require embedded arrays in reference.gltf.
    if (typeof (referenceData as any).materials === 'string' ||
        typeof (referenceData as any).textures === 'string' ||
        typeof (referenceData as any).images === 'string' ||
        typeof (referenceData as any).externalImagesUri === 'string') {
      return NextResponse.json({
        error: 'Externalized materials/textures/images are no longer supported. Embed arrays directly in reference.gltf.'
      }, { status: 400 });
    }

    // Create properly typed local variables after external reference resolution
    const resolvedReferenceMaterials: GltfMaterial[] = Array.isArray(referenceData.materials) ? referenceData.materials : [];
    const resolvedReferenceTextures: GltfTexture[] = Array.isArray(referenceData.textures) ? referenceData.textures : [];
    const resolvedReferenceImages: GltfImage[] = Array.isArray(referenceData.images) ? referenceData.images : [];
    const resolvedReferenceMeshes: GltfMesh[] = Array.isArray(referenceData.meshes) ? referenceData.meshes : [];
    const resolvedReferenceSamplers: any[] = Array.isArray(referenceData.samplers) ? referenceData.samplers : [];

    console.log('Reference data after type resolution:');
    console.log(`  - ${resolvedReferenceMaterials.length} materials`);
    console.log(`  - ${resolvedReferenceTextures.length} textures`);
    console.log(`  - ${resolvedReferenceImages.length} images`);
    console.log(`  - ${resolvedReferenceMeshes.length} meshes`);

    // Preserve original materials for meshes that don't have reference counterparts
    const originalTargetMaterials: GltfMaterial[] = Array.isArray(targetData.materials) ? [...targetData.materials] : [];
    console.log(`Original target GLTF has ${originalTargetMaterials.length} materials`);
    
    // Initialize arrays if they don't exist in target data
    targetData.materials = targetData.materials || [];
    targetData.textures = targetData.textures || [];
    targetData.images = targetData.images || [];
    targetData.samplers = targetData.samplers || [];
    targetData.meshes = targetData.meshes || [];
    targetData.extensionsUsed = targetData.extensionsUsed || [];
    targetData.extensionsRequired = targetData.extensionsRequired || [];

    // Ensure required extensions are present
    ensureExtensions(targetData);

    // Handle AO texture replacement - preserve target's AO textures while using reference materials
    const { updatedTextures, updatedImages, aoTextureIndex } = handleAOTextures(targetData, {
      ...referenceData,
      textures: resolvedReferenceTextures,
      images: resolvedReferenceImages
    } as GltfData);

    // Copy extensions from reference
    targetData.extensions = referenceData.extensions || {};

    // Identify which meshes have reference counterparts
    const referenceMeshMap = new Map();
    resolvedReferenceMeshes.forEach(refMesh => {
      if (refMesh.name) {
        referenceMeshMap.set(refMesh.name, refMesh);
      }
    });

    // Identify original materials that need to be preserved
    const preservedOriginalMaterials = new Set<number>();
    const meshesWithReference = new Set<string>();
    
    console.log('=== MESH ANALYSIS ===');
    console.log(`Reference meshes available: [${resolvedReferenceMeshes.map(m => m.name).join(', ')}]`);
    console.log(`Target meshes to process: [${Array.isArray(targetData.meshes) ? targetData.meshes.map(m => m.name).join(', ') : 'none'}]`);
    
    if (Array.isArray(targetData.meshes)) {
      targetData.meshes.forEach(targetMesh => {
        if (targetMesh.name && referenceMeshMap.has(targetMesh.name)) {
          meshesWithReference.add(targetMesh.name);
          console.log(`✅ Mesh "${targetMesh.name}" has reference counterpart - will use reference materials`);
        } else {
          console.log(`❌ Mesh "${targetMesh.name}" has NO reference counterpart - preserving original materials`);
          // Mark original materials used by this mesh for preservation
          if (targetMesh.primitives) {
            targetMesh.primitives.forEach((primitive, primitiveIndex) => {
              if (primitive.material !== undefined) {
                preservedOriginalMaterials.add(primitive.material);
                if (primitive.material < originalTargetMaterials.length) {
                  console.log(`  📌 Preserving original material index ${primitive.material} (${originalTargetMaterials[primitive.material].name}) from primitive ${primitiveIndex}`);
                } else {
                  console.log(`  ⚠️ Primitive ${primitiveIndex} references missing material index ${primitive.material} - will create default material`);
                }
              }
            });
          }
        }
      });
    }
    
    console.log(`=== PRESERVATION SUMMARY ===`);
    console.log(`Meshes with reference: ${meshesWithReference.size} - [${Array.from(meshesWithReference).join(', ')}]`);
    console.log(`Meshes without reference: ${Array.isArray(targetData.meshes) ? targetData.meshes.length - meshesWithReference.size : 0}`);
    console.log(`Original materials to preserve: [${Array.from(preservedOriginalMaterials).join(', ')}]`);

    // Create merged materials array: reference materials + preserved original materials
    const orderedMaterials: GltfMaterial[] = [];
    const materialNameToNewIndex = new Map<string | number, number>();
    const originalMaterialIndexToNewIndex = new Map<number, number>();

    // First: Add all reference materials
    resolvedReferenceMaterials.forEach((material, index) => {
      const clonedMaterial = cloneDeep(material);
      orderedMaterials.push(clonedMaterial);
      // Map both by name and old index for proper reference updating
      materialNameToNewIndex.set(material.name, index);
      materialNameToNewIndex.set(index, index);
    });

    // Second: Add preserved original materials (that aren't already covered by reference)
    console.log('=== PRESERVING ORIGINAL MATERIALS ===');
    preservedOriginalMaterials.forEach(originalIndex => {
      if (originalIndex < originalTargetMaterials.length) {
        // Material exists in original GLTF - preserve it
        const originalMaterial = originalTargetMaterials[originalIndex];
        const newIndex = orderedMaterials.length;
        orderedMaterials.push(cloneDeep(originalMaterial));
        originalMaterialIndexToNewIndex.set(originalIndex, newIndex);
        console.log(`📦 Preserved original material at index ${originalIndex} → new index ${newIndex} (${originalMaterial.name})`);
      } else {
        // Material doesn't exist in original GLTF - create default material
        console.log(`🛠️ Creating default material for missing index ${originalIndex}`);
        const defaultMaterial: GltfMaterial = {
          name: `Default_Material_${originalIndex}`,
          pbrMetallicRoughness: {
            baseColorFactor: [0.8, 0.8, 0.8, 1.0], // Light gray
            metallicFactor: 0.0,
            roughnessFactor: 0.5
          }
        };
        const newIndex = orderedMaterials.length;
        orderedMaterials.push(defaultMaterial);
        originalMaterialIndexToNewIndex.set(originalIndex, newIndex);
        console.log(`📦 Created default material at index ${originalIndex} → new index ${newIndex} (${defaultMaterial.name})`);
      }
    });

    console.log(`=== MATERIALS SUMMARY ===`);
    console.log(`Reference materials: ${resolvedReferenceMaterials.length}`);
    console.log(`Preserved original materials: ${preservedOriginalMaterials.size}`);
    console.log(`Total merged materials: ${orderedMaterials.length}`);
    console.log(`Original→New index mappings: ${JSON.stringify(Array.from(originalMaterialIndexToNewIndex.entries()))}`);

    // Process material assignments for all meshes
    if (Array.isArray(targetData.meshes)) {
      console.log('Processing material assignments and variants...');
      
      let meshesWithReference = 0;
      let meshesWithoutReference = 0;
      
      // Process each mesh in the target GLTF
      targetData.meshes.forEach(targetMesh => {
        if (!targetMesh.name) {
          console.warn('Skipping target mesh without name');
          return;
        }
        
        const referenceMesh = referenceMeshMap.get(targetMesh.name);
        
        if (referenceMesh) {
          // Mesh has reference counterpart - copy reference material assignments
          console.log(`🔄 Processing mesh "${targetMesh.name}" with reference counterpart`);
          
          if (targetMesh.primitives && referenceMesh.primitives) {
            targetMesh.primitives.forEach((targetPrimitive, primitiveIndex) => {
              const referencePrimitive = referenceMesh.primitives[primitiveIndex];
              
              if (referencePrimitive) {
                // 1. Copy base material assignment from reference primitive
                if (referencePrimitive.material !== undefined) {
                  const refMaterialName = referencePrimitive.material < resolvedReferenceMaterials.length ? 
                    resolvedReferenceMaterials[referencePrimitive.material].name : 'unknown';
                  targetPrimitive.material = referencePrimitive.material;
                  console.log(`  ✅ Copied material assignment for primitive ${primitiveIndex}: material index ${referencePrimitive.material} (${refMaterialName})`);
                }
                
                // 2. Copy material variants if they exist
                if (referencePrimitive.extensions && 
                    referencePrimitive.extensions.KHR_materials_variants) {
                  
                  // Initialize extensions object if it doesn't exist
                  if (!targetPrimitive.extensions) {
                    targetPrimitive.extensions = {};
                  }
                  
                  // Copy over the KHR_materials_variants extension from reference
                  targetPrimitive.extensions.KHR_materials_variants = 
                    cloneDeep(referencePrimitive.extensions.KHR_materials_variants);
                  
                  console.log(`  ✅ Copied material variants for primitive ${primitiveIndex}`);
                }
              } else {
                console.warn(`  ⚠️ No reference primitive found at index ${primitiveIndex}`);
              }
            });
          }
          meshesWithReference++;
          
        } else {
          // Mesh has NO reference counterpart - preserve original materials with updated indices
          console.log(`🔄 Processing mesh "${targetMesh.name}" without reference counterpart - preserving original materials`);
          
          if (targetMesh.primitives) {
            targetMesh.primitives.forEach((targetPrimitive, primitiveIndex) => {
              if (targetPrimitive.material !== undefined) {
                const originalIndex = targetPrimitive.material;
                const originalMaterialName = originalIndex < originalTargetMaterials.length ? originalTargetMaterials[originalIndex].name : 'unknown';
                const newIndex = originalMaterialIndexToNewIndex.get(originalIndex);
                
                if (newIndex !== undefined) {
                  targetPrimitive.material = newIndex;
                  console.log(`  ✅ Updated original material reference for primitive ${primitiveIndex}: ${originalIndex} (${originalMaterialName}) → ${newIndex}`);
                } else {
                  console.error(`  ❌ Could not find preserved/created material for original index ${originalIndex} (${originalMaterialName})`);
                  console.error(`  Available preserved mappings: ${JSON.stringify(Array.from(originalMaterialIndexToNewIndex.entries()))}`);
                  console.error(`  This should not happen - there may be a bug in the material preservation logic`);
                }
              } else {
                console.log(`  ⚠️ Primitive ${primitiveIndex} has no material assignment`);
              }
            });
          }
          meshesWithoutReference++;
        }
      });
      
      console.log(`Processed ${meshesWithReference} meshes with reference counterparts, ${meshesWithoutReference} meshes without reference (preserved original materials)`);
    }

    // Update variant mappings for meshes that got reference materials
    if (targetData.meshes && targetData.meshes.length > 0) {
      targetData.meshes.forEach(mesh => {
        // Only update variant mappings for meshes that have reference counterparts
        if (mesh.name && referenceMeshMap.has(mesh.name) && mesh.primitives) {
          mesh.primitives.forEach(primitive => {
            if (primitive.extensions?.KHR_materials_variants) {
              updateVariantMappings(primitive, materialNameToNewIndex);
              console.log(`Updated variant mappings for mesh "${mesh.name}" primitive`);
            }
          });
        }
      });
    }

    // Assign the updated assets from reference (complete transplant)
    targetData.materials = orderedMaterials;
    targetData.textures = updatedTextures;
    targetData.images = updatedImages;
    targetData.samplers = resolvedReferenceSamplers;

    // Apply AO texture to all materials (simple mode): ensure every material uses our AO texture
    if (typeof aoTextureIndex === 'number' && aoTextureIndex >= 0) {
      if (Array.isArray(targetData.materials)) {
        targetData.materials.forEach((mat: any, idx: number) => {
          if (!mat || typeof mat !== 'object') return;
          mat.occlusionTexture = { index: aoTextureIndex, texCoord: 1 };
        });
      }
    }

    // Final extension check after all processing
    ensureExtensions(targetData);

    // Create the final processed GLTF content
    const processedGltfContent = JSON.stringify(targetData, null, 2);
    
    console.log('Enhanced GLTF processing completed successfully');
    
    // Upload the processed GLTF to BunnyCDN
    const uploadFilename = customFilename || filename;
    console.log(`📤 Uploading processed GLTF as: ${uploadFilename}`);
    
    // Construct the path for the file in BunnyCDN using client-specific paths
    const filePath = `${clientConfig.bunnyCdn.basePath}/${uploadFilename}`;
    console.log(`Full file path for upload: ${filePath}`);
    
    // Upload to BunnyCDN
    try {
      await uploadToBunny(filePath, processedGltfContent, 'application/json');
      console.log(`✅ Successfully uploaded processed GLTF: ${uploadFilename}`);
    } catch (error) {
      console.error('❌ Failed to upload processed GLTF:', error);
      return NextResponse.json(
        { success: false, error: `Failed to upload processed GLTF: ${error}` },
        { status: 500 }
      );
    }
    
    // Purge cache for the uploaded file
    const fileUrl = `https://cdn.charpstar.net/${clientConfig.bunnyCdn.basePath}/${uploadFilename}`;
    await purgeCache(fileUrl);
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully processed and uploaded: ${uploadFilename}`,
      filename: uploadFilename
    });
    
  } catch (error: unknown) {
    console.error('Error in enhanced convert-gltf route:', error);
    
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json(
      { error: 'Failed to process GLTF: ' + errorMessage },
      { status: 500 }
    );
  }
}