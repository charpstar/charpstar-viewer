// app/components/MaterialProperties.tsx
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
  mapRepeat?: { x: number; y: number }; // Add repeat values for base color map
  normalMap?: any;
  normalMapRepeat?: { x: number; y: number }; // Add repeat values for normal map
  roughnessMap?: any;
  metalnessMap?: any;
  alphaMap?: any; // opacity map
  aoMap?: any; // ambient occlusion map
  aoMapIntensity?: number;
  sheenRoughness?: number;
  sheenColor?: string | { r: number; g: number; b: number };
  sheenColorMap?: any;
  sheenColorMap_channel?: number; // UV set for sheen (0 or 1)
  [key: string]: any; // Add index signature to allow string indexing
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
  const [isMeshPhysicalMaterial, setIsMeshPhysicalMaterial] = useState(false);

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
  const getColorHex = (colorProp: string | { r: number; g: number; b: number } | undefined) => {
    if (!colorProp) return '#000000';
    
    if (typeof colorProp === 'string') {
      return colorProp;
    } else {
      return rgbToHex(colorProp);
    }
  };

  // Handle color change
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>, property: string = 'color') => {
    const newColorHex = e.target.value;
    const newColorRgb = hexToRgb(newColorHex);
    
    if (!modelViewerRef?.current || !selectedNode) return;

    try {
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      if (object && object.material) {
        if (property === 'sheenColor') {
          object.material.sheenColor.setRGB(newColorRgb.r, newColorRgb.g, newColorRgb.b);
        } else {
          object.material[property].setRGB(newColorRgb.r, newColorRgb.g, newColorRgb.b);
        }
        object.material.needsUpdate = true;

        // Update local state
        setMaterial(prev => {
          if (!prev) return null;
          return { ...prev, [property]: newColorRgb };
        });

        // Request a render update
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
      }
    } catch (error) {
      console.error(`Error updating ${property}:`, error);
    }
  };

  // Handle scale change for texture maps
  const handleScaleChange = (axis: 'x' | 'y', value: number, mapType: string) => {
    if (!modelViewerRef?.current || !selectedNode) return;

    try {
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      if (object && object.material && object.material[mapType]) {
        // Update the repeat value directly on the texture
        object.material[mapType].repeat[axis] = value;
        object.material.needsUpdate = true;

        // Update local state
        setMaterial(prev => {
          if (!prev) return null;
          const repeatProp = `${mapType}Repeat` as keyof Material;
          const currentRepeat = prev[repeatProp] as { x: number; y: number } || { x: 1, y: 1 };
          return {
            ...prev,
            [repeatProp]: {
              ...currentRepeat,
              [axis]: value
            }
          };
        });

        // Request a render update
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
      }
    } catch (error) {
      console.error(`Error updating ${mapType} tiling:`, error);
    }
  };

  // Handle numeric property change
  const handlePropertyChange = (property: string, value: number) => {
    if (!modelViewerRef?.current || !selectedNode) return;

    try {
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      if (object && object.material) {
        object.material[property] = value;
        object.material.needsUpdate = true;

        // Update local state
        setMaterial(prev => {
          if (!prev) return null;
          return { ...prev, [property]: value };
        });

        // Request a render update
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
      }
    } catch (error) {
      console.error(`Error updating ${property}:`, error);
    }
  };

  // Handle UV set change for sheen
  const handleUVSetChange = (channel: number) => {
    if (!modelViewerRef?.current || !selectedNode) return;

    try {
      const object = modelViewerRef.current.getObjectByUuid(selectedNode.uuid);
      if (object && object.material && object.material.sheenColorMap) {
        object.material.sheenColorMap.channel = channel;
        object.material.needsUpdate = true;

        // Update local state
        setMaterial(prev => {
          if (!prev) return null;
          return { ...prev, sheenColorMap_channel: channel };
        });

        // Request a render update
        if (typeof modelViewerRef.current.requestRender === 'function') {
          modelViewerRef.current.requestRender();
        }
      }
    } catch (error) {
      console.error('Error updating sheen UV set:', error);
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
        
        if (typeof modelViewerRef.current.applyTexture === 'function') {
          modelViewerRef.current.applyTexture(selectedNode.uuid, textureType, textureUrl);
          
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
        object.material[textureType] = null;
        object.material.needsUpdate = true;
        
        setMaterial(prev => {
          if (!prev) return null;
          return { ...prev, [textureType]: null };
        });
      }
    } catch (error) {
      console.error(`Error clearing ${textureType} texture:`, error);
    }
  };

  // Get material data for the selected node
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'Mesh' || !modelViewerRef?.current) {
      setMaterial(null);
      setIsMeshPhysicalMaterial(false);
      return;
    }
    
    try {
      const object = modelViewerRef.current.getObjectByUuid?.(selectedNode.uuid);
      
      if (object && object.material) {
        console.log('Found material for mesh:', object.material);
        
        // Check if the material is MeshPhysicalMaterial
        setIsMeshPhysicalMaterial(object.material.type === 'MeshPhysicalMaterial');
        
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
          mapRepeat: object.material.map?.repeat ? {
            x: object.material.map.repeat.x,
            y: object.material.map.repeat.y
          } : { x: 1, y: 1 },
          normalMap: object.material.normalMap || null,
          normalMapRepeat: object.material.normalMap?.repeat ? {
            x: object.material.normalMap.repeat.x,
            y: object.material.normalMap.repeat.y
          } : { x: 1, y: 1 },
          roughnessMap: object.material.roughnessMap || null,
          metalnessMap: object.material.metalnessMap || null,
          alphaMap: object.material.alphaMap || null,
          aoMap: object.material.aoMap || null,
          aoMapIntensity: object.material.aoMapIntensity !== undefined ? object.material.aoMapIntensity : 1.0,
          sheenRoughness: object.material.sheenRoughness !== undefined ? object.material.sheenRoughness : 0,
          sheenColor: object.material.sheenColor ? {
            r: object.material.sheenColor.r,
            g: object.material.sheenColor.g,
            b: object.material.sheenColor.b
          } : '#ffffff',
          sheenColorMap: object.material.sheenColorMap || null,
          sheenColorMap_channel: object.material.sheenColorMap?.channel || 0
        };
        
        setMaterial(materialData);
      } else {
        console.log('No material found for mesh');
        setMaterial(null);
        setIsMeshPhysicalMaterial(false);
      }
    } catch (error) {
      console.error('Error accessing material:', error);
      setMaterial(null);
      setIsMeshPhysicalMaterial(false);
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
          style={{ backgroundColor: getColorHex(material.color) }}
        ></div>
        <span className="font-medium">{material.name || 'Material'}</span>
      </div>
      
      {/* Base Properties */}
      <div className="space-y-3">
        {/* Base Color */}
        <div className="flex items-center justify-between">
          <label className="text-sm">Base Color</label>
          <div className="flex items-center">
            <input 
              type="color" 
              value={getColorHex(material.color)}
              onChange={(e) => handleColorChange(e, 'color')}
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

        {/* Base Color Map Tiling */}
        {material.map && (
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">Tiling X</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={material.mapRepeat?.x || 1}
                onChange={(e) => handleScaleChange('x', parseFloat(e.target.value), 'map')}
                className="w-20 text-xs p-1 border rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">Tiling Y</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={material.mapRepeat?.y || 1}
                onChange={(e) => handleScaleChange('y', parseFloat(e.target.value), 'map')}
                className="w-20 text-xs p-1 border rounded"
              />
            </div>
          </div>
        )}
        
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

        {/* Normal Map Tiling */}
        {material.normalMap && (
          <div className="space-y-2 ml-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">Tiling X</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={material.normalMapRepeat?.x || 1}
                onChange={(e) => handleScaleChange('x', parseFloat(e.target.value), 'normalMap')}
                className="w-20 text-xs p-1 border rounded"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">Tiling Y</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={material.normalMapRepeat?.y || 1}
                onChange={(e) => handleScaleChange('y', parseFloat(e.target.value), 'normalMap')}
                className="w-20 text-xs p-1 border rounded"
              />
            </div>
          </div>
        )}
        
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
          <div className="mt-4 space-y-4">
            {/* Sheen section - only show for MeshPhysicalMaterial */}
            {isMeshPhysicalMaterial ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Sheen Properties</h3>
                
                {/* Sheen Roughness */}
                <div className="flex items-center justify-between">
                  <label className="text-sm">Sheen Roughness</label>
                  <div className="flex items-center">
                    <span className="mr-2 text-xs w-8 text-right">
                      {material.sheenRoughness !== undefined ? `${Math.round(material.sheenRoughness * 100)}%` : '0%'}
                    </span>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      value={material.sheenRoughness || 0}
                      onChange={(e) => handlePropertyChange('sheenRoughness', parseFloat(e.target.value))}
                      className="w-24 h-1"
                    />
                  </div>
                </div>

                {/* Sheen Color */}
                <div className="flex items-center justify-between">
                  <label className="text-sm">Sheen Color</label>
                  <div className="flex items-center">
                    <input 
                      type="color" 
                      value={getColorHex(material.sheenColor)}
                      onChange={(e) => handleColorChange(e, 'sheenColor')}
                      className="w-6 h-6 p-0 border-0"
                    />
                  </div>
                </div>

                {/* Sheen Color Map */}
                <TextureMapInput
                  label="Sheen Color Map"
                  textureType="sheenColorMap"
                  hasTexture={!!material.sheenColorMap}
                  onTextureUpload={handleTextureUpload}
                  onTextureClear={clearTexture}
                />

                {/* UV Set Selection */}
                <div className="flex items-center justify-between">
                  <label className="text-sm">UV Set</label>
                  <div className="flex space-x-2">
                    <button
                      className={`px-2 py-1 text-xs rounded ${
                        material.sheenColorMap_channel === 0 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                      onClick={() => handleUVSetChange(0)}
                    >
                      UV0
                    </button>
                    <button
                      className={`px-2 py-1 text-xs rounded ${
                        material.sheenColorMap_channel === 1 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                      onClick={() => handleUVSetChange(1)}
                    >
                      UV1
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 p-2 bg-gray-100 rounded">
                Sheen properties are only available for MeshPhysicalMaterial.
                Current material type: {material.type}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialProperties;