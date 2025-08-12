// components/material/DebouncedColorPicker.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DebouncedColorPickerProps {
  // Prefer value, keep color for backward-compat
  value?: string;
  color?: string;
  onChange: (color: string) => void;
  label?: string;
  debounceTime?: number;
}

// Utility helpers
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(clamp(Math.round(g), 0, 255))}${toHex(clamp(Math.round(b), 0, 255))}`;
}

// rgb [0-255] => hsv h [0-360], s,v [0-1]
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

// hsv h[0-360], s,v[0-1] => rgb [0-255]
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

const DebouncedColorPicker: React.FC<DebouncedColorPickerProps> = ({
  value,
  color,
  onChange,
  label = "Color",
  debounceTime = 100
}) => {
  // Local state in HSV for better UX control
  const initialHex = (value ?? color ?? "#ffffff");
  const initialRgb = hexToRgb(initialHex) ?? { r: 255, g: 255, b: 255 };
  const initialHsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);
  const [hsv, setHsv] = useState(initialHsv);
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{top:number; left:number; height:number} | null>(null);
  const [sidebarLeft, setSidebarLeft] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactingRef = useRef(false);

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

  // Handle color input change
  const emitHex = useCallback((hsvVal: {h:number;s:number;v:number}) => {
    const { r, g, b } = hsvToRgb(hsvVal.h, hsvVal.s, hsvVal.v);
    const hex = rgbToHex(r, g, b);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => onChange(hex), debounceTime);
  }, [debounceTime, onChange]);

  // Handle the start of dragging
  const handleDragStart = () => { interactingRef.current = true; setIsDragging(true); };

  // Handle the end of dragging
  const handleDragEnd = () => {
    setIsDragging(false);
    interactingRef.current = false;
    emitHex(hsv);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Pointer handlers for SV square
  const svRef = useRef<HTMLDivElement | null>(null);
  const onPointerDownSV = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    interactingRef.current = true;
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

  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(ev.target as Node) &&
          rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false);
        setIsDragging(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const displayHex = rgbToHex(r, g, b);
  const svBackground = `linear-gradient(0deg, #000, rgba(0,0,0,0)), linear-gradient(90deg, #fff, hsl(${Math.round(hsv.h)} 100% 50%))`;
  const satStart = (() => { const {r,g,b} = hsvToRgb(hsv.h, 0, hsv.v); return rgbToHex(r,g,b); })();
  const satEnd   = (() => { const {r,g,b} = hsvToRgb(hsv.h, 1, hsv.v); return rgbToHex(r,g,b); })();
  const valStart = (() => { const {r,g,b} = hsvToRgb(hsv.h, hsv.s, 0); return rgbToHex(r,g,b); })();
  const valEnd   = (() => { const {r,g,b} = hsvToRgb(hsv.h, hsv.s, 1); return rgbToHex(r,g,b); })();

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label={label}
        onClick={() => {
          const rect = rootRef.current!.getBoundingClientRect();
          setAnchor({ top: rect.top, left: rect.left, height: rect.height });
          // Capture sidebar left position if present
          const sidebar = document.getElementById('material-sidebar');
          if (sidebar) {
            const srect = sidebar.getBoundingClientRect();
            setSidebarLeft(srect.left);
          }
          setOpen((v) => !v);
        }}
        className="w-6 h-6 border border-gray-300 rounded-sm shadow-sm cursor-pointer"
        style={{ backgroundColor: displayHex }}
      />

      {open && anchor && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[9999] w-64 rounded-md border border-gray-200 bg-white shadow-lg p-3 select-none"
          style={{
            top: anchor.top + anchor.height / 2,
            left: sidebarLeft !== null ? sidebarLeft : anchor.left,
            transform: sidebarLeft !== null ? 'translate(calc(-100% - 12px), -50%)' : 'translate(calc(-100% - 8px), -50%)',
          }}
        >
          <div
            ref={svRef}
            onPointerDown={onPointerDownSV}
            onPointerMove={onPointerMoveSV}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            className="relative w-full h-40 rounded-sm cursor-crosshair"
            style={{ background: svBackground }}
          >
            <div
              className="absolute w-3 h-3 rounded-full border border-white shadow"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>

          <div className="mt-3">
            <div className="text-xs text-gray-600 mb-1.5">Hue</div>
            <div
              ref={hueRef}
              onPointerDown={onPointerDownHue}
              onPointerMove={onPointerMoveHue}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="h-3 w-full rounded-full cursor-pointer"
              style={{ background: 'linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)' }}
            >
              <div
                className="h-3 w-3 rounded-full border border-white shadow -mt-[6px]"
                style={{ marginLeft: `${(hsv.h / 360) * 100}%` }}
              />
            </div>
          </div>

          {/* Saturation slider */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Saturation</span>
              <span>{Math.round(hsv.s * 100)}%</span>
            </div>
            <div
              ref={satRef}
              onPointerDown={onPointerDownSat}
              onPointerMove={onPointerMoveSat}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="h-3 w-full rounded-full cursor-pointer"
              style={{ background: `linear-gradient(90deg, ${satStart}, ${satEnd})` }}
            >
              <div
                className="h-3 w-3 rounded-full border border-white shadow -mt-[6px]"
                style={{ marginLeft: `${hsv.s * 100}%` }}
              />
            </div>
          </div>

          {/* Brightness slider */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Brightness</span>
              <span>{Math.round(hsv.v * 100)}%</span>
            </div>
            <div
              ref={valRef}
              onPointerDown={onPointerDownVal}
              onPointerMove={onPointerMoveVal}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="h-3 w-full rounded-full cursor-pointer"
              style={{ background: `linear-gradient(90deg, ${valStart}, ${valEnd})` }}
            >
              <div
                className="h-3 w-3 rounded-full border border-white shadow -mt-[6px]"
                style={{ marginLeft: `${hsv.v * 100}%` }}
              />
            </div>
          </div>

          <div className="mt-3">
            <input
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              value={displayHex}
              onChange={(e) => {
                const val = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                const rgb = hexToRgb(val);
                if (!rgb) return;
                const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
                setHsv(next);
                emitHex(next);
              }}
            />
          </div>
        </div>, document.body)
      }
    </div>
  );
};

export default DebouncedColorPicker;
