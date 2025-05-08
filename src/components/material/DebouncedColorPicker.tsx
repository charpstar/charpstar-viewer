// components/material/DebouncedColorPicker.tsx
import React, { useState, useEffect, useRef } from 'react';

interface DebouncedColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  debounceTime?: number;
}

const DebouncedColorPicker: React.FC<DebouncedColorPickerProps> = ({
  color,
  onChange,
  label = "Color",
  debounceTime = 100
}) => {
  // Local state for the current color shown in UI
  const [localColor, setLocalColor] = useState(color);
  const [isDragging, setIsDragging] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update local color when prop changes (not during dragging)
  useEffect(() => {
    if (!isDragging) {
      setLocalColor(color);
    }
  }, [color, isDragging]);

  // Handle color input change
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    
    // Update local state immediately for responsive UI
    setLocalColor(newColor);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set debounce timer for the actual onChange callback
    debounceTimerRef.current = setTimeout(() => {
      onChange(newColor);
    }, debounceTime);
  };

  // Handle the start of dragging
  const handleDragStart = () => {
    setIsDragging(true);
  };

  // Handle the end of dragging
  const handleDragEnd = () => {
    setIsDragging(false);
    // Ensure final value is passed
    onChange(localColor);
  };

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm">{label}</label>
      <div className="flex items-center gap-2">
        {/* Color swatch */}
        <div 
          className="w-5 h-5 border border-gray-300 rounded-sm shadow-sm"
          style={{ backgroundColor: localColor }}
        ></div>
        
        {/* Color input */}
        <input 
          type="color" 
          value={localColor}
          onChange={handleColorChange}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
          onBlur={handleDragEnd}
          className="w-7 h-7 p-0 cursor-pointer"
        />
      </div>
    </div>
  );
};

export default DebouncedColorPicker;