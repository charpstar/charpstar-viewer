// src/components/SaveProgressOverlay.tsx
import React from 'react';

interface SaveProgressOverlayProps {
  isVisible: boolean;
  progress: number;
  message?: string;
}

const SaveProgressOverlay: React.FC<SaveProgressOverlayProps> = ({ 
  isVisible, 
  progress, 
  message = "Saving changes..." 
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {message}
        </h3>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        <p className="text-sm text-gray-500">
          Please don't close this tab or navigate away while changes are being saved.
        </p>
      </div>
    </div>
  );
};

export default SaveProgressOverlay;