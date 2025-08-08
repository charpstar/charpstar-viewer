// src/types/gltf.d.ts
// Types for GLTF processing based on materia-updater

export interface GltfImage {
  uri?: string;
  mimeType?: string;
  bufferView?: number;
  name?: string;
}

export interface GltfTexture {
  sampler: number;
  source: number;
  name?: string;
  extensions?: {
    KHR_texture_transform?: {
      offset?: [number, number];
      rotation?: number;
      scale?: [number, number];
    };
  };
}

export interface GltfMaterial {
  name: string;
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number; texCoord?: number };
    metallicRoughnessTexture?: { index: number; texCoord?: number };
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  normalTexture?: { index: number; texCoord?: number; scale?: number };
  occlusionTexture?: { index: number; texCoord?: number; strength?: number };
  emissiveTexture?: { index: number; texCoord?: number };
  emissiveFactor?: [number, number, number];
  extensions?: {
    KHR_materials_sheen?: {
      sheenColorTexture?: { index: number; texCoord?: number };
      sheenRoughnessTexture?: { index: number; texCoord?: number };
    };
  };
}

export interface GltfMesh {
  name: string;
  primitives: Array<{
    attributes: { [key: string]: number };
    material?: number;
    indices?: number;
    mode?: number;
    extensions?: {
      KHR_materials_variants?: {
        mappings: Array<{
          material: number;
          variants: number[];
        }>;
      };
      KHR_draco_mesh_compression?: any;
    };
  }>;
}

export interface GltfData {
  asset: { version: string; generator?: string };
  materials?: GltfMaterial[] | string;
  meshes?: GltfMesh[];
  textures?: GltfTexture[] | string;
  images?: GltfImage[] | string;
  samplers?: any[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  externalImagesUri?: string;
  extensions?: {
    KHR_materials_variants?: {
      variants: Array<{ name: string }>;
    };
  };
}

export interface MaterialData {
  materials: Array<{ name: string; tags: string[] }>;
  meshAssignments: { [meshName: string]: MeshAssignment };
  meshGroups?: { [groupId: string]: MeshGroup };
  models?: { [modelName: string]: string[] };
}

export interface MeshAssignment {
  defaultMaterial: string;
  variants: Array<{ name: string; material: string }>;
}

export interface MeshGroup {
  id: string;
  name: string;
  filenames: string[];
  meshes: { [meshName: string]: MeshAssignment };
}