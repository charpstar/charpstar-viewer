// src/components/InputLocker.tsx
import React, { useEffect } from 'react';

interface InputLockerProps {
  isLocked: boolean;
}

const InputLocker: React.FC<InputLockerProps> = ({ isLocked }) => {
  useEffect(() => {
    // This is the element that will block all interactions when locked
    const createBlocker = () => {
      const blocker = document.createElement('div');
      blocker.id = 'input-blocker';
      blocker.style.position = 'fixed';
      blocker.style.top = '0';
      blocker.style.left = '0';
      blocker.style.width = '100%';
      blocker.style.height = '100%';
      blocker.style.zIndex = '40'; // Below the SaveProgressOverlay (z-50)
      blocker.style.cursor = 'not-allowed';
      blocker.style.touchAction = 'none';
      blocker.style.pointerEvents = 'all';
      blocker.style.opacity = '0'; // Invisible but still blocking
      
      return blocker;
    };

    // Add or remove the blocker element based on isLocked
    if (isLocked) {
      // Only add if not already present
      if (!document.getElementById('input-blocker')) {
        const blocker = createBlocker();
        document.body.appendChild(blocker);
      }
    } else {
      // Remove if present
      const existingBlocker = document.getElementById('input-blocker');
      if (existingBlocker) {
        document.body.removeChild(existingBlocker);
      }
    }

    // Clean up on unmount
    return () => {
      const existingBlocker = document.getElementById('input-blocker');
      if (existingBlocker) {
        document.body.removeChild(existingBlocker);
      }
    };
  }, [isLocked]);

  // This component doesn't render anything visible
  return null;
};

export default InputLocker;