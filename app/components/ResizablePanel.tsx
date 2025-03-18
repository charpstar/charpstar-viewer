// app/components/ResizablePanel.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';

type ResizeDirection = 'horizontal' | 'vertical';

interface ResizablePanelProps {
  children: React.ReactNode;
  direction: ResizeDirection;
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  handleClassName?: string;
  onResize?: (newSize: number) => void;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction,
  initialSize,
  minSize = 10,
  maxSize = 90,
  className = '',
  handleClassName = '',
  onResize
}) => {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Convert size percentage to CSS value
  const sizeStyle = direction === 'horizontal' 
    ? { width: `${size}%` } 
    : { height: `${size}%` };
  
  // Determine the cursor style based on direction
  const cursorStyle = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
  
  // Handle the start of dragging
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  // Set up event listeners for dragging
  useEffect(() => {
    if (!isDragging) return;
    
    const handleDrag = (e: MouseEvent) => {
      if (!panelRef.current) return;
      
      const rect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!rect) return;
      
      let newSize;
      if (direction === 'horizontal') {
        // Calculate new width as a percentage
        newSize = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        // Calculate new height as a percentage
        newSize = ((e.clientY - rect.top) / rect.height) * 100;
      }
      
      // Clamp the size between min and max
      newSize = Math.max(minSize, Math.min(newSize, maxSize));
      
      setSize(newSize);
      if (onResize) onResize(newSize);
    };
    
    const handleDragEnd = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    
    // Create a temporary overlay to prevent text selection during drag
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = cursorStyle;
    document.body.appendChild(overlay);
    
    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.removeChild(overlay);
    };
  }, [isDragging, direction, minSize, maxSize, onResize, cursorStyle]);
  
  return (
    <div
      ref={panelRef}
      className={`relative ${className}`}
      style={sizeStyle}
    >
      {children}
      <div
        className={`absolute ${
          direction === 'horizontal' 
            ? 'top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-400 active:bg-blue-500' 
            : 'bottom-0 left-0 h-1 w-full cursor-ns-resize hover:bg-blue-400 active:bg-blue-500'
        } bg-gray-300 z-10 ${handleClassName} ${isDragging ? 'bg-blue-500' : ''}`}
        onMouseDown={handleDragStart}
      />
    </div>
  );
};

export default ResizablePanel;