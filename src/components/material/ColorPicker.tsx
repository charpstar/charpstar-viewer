// components/material/ColorPicker.tsx
import React, { useState, useRef, useEffect } from "react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  // Convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  };

  // Update RGB when value changes
  useEffect(() => {
    setRgb(hexToRgb(value));
  }, [value]);

  // Handle RGB input changes
  const handleRgbChange = (channel: "r" | "g" | "b", newValue: number) => {
    const newRgb = { ...rgb, [channel]: Math.max(0, Math.min(255, newValue)) };
    setRgb(newRgb);
    const hexColor = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    onChange(hexColor);
  };

  // Handle color picker change
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Color square button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-6 h-6 border border-gray-300 rounded cursor-pointer ${className}`}
        style={{ backgroundColor: value }}
        title="Click to open color picker"
      />

      {/* Custom popup */}
      {isOpen && (
        <div
          ref={popupRef}
          className="absolute top-8 right-0 z-50 bg-white border border-gray-200 rounded-md shadow-sm p-3 min-w-[240px]"
          style={{
            boxShadow:
              "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          }}
        >
          <div className="space-y-3">
            {/* Color picker row */}
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={value}
                onChange={handleColorChange}
                className="w-6 h-6 border-0 rounded cursor-pointer flex-shrink-0"
              />
              <div
                className="flex-1 h-4 rounded cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    #ff0000, #ff8000, #ffff00, #80ff00, #00ff00, 
                    #00ff80, #00ffff, #0080ff, #0000ff, #8000ff, 
                    #ff00ff, #ff0080)`,
                }}
              ></div>
            </div>

            {/* RGB Input Fields */}
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col items-center space-y-1">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.r}
                  onChange={(e) =>
                    handleRgbChange("r", parseInt(e.target.value) || 0)
                  }
                  className="w-12 text-center text-xs p-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <label className="text-xs text-gray-500 font-medium">R</label>
              </div>

              <div className="flex flex-col items-center space-y-1">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.g}
                  onChange={(e) =>
                    handleRgbChange("g", parseInt(e.target.value) || 0)
                  }
                  className="w-12 text-center text-xs p-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <label className="text-xs text-gray-500 font-medium">G</label>
              </div>

              <div className="flex flex-col items-center space-y-1">
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb.b}
                  onChange={(e) =>
                    handleRgbChange("b", parseInt(e.target.value) || 0)
                  }
                  className="w-12 text-center text-xs p-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <label className="text-xs text-gray-500 font-medium">B</label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
