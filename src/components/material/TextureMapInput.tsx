// src/components/material/TextureMapInput.tsx
import React from 'react';

interface TextureMapInputProps {
  label: string;
  hasTexture: boolean;
}

const TextureMapInput: React.FC<TextureMapInputProps> = ({
  label,
  hasTexture,
}) => {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm">{label}</label>
      <div className="flex items-center">
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
      </div>
    </div>
  );
};

export default TextureMapInput;