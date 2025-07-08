'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';

interface ModelChangeWarningDialogProps {
  isOpen: boolean;
  newModelName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ModelChangeWarningDialog: React.FC<ModelChangeWarningDialogProps> = ({
  isOpen,
  newModelName,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="text-lg font-medium text-gray-900">
              Switch Model?
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              You are about to switch to:
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="font-medium text-blue-900 text-sm">
                {newModelName.replace('.gltf', '')}
              </p>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 mb-1">
                  Warning: You will lose all unsaved changes
                </p>
                <p className="text-xs text-amber-700">
                  Any material modifications, color changes, or other edits made to the current model will be lost. 
                  Make sure to save your changes before switching models.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Consider saving your current changes before proceeding.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            className="text-xs bg-amber-600 hover:bg-amber-700"
          >
            Switch Model
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ModelChangeWarningDialog; 