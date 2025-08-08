# Enhanced GLTF Processing System

## Overview

The system has been upgraded with a **reference-based GLTF processing** approach that leverages the materia-updater logic for professional-grade material system integration.

## How It Works

### **1. Client Folder Structure**
Each client needs the following structure on BunnyCDN:
```
Client-Editor/{ClientName}/
├── reference/
│   └── reference.gltf          # Master GLTF with complete material system
├── resources/ (existing)
│   ├── materials.json          # (kept for compatibility)
│   ├── textures.json          # (kept for compatibility)
│   ├── images.json            # (kept for compatibility)
│   └── extensions.json        # (kept for compatibility)
└── {model-files}.gltf         # Processed model files
```

### **2. Processing Workflow**

#### **For GLTF Files:**
1. **📁 Upload**: Client uploads a GLTF file via the manage page (no password required)
2. **🔄 Reference Fetch**: System fetches `reference/reference.gltf` and resolves external references
3. **🎨 Material Transplant**: Complete material system copied from reference to uploaded GLTF
4. **🖼️ AO Preservation**: Uploaded AO textures preserved while using reference materials
5. **🔧 Variant Mapping**: Material variants copied by mesh name matching
6. **📥 Download**: Processed GLTF automatically downloads to user's device

#### **For GLB Files:**
- Uploads normally to CDN (no processing yet)

### **3. Key Improvements vs Old System**

| **Old System** | **Enhanced System** |
|----------------|-------------------|
| Simple JSON references | Complete material transplant |
| External .json dependencies | Smart reference resolution |
| Basic mesh variant copying | Professional material mapping |
| Manual conversion step | Automatic processing + download |
| Limited AO handling | Intelligent AO preservation |
| Password required | Password-free uploads |

### **4. Reference GLTF Requirements**

The `reference.gltf` file can be in either format:

#### **Option A: Self-Contained GLTF**
```json
{
  "materials": [...], // Actual materials array
  "textures": [...],  // Actual textures array
  "images": [...],    // Actual images array
  "meshes": [...]     // Actual meshes array
}
```

#### **Option B: External References (Auto-Resolved)**
```json
{
  "materials": "materials.json",     // ← System fetches automatically
  "textures": "textures.json",      // ← System fetches automatically  
  "images": "images.json",          // ← System fetches automatically
  "externalImagesUri": "images.json", // ← System handles this too
  "meshes": [...] // Actual meshes array (variants)
}
```

✅ **Both formats are now supported automatically!**

### **5. Technical Details**

#### **Material Copying:**
- Complete material system transplanted from reference
- Target geometry preserved, reference materials applied
- Default material assignment (index 0) for all primitives

#### **AO Texture Handling:**
- Target AO textures (ending in `_AO`) preserved
- Reference AO texture slot replaced with target AO image
- Maintains reference material properties with target-specific AO

#### **Variant Mapping:**
- Meshes matched by `name` property
- Material variants copied from reference mesh to target mesh
- Supports complex variant mappings with multiple materials

#### **Extensions:**
- Complete extensions object copied from reference
- Ensures KHR_materials_variants and other extensions properly configured

### **6. Benefits**

- 🚀 **Professional Quality**: Uses proven materia-updater logic
- 🔄 **Smart Processing**: Reference resolution + complete material transplant
- 🎯 **Consistent Materials**: Reference system ensures brand consistency  
- 📥 **Instant Download**: Processed GLTF downloads immediately after processing
- 🖼️ **AO Flexibility**: Preserves model-specific ambient occlusion
- 🔓 **Password-Free**: No password required for faster testing workflow
- 🛠️ **Self-Contained**: Processed GLTF contains complete material system

## Setup Instructions

1. **Create reference folder** in client's BunnyCDN directory
2. **Upload reference.gltf** with complete material system
3. **Test upload** a GLTF file via the manage page (no password required)
4. **Verify download** contains processed GLTF with reference materials

## Testing

Upload a GLTF file through `/[client]/manage` and verify:
- ✅ File processes without errors (no password required)
- ✅ Processed GLTF downloads automatically to your device
- ✅ Downloaded GLTF contains complete material system from reference
- ✅ Target geometry is preserved with reference materials
- ✅ Material variants are properly applied
- ✅ AO textures preserved if present in uploaded file
- ✅ Extensions copied correctly from reference