// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Save, Download, ArrowLeft } from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';
import { isValidClient } from '@/config/clientConfig';
import ModelSelector from '@/components/ModelSelector';

interface HeaderProps {
  modelViewerRef?: React.RefObject<any>;
  onExportGLB?: () => void;
  onExportGLTF?: () => void;
  onExportUSDZ?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  title?: string; // Added title prop
  onModelChange?: (modelUrl: string, modelName: string) => void;
  currentModel?: string;
  cacheTimestamp?: number | null;
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onSave,
  isSaving = false,
  title,
  onModelChange,
  currentModel,
  cacheTimestamp,
}) => {
  const params = useParams();
  const pathname = usePathname();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);
  const isDemoView = pathname?.includes('/demo');
  
  // Determine if in editor or demo mode
  const isEditorMode = isClientView && !isDemoView;
  const isDemoMode = isClientView && isDemoView;

  return (
    <header className="h-12 bg-white text-[#111827] flex items-center justify-between px-6 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={28}
        />
        
        {title && (
          <div className="ml-6 text-lg font-medium text-gray-700">
            {title}
          </div>
        )}
        
        {/* Model Selector for Editor Mode */}
        {isEditorMode && onModelChange && (
          <div className="ml-8">
            <ModelSelector 
              onModelChange={onModelChange}
              currentModel={currentModel}
              cacheTimestamp={cacheTimestamp}
            />
          </div>
        )}
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Navigation between editor and demo */}
        {isClientView && (
          <div className="mr-4 flex items-center space-x-3">
            {isDemoMode ? (
              <Link href={`/${clientName}`}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs h-7"
                >
                  <ArrowLeft size={14} className="mr-2" />
                  Back to Editor
                </Button>
              </Link>
            ) : (
              <>
                <Link href={`/${clientName}/demo`}>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs h-7"
                  >
                    View Demo Catalog
                  </Button>
                </Link>
                {/* Manage Models Link for Editor Mode */}
                {isEditorMode && (
                  <Link href={`/${clientName}/manage`}>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-xs h-7"
                    >
                      Manage Models
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        )}
        
        {/* Export/Save Buttons */}
        <div className="flex space-x-3">
          {isEditorMode ? (
            // Show Save button for client editor view
            <Button 
              variant="default"
              size="sm"
              onClick={onSave}
              disabled={isSaving}
              className="text-xs h-7 px-3"
            >
              <Save size={14} className="mr-2" />
              {isSaving ? "Saving..." : "Save Changes to Live"}
            </Button>
          ) : !isDemoMode && (
            // Show Export buttons for regular view (not demo)
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