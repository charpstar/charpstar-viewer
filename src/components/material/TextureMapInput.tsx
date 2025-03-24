// components/material/TextureMapInput.tsx
import React from 'react';

interface TextureMapInputProps {
  label: string;
  textureType: string;
  hasTexture: boolean;
  onTextureUpload: (e: React.ChangeEvent<HTMLInputElement>, textureType: string) => void;
  onTextureClear: (textureType: string) => void;
}

const TextureMapInput: React.FC<TextureMapInputProps> = ({
  label,
  textureType,
  hasTexture,
  onTextureUpload,
  onTextureClear
}) => {
  const inputId = `${textureType}Input`;
  
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
        <div className="flex">
          <label htmlFor={inputId} className="cursor-pointer">
            <div className="bg-gray-200 hover:bg-gray-300 text-xs p-1 rounded">
              {hasTexture ? 'Change' : 'Add'}
            </div>
            <input
              type="file"
              id={inputId}
              accept="image/*"
              className="sr-only"
              onChange={(e) => onTextureUpload(e, textureType)}
            />
          </label>
          {hasTexture && (
            <button
              className="bg-gray-200 hover:bg-gray-300 text-xs p-1 rounded ml-1"
              onClick={() => onTextureClear(textureType)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TextureMapInput;