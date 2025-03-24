// components/material/ColorPicker.tsx
import React from 'react';

interface SimpleColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const SimpleColorPicker: React.FC<SimpleColorPickerProps> = ({ color, onChange }) => {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm">Color</label>
      <div className="flex items-center">
        <input 
          type="color" 
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 p-0 border-0"
        />
      </div>
    </div>
  );
};

export default SimpleColorPicker;