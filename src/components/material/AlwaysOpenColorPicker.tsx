// components/material/AlwaysOpenColorPicker.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AlwaysOpenColorPickerProps {
  value?: string;
  color?: string;
  onChange: (color: string) => void;
  debounceTime?: number;
}

// Utility helpers
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hexInput: string): { r: number; g: number; b: number } | null {
  if (typeof hexInput !== 'string') return null;
  const raw = hexInput.trim();
  if (!raw) return null;
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  const normalized = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex.length === 6
      ? hex
      : null;
  if (!normalized || !/^[a-f\d]{6}$/i.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(clamp(Math.round(g), 0, 255))}${toHex(clamp(Math.round(b), 0, 255))}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= h && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (60 <= h && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (120 <= h && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (180 <= h && h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (240 <= h && h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const r = (r1 + m) * 255;
  const g = (g1 + m) * 255;
  const b = (b1 + m) * 255;
  return { r, g, b };
}

const AlwaysOpenColorPicker: React.FC<AlwaysOpenColorPickerProps> = ({
  value,
  color,
  onChange,
  debounceTime = 100
}) => {
  const initialHex = (value ?? color ?? "#ffffff");
  const initialRgb = hexToRgb(initialHex) ?? { r: 255, g: 255, b: 255 };
  const initialHsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);
  const [hsv, setHsv] = useState(initialHsv);
  const [isDragging, setIsDragging] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const interactingRef = useRef(false);
  const [isEditingHex, setIsEditingHex] = useState(false);
  const [inputHex, setInputHex] = useState<string>(initialHex);

  // Update local color when prop changes (not during dragging)
  useEffect(() => {
    if (!interactingRef.current) {
      const next = (value ?? color);
      if (typeof next === 'string') {
        const rgb = hexToRgb(next);
        if (rgb) setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
      }
    }
  }, [value, color]);

  // Keep text field in sync when not actively editing it
  useEffect(() => {
    if (!isEditingHex) {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const hex = rgbToHex(r, g, b);
      setInputHex(hex);
    }
  }, [hsv, isEditingHex]);

  const emitHex = useCallback((hsvVal: {h:number;s:number;v:number}) => {
    const { r, g, b } = hsvToRgb(hsvVal.h, hsvVal.s, hsvVal.v);
    const hex = rgbToHex(r, g, b);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => onChange(hex), debounceTime);
  }, [debounceTime, onChange]);

  const handleDragEnd = () => {
    setIsDragging(false);
    interactingRef.current = false;
    emitHex(hsv);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // SV square handlers
  const svRef = useRef<HTMLDivElement | null>(null);
  const onPointerDownSV = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    interactingRef.current = true;
    setIsEditingHex(false);
    setIsDragging(true);
    const rect = svRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const next = { h: hsv.h, s: x, v: 1 - y };
    setHsv(next);
    emitHex(next);
  };
  const onPointerMoveSV = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rect = svRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const next = { h: hsv.h, s: x, v: 1 - y };
    setHsv(next);
    emitHex(next);
  };

  // Hue slider handlers
  const hueRef = useRef<HTMLDivElement | null>(null);
  const onPointerDownHue = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    interactingRef.current = true;
    setIsEditingHex(false);
    setIsDragging(true);
    const rect = hueRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, h: x * 360 };
    setHsv(next);
    emitHex(next);
  };
  const onPointerMoveHue = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rect = hueRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, h: x * 360 };
    setHsv(next);
    emitHex(next);
  };

  // Saturation slider
  const satRef = useRef<HTMLDivElement | null>(null);
  const onPointerDownSat = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    interactingRef.current = true;
    setIsEditingHex(false);
    setIsDragging(true);
    const rect = satRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, s: x };
    setHsv(next);
    emitHex(next);
  };
  const onPointerMoveSat = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rect = satRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, s: x };
    setHsv(next);
    emitHex(next);
  };

  // Brightness (Value) slider
  const valRef = useRef<HTMLDivElement | null>(null);
  const onPointerDownVal = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    interactingRef.current = true;
    setIsEditingHex(false);
    setIsDragging(true);
    const rect = valRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, v: x };
    setHsv(next);
    emitHex(next);
  };
  const onPointerMoveVal = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rect = valRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const next = { ...hsv, v: x };
    setHsv(next);
    emitHex(next);
  };

  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const displayHex = rgbToHex(r, g, b);
  const svBackground = `linear-gradient(0deg, #000, rgba(0,0,0,0)), linear-gradient(90deg, #fff, hsl(${Math.round(hsv.h)} 100% 50%))`;
  const satStart = (() => { const {r,g,b} = hsvToRgb(hsv.h, 0, hsv.v); return rgbToHex(r,g,b); })();
  const satEnd   = (() => { const {r,g,b} = hsvToRgb(hsv.h, 1, hsv.v); return rgbToHex(r,g,b); })();
  const valStart = (() => { const {r,g,b} = hsvToRgb(hsv.h, hsv.s, 0); return rgbToHex(r,g,b); })();
  const valEnd   = (() => { const {r,g,b} = hsvToRgb(hsv.h, hsv.s, 1); return rgbToHex(r,g,b); })();

  return (
    <div className="w-full rounded bg-gray-100 p-2 select-none">
      <div
        ref={svRef}
        onPointerDown={onPointerDownSV}
        onPointerMove={onPointerMoveSV}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="relative w-full h-20 rounded cursor-crosshair overflow-hidden"
        style={{ background: svBackground }}
      >
        <div
          className="absolute w-2 h-2 rounded-full border-2 border-white shadow-sm"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      <div className="mt-2">
        <div
          ref={hueRef}
          onPointerDown={onPointerDownHue}
          onPointerMove={onPointerMoveHue}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="h-1.5 w-full rounded-full cursor-pointer overflow-hidden"
          style={{ background: 'linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)' }}
        >
          <div
            className="h-2 w-2 rounded-full border-2 border-white shadow-sm -mt-[4px]"
            style={{ marginLeft: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>

      {/* Saturation & Brightness in a grid */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <div className="text-[8px] uppercase tracking-wide text-gray-500 mb-0.5">Sat</div>
          <div
            ref={satRef}
            onPointerDown={onPointerDownSat}
            onPointerMove={onPointerMoveSat}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            className="h-1.5 w-full rounded-full cursor-pointer overflow-hidden"
            style={{ background: `linear-gradient(90deg, ${satStart}, ${satEnd})` }}
          >
            <div
              className="h-2 w-2 rounded-full border-2 border-white shadow-sm -mt-[4px]"
              style={{ marginLeft: `${hsv.s * 100}%` }}
            />
          </div>
        </div>

        <div>
          <div className="text-[8px] uppercase tracking-wide text-gray-500 mb-0.5">Bright</div>
          <div
            ref={valRef}
            onPointerDown={onPointerDownVal}
            onPointerMove={onPointerMoveVal}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            className="h-1.5 w-full rounded-full cursor-pointer overflow-hidden"
            style={{ background: `linear-gradient(90deg, ${valStart}, ${valEnd})` }}
          >
            <div
              className="h-2 w-2 rounded-full border-2 border-white shadow-sm -mt-[4px]"
              style={{ marginLeft: `${hsv.v * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <input
          className="w-full border-0 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-black focus:outline-none"
          placeholder="#rrggbb"
          value={isEditingHex ? inputHex : displayHex}
          onFocus={() => {
            setIsEditingHex(true);
            setInputHex(displayHex);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setInputHex(raw);
            const rgb = hexToRgb(raw);
            if (!rgb) return;
            const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
            setHsv(next);
            emitHex(next);
          }}
          onBlur={() => {
            setIsEditingHex(false);
            const rgb = hexToRgb(inputHex);
            if (!rgb) {
              setInputHex(displayHex);
            } else {
              const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
              setHsv(next);
              emitHex(next);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    </div>
  );
};

export default AlwaysOpenColorPicker;

