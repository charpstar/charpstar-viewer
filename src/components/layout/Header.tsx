// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Save, Download, RefreshCw, Upload } from 'lucide-react';
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
  onRefreshModels?: () => void; // For manage page
  onUploadModels?: () => void; // For manage page upload dialog
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
  onRefreshModels,
  onUploadModels,
}) => {
  const params = useParams();
  const pathname = usePathname();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);
  const isManageView = pathname?.includes('/manage');
  
  // Determine current page (Editor, Manage, and Materials)
  const isMaterialsView = pathname?.includes('/materials');
  const currentPage = isMaterialsView ? 'materials' : isManageView ? 'manage' : 'editor';

  return (
    <header className="h-12 bg-white text-[#111827] flex items-center justify-between px-6 border-b border-gray-200 shadow-sm w-full">
      <div className="flex items-center">
        <Image
          src="/logo.svg"
          alt="Charpstar Logo"
          width={100}
          height={28}
        />
        
        {/* Unified Navigation */}
        {isClientView && (
          <nav className="ml-8">
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
              <Link href={`/${clientName}`}>
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer hover:scale-105 ${
                    currentPage === 'editor'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  Editor
                </button>
              </Link>
              <Link href={`/${clientName}/manage`}>
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer hover:scale-105 ${
                    currentPage === 'manage'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  Manage
                </button>
              </Link>
              <Link href={`/${clientName}/materials`}>
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer hover:scale-105 ${
                    currentPage === 'materials'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  Materials
                </button>
              </Link>
            </div>
          </nav>
        )}
        
        {/* Model Selector for Editor Mode */}
        {currentPage === 'editor' && onModelChange && (
          <div className="ml-8">
            <ModelSelector 
              onModelChange={onModelChange}
              currentModel={currentModel}
              cacheTimestamp={cacheTimestamp}
            />
          </div>
        )}
      </div>
      
      <div className="flex items-center space-x-3">
        {/* Dynamic Action Buttons */}
        {(currentPage === 'editor' || currentPage === 'materials') && onSave && (
          <Button 
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Save size={14} className="mr-2" />
            {isSaving ? "Saving..." : (currentPage === 'materials' ? 'Save All' : 'Save to Live')}
          </Button>
        )}
        
        {(currentPage === 'manage' || currentPage === 'materials') && (
          <>
            {onUploadModels && currentPage === 'manage' && (
              <Button 
                variant="default"
                size="sm"
                onClick={onUploadModels}
                className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <Upload size={14} className="mr-2" />
                Upload Models
              </Button>
            )}
            {onRefreshModels && (
              <Button 
                variant="outline"
                size="sm"
                onClick={onRefreshModels}
                className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <RefreshCw size={14} className="mr-2" />
                {currentPage === 'materials' ? 'Reload Materials' : 'Refresh'}
              </Button>
            )}
          </>
        )}
        
        {/* Export buttons only shown for non-client views */}
        {!isClientView && (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onExportGLB}
              className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
            >
              <Download size={14} className="mr-2" />
              GLB
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onExportGLTF}
              className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
            >
              <Download size={14} className="mr-2" />
              GLTF
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onExportUSDZ}
              className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
            >
              <Download size={14} className="mr-2" />
              USDZ
            </Button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;