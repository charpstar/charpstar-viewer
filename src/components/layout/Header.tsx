// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Save, Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { isValidClient } from '@/config/clients';

interface HeaderProps {
  modelViewerRef: React.RefObject<any>;
  onExportGLB?: () => void;
  onExportGLTF?: () => void;
  onExportUSDZ?: () => void;
  onSave?: () => void;
  isSaving?: boolean; // New prop to indicate saving status
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onSave,
  isSaving = false, // Default to false
}) => {
  const params = useParams();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);

  return (
    <header className="h-12 bg-white text-[#111827] flex items-center justify-between px-6 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={28}
        />
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Export/Save Buttons */}
        <div className="flex space-x-3">
          {isClientView ? (
            // Show Save button for client view
            <Button 
              variant="default"
              size="sm"
              onClick={onSave}
              disabled={isSaving} // Disable when saving
              className="text-xs h-7 px-3"
            >
              <Save size={14} className="mr-2" />
              {isSaving ? "Saving..." : "Save Changes to Live"}
            </Button>
          ) : (
            // Show Export buttons for regular view
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLB}
                className="text-xs h-9"
              >
                <Download size={14} className="mr-2" />
                GLB
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLTF}
                className="text-xs h-9"
              >
                <Download size={14} className="mr-2" />
                GLTF
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportUSDZ}
                className="text-xs h-9"
              >
                <Download size={14} className="mr-2" />
                USDZ
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;