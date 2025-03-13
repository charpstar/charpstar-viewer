// app/components/MaterialProperties.tsx - Updated to remove redundant material name
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TextureMapInput from './TextureMapInput';

// Define types for material properties
interface Material {
  name: string;
  type: string;
  color?: string | { r: number; g: number; b: number };
  roughness?: number;
  metalness?: number;
  opacity?: number;
  map?: any; // base color texture map
  normalMap?: any;
  roughnessMap?: any;
  metalnessMap?: any;
  alphaMap?: any; // opacity map
  aoMap?: any; // ambient occlusion map
  aoMapIntensity?: number;
  // Add other material properties as needed
}

interface MaterialPropertiesProps {
  selectedNode: any | null;
  modelViewerRef?: React.RefObject<any>;
}

const MaterialProperties: React.FC<MaterialPropertiesProps> = ({ 
  selectedNode,
  modelViewerRef
}) => {
  const [material, setMaterial] = useState<Material | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Convert color object to hex string
  const rgbToHex = (color: { r: number; g: number; b: number }) => {
    const toHex = (value: number) => {
      const hex = Math.round(value * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  };

  // Convert hex string to color object
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  // Function to get the material color in hex format
  const getColorHex = () => {
    if (!material || !material.color) return '#000000';
    
    if (typeof material.color === 'string') {
      return material.color;
    } else {
      return rgbToHex(material.color);
    }
  };

  // Handle color change
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColorHex = e.target.value;
    
    // Update local state
    setMaterial(prev => {
      if (!prev) return null;
      return { ...prev, color: newColorHex };
    });

    // Update the model's material color using model-viewer's methods
    if (modelViewerRef?.current && selectedNode) {
      // Call a method on model-viewer to handle the color properly
      if (typeof modelViewerRef.current.setMaterialColor === 'function') {
        // This method should be implemented in model-viewer.js
        modelViewerRef.current.setMaterialColor(selectedNode.uuid, newColorHex);
      } else {
        console.warn('setMaterialColor method not available on model-viewer');
      }
      
      // Request a render update
      if (typeof modelViewerRef.current.requestRender === 'function') {
        modelViewerRef.current.requestRender();
      }
    }
  };
  
  // Handle numeric property change
  const handlePropertyChange = (property: string, value: number) => {
    setMaterial(prev => {
      if (!prev) return null;
      return { ...prev, [property]: value };
    });

    // Update the model's material property immediately
    updateMaterialProperty(property, value);
    
    // Request a render update if that method exists
    if (modelViewerRef?.current && typeof modelViewerRef.current.requestRender === 'function') {
      modelViewerRef.current.requestRender();
    }
  };

  // Handle texture upload
  const handleTextureUpload = (event: React.ChangeEvent<HTMLInputElement>, textureType: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const textureUrl = URL.createObjectURL(file);
    
    try {
      if (modelViewerRef?.current && selectedNode) {
        console.log(`Applying ${textureType} texture from file:`, file.name);
        
        // Add applyTexture method to your model-viewer.js script
        if (typeof modelViewerRef.current.applyTexture === 'function') {
          // This delegates the texture handling to your model-viewer script
          modelViewerRef.current.applyTexture(selectedNode.uuid, textureType, textureUrl);
          
          // Update our state to reflect the texture was applied
          setMaterial(prev => {
            if (!prev) return null;
            return { ...prev, [textureType]: { loaded: true } };
          });
        } else {
          console.error('applyTexture method not found in model-viewer.');
        }
      } else {
        console.error('Model viewer reference or selected node not available');
      }
    } catch (error) {
      console.error(`Error applying ${textureType} texture:`, error);
    }
  };

  // Function to clear a texture
  const clearTexture = (textureType: string) => {
    if (!modelViewerRef?.current || !selectedNode) return;
    
    try {
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      if (object && object.material) {
        // Remove the texture
        object.material[textureType] = null;
        object.material.needsUpdate = true;
        
        // Update state
        setMaterial(prev => {
          if (!prev) return null;
          return { ...prev, [textureType]: null };
        });
      }
    } catch (error) {
      console.error(`Error clearing ${textureType} texture:`, error);
    }
  };

  // Function to update material property in the 3D model
  const updateMaterialProperty = (property: string, value: any) => {
    if (!modelViewerRef?.current || !selectedNode) return;

    try {
      // Access the object directly using its UUID
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      
      if (object && object.material) {
        // Update the material property
        object.material[property] = value;
        
        // Mark the material as needing update
        object.material.needsUpdate = true;
      }
    } catch (error) {
      console.error('Error updating material property:', error);
    }
  };

  // Get material data for the selected node
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'Mesh' || !modelViewerRef?.current) {
      setMaterial(null);
      return;
    }
    
    try {
      // Try to access the object directly using Three.js methods
      const object = modelViewerRef.current.getObjectByUuid?.(selectedNode.uuid);
      
      if (object && object.material) {
        console.log('Found material for mesh:', object.material);
        
        // Extract relevant material properties
        const materialData: Material = {
          name: object.material.name || 'Material',
          type: object.material.type || 'Material',
          color: object.material.color ? { 
            r: object.material.color.r, 
            g: object.material.color.g, 
            b: object.material.color.b 
          } : '#ffffff',
          roughness: object.material.roughness !== undefined ? object.material.roughness : 0.5,
          metalness: object.material.metalness !== undefined ? object.material.metalness : 0,
          opacity: object.material.opacity !== undefined ? object.material.opacity : 1,
          map: object.material.map || null,
          normalMap: object.material.normalMap || null,
          roughnessMap: object.material.roughnessMap || null,
          metalnessMap: object.material.metalnessMap || null,
          alphaMap: object.material.alphaMap || null,
          aoMap: object.material.aoMap || null,
          aoMapIntensity: object.material.aoMapIntensity !== undefined ? object.material.aoMapIntensity : 1.0
        };
        
        setMaterial(materialData);
      } else {
        console.log('No material found for mesh');
        setMaterial(null);
      }
    } catch (error) {
      console.error('Error accessing material:', error);
      setMaterial(null);
    }
  }, [selectedNode, modelViewerRef]);

  if (!selectedNode || selectedNode.type !== 'Mesh' || !material) {
    return (
      <div className="space-y-2">
        <div className="text-gray-600 text-xs">
          {!selectedNode 
            ? 'Select a mesh to view its material properties.' 
            : selectedNode.type !== 'Mesh' 
              ? `${selectedNode.type} objects don't have materials.` 
              : 'No material found for this mesh.'}
        </div>
        
        {selectedNode && (
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Debug: Selected {selectedNode.name} ({selectedNode.type})
            <br />
            UUID: {selectedNode.uuid}
            <br />
            Material data: {material ? 'Available' : 'Not available'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm">
      {/* Material header with color swatch */}
      <div className="flex items-center mb-4 pb-2 border-b border-gray-200">
        <div 
          className="w-6 h-6 rounded-full mr-2" 
          style={{ backgroundColor: getColorHex() }}
        ></div>
        <span className="font-medium">{material.name || 'Material'}</span>
      </div>
      
      {/* Base Properties */}
      <div className="space-y-3">
        {/* Color */}
        <div className="flex items-center justify-between">
          <label className="text-sm">Color</label>
          <div className="flex items-center">
            <input 
              type="color" 
              value={getColorHex()}
              onChange={handleColorChange}
              className="w-6 h-6 p-0 border-0"
            />
          </div>
        </div>
        
        {/* Base Color Map/Texture */}
        <TextureMapInput
          label="Base Color Map"
          textureType="map"
          hasTexture={!!material.map}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* Roughness */}
        <div className="flex items-center justify-between">
          <label className="text-sm">Roughness</label>
          <div className="flex items-center">
            <span className="mr-2 text-xs w-8 text-right">
              {material.roughness !== undefined ? `${Math.round(material.roughness * 100)}%` : '0%'}
            </span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={material.roughness || 0}
              onChange={(e) => handlePropertyChange('roughness', parseFloat(e.target.value))}
              className="w-24 h-1"
            />
          </div>
        </div>
        
        {/* Roughness Map */}
        <TextureMapInput
          label="Roughness Map"
          textureType="roughnessMap"
          hasTexture={!!material.roughnessMap}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* Metalness */}
        <div className="flex items-center justify-between">
          <label className="text-sm">Metalness</label>
          <div className="flex items-center">
            <span className="mr-2 text-xs w-8 text-right">
              {material.metalness !== undefined ? `${Math.round(material.metalness * 100)}%` : '0%'}
            </span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={material.metalness || 0}
              onChange={(e) => handlePropertyChange('metalness', parseFloat(e.target.value))}
              className="w-24 h-1"
            />
          </div>
        </div>
        
        {/* Metalness Map */}
        <TextureMapInput
          label="Metalness Map"
          textureType="metalnessMap"
          hasTexture={!!material.metalnessMap}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* Opacity */}
        <div className="flex items-center justify-between">
          <label className="text-sm">Opacity</label>
          <div className="flex items-center">
            <span className="mr-2 text-xs w-8 text-right">
              {material.opacity !== undefined ? `${Math.round(material.opacity * 100)}%` : '100%'}
            </span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={material.opacity !== undefined ? material.opacity : 1}
              onChange={(e) => handlePropertyChange('opacity', parseFloat(e.target.value))}
              className="w-24 h-1"
            />
          </div>
        </div>
        
        {/* Alpha Map (Opacity Map) */}
        <TextureMapInput
          label="Opacity Map"
          textureType="alphaMap"
          hasTexture={!!material.alphaMap}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* Normal Map */}
        <TextureMapInput
          label="Normal Map"
          textureType="normalMap"
          hasTexture={!!material.normalMap}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* AO Map */}
        <TextureMapInput
          label="Ambient Occlusion"
          textureType="aoMap"
          hasTexture={!!material.aoMap}
          onTextureUpload={handleTextureUpload}
          onTextureClear={clearTexture}
        />
        
        {/* AO Map Intensity (only show if AO map exists) */}
        {material.aoMap && (
          <div className="flex items-center justify-between">
            <label className="text-sm">AO Intensity</label>
            <div className="flex items-center">
              <span className="mr-2 text-xs w-8 text-right">
                {material.aoMapIntensity !== undefined ? `${Math.round(material.aoMapIntensity * 100)}%` : '100%'}
              </span>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.05"
                value={material.aoMapIntensity !== undefined ? material.aoMapIntensity : 1}
                onChange={(e) => handlePropertyChange('aoMapIntensity', parseFloat(e.target.value))}
                className="w-24 h-1"
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Advanced options */}
      <div className="mt-4 border-t border-gray-200 pt-2">
        <button 
          className="flex items-center text-sm font-medium w-full justify-between py-1"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          Advanced options
          {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {advancedOpen && (
          <div className="mt-2 space-y-3">
            {/* Additional properties would go here */}
            <div className="text-xs text-gray-500">
              Additional material properties will be added here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialProperties;