// src/components/layout/Header.tsx
'use client';
import React from 'react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Save, Download, RefreshCw, Upload, History } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { isValidClient } from '@/config/clientConfig';
import ModelSelector from '@/components/ModelSelector';

interface HeaderProps {
  modelViewerRef?: React.RefObject<any>;
  onExportGLB?: () => void;
  onExportGLTF?: () => void;
  onExportUSDZ?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  title?: string; // Interpreted as the current editing/displaying model name
  titlePrefix?: string; // Custom label, e.g., "Displaying" (materials page only)
  onApplyToLiveModels?: () => void;
  isApplyingToLiveModels?: boolean;
  onModelChange?: (modelUrl: string, modelName: string) => void;
  currentModel?: string;
  cacheTimestamp?: number | null;
  onRefreshModels?: () => void; // For manage page
  onUploadModels?: () => void; // For manage page upload dialog
  onOpenBackups?: () => void; // For materials page: open backups dialog
  onStopApply?: () => void; // Always-active local stop apply state
  hasUnsavedChanges?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  modelViewerRef,
  onExportGLB,
  onExportGLTF,
  onExportUSDZ,
  onSave,
  isSaving = false,
  title,
  titlePrefix,
  onApplyToLiveModels,
  isApplyingToLiveModels = false,
  onModelChange,
  currentModel,
  cacheTimestamp,
  onRefreshModels,
  onUploadModels,
  onOpenBackups,
  onStopApply,
  hasUnsavedChanges = false,
}) => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);
  const isManageView = pathname?.includes('/manage');
  const isTexturesView = pathname?.includes('/textures');
  const isRenderView = pathname?.includes('/render');
  const [editingName, setEditingName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const explicit = (title || '').trim();
    if (explicit) {
      setEditingName(explicit.replace(/\.(gltf|glb)$/i, ''));
      return;
    }
    // Only derive from localStorage if a prefix is provided (caller intends to show a label)
    if (titlePrefix) {
      try {
        const key = `charpstar:lastSelectedModel:${clientName}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { filename?: string } | null;
          const name = (parsed?.filename || '').replace(/\.(gltf|glb)$/i, '');
          if (name) setEditingName(name);
        }
      } catch {}
    }
  }, [title, titlePrefix, clientName, pathname]);
  
  // Determine current page (Editor, Manage, and Materials)
  const isMaterialsView = pathname?.includes('/materials');
  const currentPage = isMaterialsView ? 'materials' : isTexturesView ? 'textures' : isRenderView ? 'render' : isManageView ? 'manage' : 'editor';

  // Track if a background apply job is active for the current client (from localStorage)
  const [externalJobActive, setExternalJobActive] = React.useState(false);
  const jobKey = `charpstar:applyJob:${clientName}`;
  React.useEffect(() => {
    if (!isClientView) return;
    let timer: any;
    const nextClientPingAtRef: { current: number } = { current: 0 };
    const check = async () => {
      try {
        let active = false;
        const jobId = typeof window !== 'undefined' ? localStorage.getItem(jobKey) : null;
        if (jobId) {
          const res = await fetch(`/api/apply/status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
          const j = await res.json().catch(() => ({} as any));
          if (res.ok) {
            const total = typeof j?.total === 'number' ? j.total : 0;
            const done = typeof j?.done === 'number' ? j.done : 0;
            const failed = typeof j?.failed === 'number' ? j.failed : 0;
            active = !(j?.status === 'completed' || (total > 0 && done + failed >= total));
          }
        } else {
          // Idle mode: only ping worker every 10s to reduce noise
          const now = Date.now();
          if (now >= nextClientPingAtRef.current) {
            nextClientPingAtRef.current = now + 10000;
            const cr = await fetch(`/api/apply/client-status?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
            const cj = await cr.json().catch(() => ({} as any));
            if (cr.ok && cj && typeof cj.active === 'boolean') {
              active = !!cj.active;
              // If an active job exists on the worker but this tab lacks a jobId, persist it and broadcast
              if (active && cj.jobId && typeof window !== 'undefined' && !localStorage.getItem(jobKey)) {
                try {
                  localStorage.setItem(jobKey, cj.jobId);
                  window.dispatchEvent(new CustomEvent('charpstar:jobStarted', { detail: { clientName, jobId: cj.jobId } }));
                } catch {}
              }
            }
          }
        }
        setExternalJobActive(active);
      } catch {}
    };
    check();
    timer = setInterval(check, 2000);
    const onStorage = (e: StorageEvent) => { if (e.key === jobKey) check(); };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(timer); window.removeEventListener('storage', onStorage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, isClientView]);

  const topActionsDisabled = isApplyingToLiveModels || externalJobActive;

  return (
    <header className="h-14 bg-white text-[#111827] flex items-center justify-between px-6 py-3 border-b border-gray-200 shadow-sm w-full">
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
              {([
                { page: 'manage', href: `/${clientName}/manage`, label: 'Models' },
                { page: 'materials', href: `/${clientName}/materials`, label: 'Materials' },
                { page: 'textures', href: `/${clientName}/textures`, label: 'Textures' },
                { page: 'render', href: `/${clientName}/render`, label: 'Render Studio' },
              ] as const).map(({ page, href, label }) => (
                <button
                  key={page}
                  onClick={(e) => {
                    if (currentPage === page) return;
                    if (hasUnsavedChanges && !window.confirm('You have unsaved material changes. Leave without saving?')) {
                      e.preventDefault();
                      return;
                    }
                    router.push(href);
                  }}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer hover:scale-105 ${
                    currentPage === page
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        )}

        {isClientView && titlePrefix && editingName && (
          <div className="ml-4 hidden sm:flex items-center text-xs text-gray-600">
            <span>{titlePrefix}:</span>
            <span className="ml-1 font-medium text-gray-800 truncate max-w-[220px]" title={editingName}>{editingName}</span>
          </div>
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
        {(currentPage === 'materials') && onApplyToLiveModels && (
          <Button 
            variant="default"
            size="sm"
            onClick={onApplyToLiveModels}
            disabled={topActionsDisabled}
            className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isApplyingToLiveModels ? 'Applying…' : 'Apply to Live Models'}
          </Button>
        )}
        {currentPage === 'materials' && onStopApply && (isApplyingToLiveModels || externalJobActive) && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onStopApply}
            className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
            title="Clear local apply state (does not cancel server job)"
          >
            Stop apply
          </Button>
        )}
        
        {(currentPage === 'manage' || currentPage === 'materials' || currentPage === 'textures') && (
          <>
            {onOpenBackups && currentPage === 'materials' && (
              <Button 
                variant="outline"
                size="sm"
                onClick={onOpenBackups}
                disabled={topActionsDisabled}
                className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <History size={14} className="mr-2" />
                Backups
              </Button>
            )}
            {onUploadModels && (currentPage === 'manage' || currentPage === 'textures') && (
              <Button 
                variant="default"
                size="sm"
                onClick={onUploadModels}
                disabled={topActionsDisabled}
                className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <Upload size={14} className="mr-2" />
                Upload
              </Button>
            )}
            {onRefreshModels && (
              <Button 
                variant="outline"
                size="sm"
                onClick={onRefreshModels}
                className="text-xs h-7 px-3 cursor-pointer hover:scale-105 transition-transform duration-200"
                title="Refresh (forces re-fetch from storage for materials)"
              >
                <RefreshCw size={14} className="mr-2" />
                Refresh
              </Button>
            )}
          </>
        )}

        {/* Export buttons: show for non-client views or render view when handler provided */}
        {((!isClientView) || isRenderView) && (
          <>
            {onExportGLB && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLB}
                className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <Download size={14} className="mr-2" />
                GLB
              </Button>
            )}
            {onExportGLTF && !isClientView && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportGLTF}
                className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <Download size={14} className="mr-2" />
                GLTF
              </Button>
            )}
            {onExportUSDZ && !isClientView && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onExportUSDZ}
                className="text-xs h-7 cursor-pointer hover:scale-105 transition-transform duration-200"
              >
                <Download size={14} className="mr-2" />
                USDZ
              </Button>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
