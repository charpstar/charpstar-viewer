// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Save, Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { isValidClient } from '@/config/clients';
import { Model } from 'flexlayout-react';

interface HeaderProps {
  modelViewerRef: React.RefObject<any>;
  layoutModel: Model | null;
  onExportGLB?: () => void;
  onExportGLTF?: () => void;
  onExportUSDZ?: () => void;
  onSave?: () => void;
  onEnvironmentChange: (type: 'v5' | 'v6') => void;
  activeEnvironment: 'v5' | 'v6' | null;
  visiblePanels: {
    scene: boolean;
    materials: boolean;
    variants: boolean;
  };
  onTogglePanel: (panel: 'scene' | 'materials' | 'variants') => void;
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  layoutModel,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onSave,
  onEnvironmentChange,
  activeEnvironment,
  visiblePanels,
  onTogglePanel
}) => {
  const params = useParams();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);

  return (
    <header className="h-14 bg-[#FAFAFA] text-[#111827] flex items-center justify-between px-4 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={30}
        />
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Environment Toggles */}
        <div className="flex space-x-2 border-x px-4">
          <Button 
            variant={activeEnvironment === 'v5' ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvironmentChange('v5')}
            className="text-xs h-8"
          >
            V5 Tester
          </Button>
          <Button 
            variant={activeEnvironment === 'v6' ? "default" : "outline"}
            size="sm"
            onClick={() => onEnvironmentChange('v6')}
            className="text-xs h-8"
          >
            V6 ACES Tester
          </Button>
        </div>

        {/* Export/Save Buttons */}
        <div className="flex space-x-2">
          {isClientView ? (
            // Show Save button for client view
            <Button 
              variant="default"
              size="sm"
              onClick={onSave}
              className="text-xs h-8"
            >
              <Save size={14} className="mr-1" />
              Save
            </Button>
          ) : (
            // Show Export buttons for regular view
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLB}
                className="text-xs h-8"
              >
                <Download size={14} className="mr-1" />
                GLB
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLTF}
                className="text-xs h-8"
              >
                <Download size={14} className="mr-1" />
                GLTF
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportUSDZ}
                className="text-xs h-8"
              >
                <Download size={14} className="mr-1" />
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