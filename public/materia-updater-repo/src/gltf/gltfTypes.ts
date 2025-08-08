// src/gltf/gltfTypes.ts

export interface TagSortState {
  name: string;
  enabled: boolean;
  order: number;
}

export interface MaterialSortSettings {
  tagStates: TagSortState[];
  timestamp: number;
  autoSortEnabled: boolean;
}

export interface Material {
  name: string;
  tags: string[];
}

export interface Variant {
  name: string;
  material: string;
}

export interface MeshAssignment {
  defaultMaterial: string;
  variants: Variant[];
  autoTag?: {
    enabled: boolean;
    tag: string;
    selectedMaterials?: string[]; // Materials that should be included
    excludedMaterials?: string[]; // Materials that should be excluded
  };
}

export interface MeshGroup {
  id: string;
  name: string;
  filenames: string[];
  meshes: { [meshName: string]: MeshAssignment };
  isExpanded?: boolean;
}

export interface MaterialData {
  materials: Material[];
  meshAssignments: { [meshName: string]: MeshAssignment };
  meshGroups?: { [groupId: string]: MeshGroup };
  models?: { [modelName: string]: string[] };
  sortSettings?: MaterialSortSettings;
}

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
  };
  normalTexture?: { index: number; texCoord?: number; scale?: number };
  occlusionTexture?: { index: number; texCoord?: number; strength?: number };
  emissiveTexture?: { index: number; texCoord?: number };
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
    extensions?: {
      KHR_materials_variants?: {
        mappings: Array<{
          material: number;
          variants: number[];
        }>;
      };
    };
  }>;
}

export interface GltfData {
  asset: { version: string; generator?: string };
  materials: GltfMaterial[];
  meshes: GltfMesh[];
  textures: GltfTexture[];
  images: GltfImage[];
  samplers: any[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  extensions?: {
    KHR_materials_variants?: {
      variants: Array<{ name: string }>;
    };
  };
}

export interface ExportedVariant {
  fileName: string;
  content: ArrayBuffer;
}