// src/components/material/TextureMapInput.tsx
import React from 'react';

interface TextureMapInputProps {
  label: string;
  textureType: string;
  hasTexture: boolean;
  onTextureUpload: (e: React.ChangeEvent<HTMLInputElement>, textureType: string) => void;
}

const TextureMapInput: React.FC<TextureMapInputProps> = ({
  label,
  textureType,
  hasTexture,
  onTextureUpload,
}) => {
  const inputId = `${textureType}Input`;
  
  // Handler to show error if non-jpg file is selected
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    if (file) {
      // Check if the file is a JPG
      const isJpg = file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
      
      if (!isJpg) {
        // Reset the input
        e.target.value = '';
        // Show error
        alert('Please select only JPG files for textures.');
        return;
      }
      
      // If it's a valid JPG, proceed with the upload
      onTextureUpload(e, textureType);
    }
  };
  
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm">{label}</label>
      <div className="flex items-center space-x-2">
        <div 
          className="w-24 h-6 bg-gray-100 rounded overflow-hidden flex items-center justify-center"
          title={hasTexture ? `${label} texture is applied` : `No ${label.toLowerCase()} texture applied`}
        >
          {hasTexture ? (
            <div className="text-xs text-gray-500 truncate px-1">
              Texture ✓
            </div>
          ) : (
            <div className="text-xs text-gray-400 truncate px-1">
              None
            </div>
          )}
        </div>
        {/* Only show Change button if a texture already exists */}
        {hasTexture && (
          <div className="flex">
            <label htmlFor={inputId} className="cursor-pointer">
              <div className="bg-gray-200 hover:bg-gray-300 text-xs p-1 rounded">
                Change
              </div>
              <input
                type="file"
                id={inputId}
                accept=".jpg,.jpeg,image/jpeg"
                className="sr-only"
                onChange={handleFileSelect}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextureMapInput;