// Basic interface for original material state
interface OriginalMaterialState {
  color: { r: number; g: number; b: number };
  roughness: number;
  metalness: number;
  opacity: number;
  sheenColor?: { r: number; g: number; b: number };
  sheenRoughness?: number;
  baseColorFactor?: number[];
  type?: string;
  name?: string;
  [key: string]: any;
}

// Interface for material editor state
interface MaterialEditorState {
  materialId: string;
  changes: {
    color?: { r: number; g: number; b: number };
    sheenColor?: { r: number; g: number; b: number };
    roughness?: number;
    metalness?: number;
    opacity?: number;
    sheenRoughness?: number;
    [key: string]: any;
  };
}

// Singleton class to manage material states
class MaterialStateManager {
  private static instance: MaterialStateManager;
  private originalStates = new Map<string, OriginalMaterialState>();
  private editorStates = new Map<string, MaterialEditorState>();

  static getInstance(): MaterialStateManager {
    if (!MaterialStateManager.instance) {
      MaterialStateManager.instance = new MaterialStateManager();
    }
    return MaterialStateManager.instance;
  }

  // Store original material state
  preserveOriginalState(material: any): void {
    const materialId = material.uuid || material.id || `material_${Date.now()}`;

    if (!this.originalStates.has(materialId)) {
      const originalState: OriginalMaterialState = {
        color: {
          r: material.color.r,
          g: material.color.g,
          b: material.color.b,
        },
        roughness: material.roughness || 0.5,
        metalness: material.metalness || 0,
        opacity: material.opacity || 1,
      };

      // Store sheen properties if they exist
      if (material.sheenColor) {
        originalState.sheenColor = {
          r: material.sheenColor.r,
          g: material.sheenColor.g,
          b: material.sheenColor.b,
        };
      }
      if (material.sheenRoughness !== undefined) {
        originalState.sheenRoughness = material.sheenRoughness;
      }

      // Store baseColorFactor if it exists
      if (material.userData?.baseColorFactor) {
        originalState.baseColorFactor = [...material.userData.baseColorFactor];
      }

      // Store material type and name
      originalState.type = material.type;
      originalState.name = material.name;

      this.originalStates.set(materialId, originalState);

      // Mark material with our ID for later reference
      if (!material.userData) {
        material.userData = {};
      }
      material.userData.materialStateId = materialId;

      console.log(
        `Preserved original state for material: ${material.name || "Unnamed"}`
      );
    }
  }

  // Apply editor changes without modifying original material
  applyEditorChanges(material: any, changes: any): void {
    const materialId = material.userData?.materialStateId;
    if (!materialId) return;

    // Store editor state
    this.editorStates.set(materialId, {
      materialId,
      changes,
    });

    // Apply changes to material (these are temporary)
    if (changes.color) {
      material.color.setRGB(changes.color.r, changes.color.g, changes.color.b);
    }
    if (changes.sheenColor) {
      if (material.sheenColor) {
        material.sheenColor.setRGB(
          changes.sheenColor.r,
          changes.sheenColor.g,
          changes.sheenColor.b
        );
      }
    }
    if (changes.roughness !== undefined) {
      material.roughness = changes.roughness;
    }
    if (changes.metalness !== undefined) {
      material.metalness = changes.metalness;
    }
    if (changes.opacity !== undefined) {
      material.opacity = changes.opacity;
    }
    if (changes.sheenRoughness !== undefined) {
      material.sheenRoughness = changes.sheenRoughness;
    }

    // Mark that material needs update
    material.needsUpdate = true;
  }

  // Get current editor changes for a material
  getEditorChanges(material: any): any {
    const materialId = material.userData?.materialStateId;
    if (!materialId) return {};

    const editorState = this.editorStates.get(materialId);
    return editorState?.changes || {};
  }

  // Clear all states (useful for cleanup)
  clearAllStates(): void {
    this.originalStates.clear();
    this.editorStates.clear();
  }
}

export default MaterialStateManager;
