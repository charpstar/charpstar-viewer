'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Camera, AlertTriangle } from 'lucide-react';
import { useParams } from 'next/navigation';
import RenderHistoryPanel from '@/components/render/RenderHistoryPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AlwaysOpenColorPicker from '@/components/material/AlwaysOpenColorPicker';

interface RenderOptionsPanelProps {
  modelViewerRef: React.RefObject<any>;
  modelFilename: string | null;
  selectedVariants: string[];
  isModularMode?: boolean;
  modularViewerRef?: React.RefObject<any>;
  modularConfig?: string | null;
}

type BackgroundMode = 'transparent' | 'color';
type OutputFormat = 'png' | 'jpg' | 'webp';

const RenderOptionsPanel: React.FC<RenderOptionsPanelProps> = ({ 
  modelViewerRef, 
  modelFilename, 
  selectedVariants,
  isModularMode = false,
  modularViewerRef,
  modularConfig
}) => {
  const params = useParams();
  const clientName = (params?.client as string) || '';

  const cameraPresets = useMemo(() => ([
    { name: 'default', label: 'Default', orbit: '30deg 90deg 80%' },
    { name: 'front', label: 'Front', orbit: '0deg 88deg 80%' },
    { name: 'back', label: 'Back', orbit: '180deg 90deg 80%' },
    { name: 'side', label: 'Side', orbit: '90deg 91deg 80%' },
    { name: 'top', label: 'Top', orbit: '0deg -200deg 80%' },
  ]), []);

  const quickColors = [
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Light Grey', hex: '#D3D3D3' },
    { name: 'Beige', hex: '#EDE8D0' },
    { name: 'Soft Blue', hex: '#E3F2FD' },
    { name: 'Soft Green', hex: '#E8F5E9' },
    { name: 'Soft Pink', hex: '#FCE4EC' },
    { name: 'Soft Purple', hex: '#F3E5F5' },
    { name: 'Dark Grey', hex: '#505050' },
  ];

  // CRITICAL FIX: Don't read from localStorage in initializer - causes hydration mismatch
  // Instead, always start with defaults and load from localStorage in useEffect
  const [selectedViews, setSelectedViews] = useState<string[]>(['front']);
  const [resolution, setResolution] = useState<string>('1024');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('color');
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isRenderingAll, setIsRenderingAll] = useState(false);
  const [showRenderAllDialog, setShowRenderAllDialog] = useState(false);
  const [variantCount, setVariantCount] = useState(0);
  const [isRenderingSelected, setIsRenderingSelected] = useState(false);
  const [showRenderSelectedDialog, setShowRenderSelectedDialog] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // CRITICAL FIX: Re-sync state from localStorage after hydration to fix UI mismatch
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      // Re-read from localStorage and update state if different
      const savedViews = localStorage.getItem('charpstar:renderSettings:views');
      const savedResolution = localStorage.getItem('charpstar:renderSettings:resolution');
      const savedBackgroundMode = localStorage.getItem('charpstar:renderSettings:backgroundMode');
      const savedBackgroundColor = localStorage.getItem('charpstar:renderSettings:backgroundColor');
      const savedFormat = localStorage.getItem('charpstar:renderSettings:format');
      
      console.log('[RENDER DEBUG] Loading from localStorage:', {
        savedViews,
        savedResolution,
        savedBackgroundMode,
        savedBackgroundColor,
        savedFormat
      });
      
      if (savedViews) {
        const parsed = JSON.parse(savedViews);
        setSelectedViews(parsed);
      }
      
      if (savedResolution) setResolution(savedResolution);
      if (savedBackgroundMode) setBackgroundMode(savedBackgroundMode as BackgroundMode);
      if (savedBackgroundColor) setBackgroundColor(savedBackgroundColor);
      if (savedFormat) setOutputFormat(savedFormat as OutputFormat);
      
      setIsHydrated(true);
    } catch (e) {
      console.error('Failed to sync from localStorage:', e);
    }
  }, []);

  // Force 1024 resolution when Render All button is clicked
  React.useEffect(() => {
    if (isRenderingAll) {
      setResolution('1024');
    }
  }, [isRenderingAll]);

  // Update viewer background when background settings change
  React.useEffect(() => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;
    
    try {
      if (backgroundMode === 'transparent') {
        viewer.style.backgroundColor = 'transparent';
      } else {
        viewer.style.backgroundColor = backgroundColor;
      }
    } catch (e) {
      console.error('Failed to update viewer background:', e);
    }
  }, [backgroundMode, backgroundColor, modelViewerRef]);

  // Handle camera angle hover preview
  const handleCameraHover = (orbit: string) => {
    const viewer = modelViewerRef.current;
    if (!viewer) return;
    
    try {
      viewer.cameraOrbit = orbit;
    } catch (e) {
      console.error('Failed to update camera orbit:', e);
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('charpstar:renderSettings:views', JSON.stringify(selectedViews));
    } catch {}
  }, [selectedViews]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('charpstar:renderSettings:resolution', resolution);
    } catch {}
  }, [resolution]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('charpstar:renderSettings:backgroundMode', backgroundMode);
    } catch {}
  }, [backgroundMode]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('charpstar:renderSettings:backgroundColor', backgroundColor);
    } catch {}
  }, [backgroundColor]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('charpstar:renderSettings:format', outputFormat);
    } catch {}
  }, [outputFormat]);

  // When JPG is selected, switch to color mode if transparent
  React.useEffect(() => {
    if (outputFormat === 'jpg' && backgroundMode === 'transparent') {
      setBackgroundMode('color');
    }
  }, [outputFormat]);

  const computeBlocked = async () => {
    try {
      // For modular mode, use modular config name; for regular mode, use model filename
      const modelName = isModularMode 
        ? `modular-${modularConfig}` 
        : (modelFilename ? modelFilename.replace(/\.(gltf|glb)$/i, '') : '');
      
      const currentVariant = isModularMode ? null : ((modelViewerRef.current as any)?.variantName || null);
      
      const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({} as any));
      const items = Array.isArray(json?.items) ? json.items : [];
      const active = items.some((it: any) => {
        if (!it) return false;
        const sameModel = String(it.modelName || '') === modelName;
        const sameVariant = (it.variantName || null) === (currentVariant || null);
        const st = String(it.status || 'unknown');
        return sameModel && sameVariant && st !== 'completed' && st !== 'failed';
      });
      return active;
    } catch {
      return false;
    }
  };

  React.useEffect(() => {
    const update = async () => setIsBlocked(await computeBlocked());
    update();
    const onStarted = () => update();
    try { window.addEventListener('charpstar:renderJobStarted', onStarted as any); } catch {}
    const t = setInterval(update, 5000); // CRITICAL FIX: 5s instead of 2s (60% less load)
    return () => {
      try { window.removeEventListener('charpstar:renderJobStarted', onStarted as any); } catch {}
      clearInterval(t);
    };
  }, [clientName, modelFilename]);

  const toggleView = (viewName: string) => {
    setSelectedViews(prev => {
      if (prev.includes(viewName)) {
        return prev.length > 1 ? prev.filter(v => v !== viewName) : prev;
      }
      return [...prev, viewName];
    });
  };

  const handleStartRender = async () => {
    if (!clientName || selectedViews.length === 0) return;
    
    // Check if we have either a regular model or modular config
    if (!isModularMode && !modelFilename) return;
    if (isModularMode && !modularConfig) return;
    
    const views = selectedViews.map(viewName => {
      const preset = cameraPresets.find(p => p.name === viewName) || cameraPresets[0];
      return { name: preset.name, orbit: preset.orbit };
    });

    const backgroundValue = backgroundMode === 'transparent' ? 'transparent' : backgroundColor.replace('#', '');

    try {
      setIsSubmitting(true);
      
      let payload: any;
      
      if (isModularMode && modularViewerRef?.current) {
        // Modular mode: Export GLB and upload to temp
        console.log('[RENDER] Exporting modular scene...');
        
        const viewer = modularViewerRef.current;
        if (typeof viewer.exportGLB !== 'function') {
          throw new Error('Modular viewer exportGLB method not available');
        }
        
        const glbBlob = await viewer.exportGLB();
        console.log('[RENDER] Modular GLB exported, blob size:', glbBlob.size, 'type:', glbBlob.type);
        
        if (!glbBlob || glbBlob.size === 0) {
          throw new Error('Exported GLB is empty (0 bytes)');
        }
        
        // Convert blob to base64
        console.log('[RENDER] Converting blob to base64...');
        const glbBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            if (!result) {
              reject(new Error('FileReader result is null'));
              return;
            }
            const base64 = result.split(',')[1];
            console.log('[RENDER] Base64 conversion complete, length:', base64?.length || 0);
            if (!base64 || base64.length === 0) {
              reject(new Error('Base64 conversion resulted in empty string'));
              return;
            }
            resolve(base64);
          };
          reader.onerror = (e) => {
            console.error('[RENDER] FileReader error:', e);
            reject(new Error('FileReader failed'));
          };
          reader.readAsDataURL(glbBlob);
        });
        
        console.log('[RENDER] Base64 string length:', glbBase64.length);
        
        // Get BunnyCDN upload config (small request, no 413 error)
        console.log('[RENDER] Getting BunnyCDN upload config...');
        const configRes = await fetch('/api/bunny-upload-config');
        if (!configRes.ok) {
          const configError = await configRes.json().catch(() => ({}));
          throw new Error(configError?.error || 'Failed to get upload config');
        }
        const { hostname, zone, accessKey, pullZoneUrl } = await configRes.json();
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).slice(2, 10);
        const filename = `modular-${timestamp}-${randomId}.glb`;
        
        // Storage path (zone already includes Client-Editor)
        const storagePath = `${clientName}/Renders/_temp/${filename}`;
        const uploadUrl = `https://${hostname}/${zone}/${storagePath}`;
        
        // Convert base64 back to binary for upload
        console.log('[RENDER] Uploading directly to BunnyCDN...');
        const glbBinary = Uint8Array.from(atob(glbBase64), c => c.charCodeAt(0));
        
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'AccessKey': accessKey,
            'Content-Type': 'model/gltf-binary',
          },
          body: glbBinary,
        });
        
        if (!uploadRes.ok) {
          const uploadError = await uploadRes.text().catch(() => '');
          throw new Error(`BunnyCDN upload failed: ${uploadRes.status} - ${uploadError}`);
        }
        
        // Temp path for prep server (needs Client-Editor prefix)
        const tempPath = `Client-Editor/${storagePath}`;
        console.log('[RENDER] Temp GLB uploaded:', tempPath);
        
        // Build payload for modular render
        payload = {
          client: clientName,
          modelFilename: filename,
          modelName: `modular-${modularConfig}`,
          variantName: null,
          views,
          background: backgroundValue,
          resolution: Number(resolution),
          format: outputFormat,
          isModularUpload: true,
          tempGLBPath: tempPath
        };
      } else {
        // Regular model mode
        const mv = modelViewerRef.current as any | null;
        const variantName: string | null = mv?.variantName || null;
        
        payload = {
          client: clientName,
          modelFilename,
          modelName: modelFilename!.replace(/\.(gltf|glb)$/i, ''),
          variantName,
          views,
          background: backgroundValue,
          resolution: Number(resolution),
          format: outputFormat
        };
      }
      
      console.log('[RENDER] Sending render request:', payload);
      
      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to start render');
      const jobId = json?.jobId as string | undefined;
      if (jobId) {
        try { window.dispatchEvent(new CustomEvent('charpstar:renderJobStarted', { detail: { clientName, jobId } })); } catch {}
      }
    } catch (e) {
      console.error('Failed to start render:', e);
      alert('Failed to start render: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenderAll = async () => {
    if (!clientName || !modelFilename || selectedViews.length === 0) return;
    const mv = modelViewerRef.current as any | null;
    if (!mv) return;

    // Get all available variants
    const availableVariants = mv.availableVariants || [];
    const variantsToRender = availableVariants.length > 0 ? availableVariants : [null]; // null for default
    
    // Show warning dialog
    setVariantCount(variantsToRender.length);
    setShowRenderAllDialog(true);
  };

  const proceedWithRenderAll = async () => {
    if (!clientName || !modelFilename || selectedViews.length === 0) return;
    const mv = modelViewerRef.current as any | null;
    if (!mv) return;

    setShowRenderAllDialog(false);

    try {
      setIsRenderingAll(true);
      
      // Get all available variants
      const availableVariants = mv.availableVariants || [];
      const variantsToRender = availableVariants.length > 0 ? availableVariants : [null]; // null for default
      
      const views = selectedViews.map(viewName => {
        const preset = cameraPresets.find(p => p.name === viewName) || cameraPresets[0];
        return { name: preset.name, orbit: preset.orbit };
      });

      const backgroundValue = backgroundMode === 'transparent' ? 'transparent' : backgroundColor.replace('#', '');

      // Queue render for each variant
      for (const variantName of variantsToRender) {
        try {
          const res = await fetch('/api/render/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client: clientName,
              modelFilename,
              modelName: modelFilename.replace(/\.(gltf|glb)$/i, ''),
              variantName,
              views,
              background: backgroundValue,
              resolution: 1024, // Fixed at 1024
              format: outputFormat
            })
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            const jobId = json?.jobId as string | undefined;
            if (jobId) {
              try { window.dispatchEvent(new CustomEvent('charpstar:renderJobStarted', { detail: { clientName, jobId } })); } catch {}
            }
          }
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.error(`Failed to queue render for variant ${variantName}:`, e);
        }
      }
    } catch (e) {
      console.error('Failed to render all:', e);
    } finally {
      setIsRenderingAll(false);
    }
  };

  const handleRenderSelected = () => {
    if (!clientName || !modelFilename || selectedVariants.length === 0 || selectedViews.length === 0) return;
    
    // Show confirmation dialog
    setShowRenderSelectedDialog(true);
  };

  const proceedWithRenderSelected = async () => {
    if (!clientName || !modelFilename || selectedVariants.length === 0 || selectedViews.length === 0) return;

    setShowRenderSelectedDialog(false);

    try {
      setIsRenderingSelected(true);
      
      const views = selectedViews.map(viewName => {
        const preset = cameraPresets.find(p => p.name === viewName) || cameraPresets[0];
        return { name: preset.name, orbit: preset.orbit };
      });

      const backgroundValue = backgroundMode === 'transparent' ? 'transparent' : backgroundColor.replace('#', '');

      // Queue render for each selected variant
      for (const variantName of selectedVariants) {
        try {
          const res = await fetch('/api/render/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client: clientName,
              modelFilename,
              modelName: modelFilename.replace(/\.(gltf|glb)$/i, ''),
              variantName,
              views,
              background: backgroundValue,
              resolution: Number(resolution),
              format: outputFormat
            })
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            const jobId = json?.jobId as string | undefined;
            if (jobId) {
              try { window.dispatchEvent(new CustomEvent('charpstar:renderJobStarted', { detail: { clientName, jobId } })); } catch {}
            }
          }
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.error(`Failed to queue render for variant ${variantName}:`, e);
        }
      }
    } catch (e) {
      console.error('Failed to render selected variants:', e);
    } finally {
      setIsRenderingSelected(false);
    }
  };

  const canUseTransparent = outputFormat !== 'jpg';
  const isColorPickerDisabled = backgroundMode === 'transparent';

  // Get current variant name
  const [currentVariantName, setCurrentVariantName] = useState('Default');

  // Update current variant name when it changes
  React.useEffect(() => {
    const updateVariantName = () => {
      try {
        const mv = modelViewerRef.current;
        if (!mv) {
          setCurrentVariantName('Default');
          return;
        }
        setCurrentVariantName(mv.variantName || 'Default');
      } catch {
        setCurrentVariantName('Default');
      }
    };

    // Initial update
    updateVariantName();

    // Listen for variant changes
    const viewer = modelViewerRef.current;
    if (viewer) {
      viewer.addEventListener('variant-applied', updateVariantName);
      return () => {
        viewer.removeEventListener('variant-applied', updateVariantName);
      };
    }
  }, [modelViewerRef.current, modelFilename]);

  return (
    <div className="h-full flex bg-gray-50">
      {/* Left Section - Render Settings (exactly 50%) */}
      <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col">
        {/* Settings Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Render Settings</h3>
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Settings Grid */}
            <div className="grid grid-cols-5 gap-5">
              {/* Camera Angles */}
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 block">
                  Camera Angles (<span suppressHydrationWarning>{selectedViews.length}</span>)
                </label>
                <div className="space-y-2">
                  {cameraPresets.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => toggleView(preset.name)}
                      onMouseEnter={() => handleCameraHover(preset.orbit)}
                      className={`w-full px-3 py-2 text-sm rounded font-medium text-left transition-colors ${
                        selectedViews.includes(preset.name)
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 block">
                  Resolution {isRenderingAll && <span className="text-[10px] text-gray-500">(1024px only)</span>}
                </label>
                <div className="space-y-2">
                  {['1024', '2048', '4096'].map(res => {
                    const isDisabled = isRenderingAll && res !== '1024';
                    return (
                      <button
                        key={res}
                        onClick={() => !isDisabled && setResolution(res)}
                        disabled={isDisabled}
                        className={`w-full px-3 py-2 text-sm rounded font-medium transition-colors ${
                          resolution === res
                            ? 'bg-black text-white'
                            : isDisabled
                            ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {res}px
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 block">Format</label>
                <div className="space-y-2">
                  {(['png', 'jpg', 'webp'] as OutputFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setOutputFormat(fmt)}
                      className={`w-full px-3 py-2 text-sm rounded font-medium transition-colors ${
                        outputFormat === fmt
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Mode */}
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 block">Background</label>
                <div className="space-y-2">
                  <button
                    onClick={() => canUseTransparent && setBackgroundMode('transparent')}
                    disabled={!canUseTransparent}
                    className={`w-full px-3 py-2 text-sm rounded font-medium transition-colors ${
                      backgroundMode === 'transparent'
                        ? 'bg-black text-white'
                        : canUseTransparent
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Transparent
                  </button>
                  <button
                    onClick={() => setBackgroundMode('color')}
                    className={`w-full px-3 py-2 text-sm rounded font-medium transition-colors ${
                      backgroundMode === 'color'
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Custom Color
                  </button>
                </div>
              </div>

              {/* Color Picker with Quick Colors */}
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3 block">Background Color</label>
                <div>
                  <div className={`mb-3 ${isColorPickerDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
                    <AlwaysOpenColorPicker
                      value={backgroundColor}
                      onChange={setBackgroundColor}
                      debounceTime={100}
                    />
                  </div>
                  <div className={isColorPickerDisabled ? 'opacity-40 pointer-events-none' : ''}>
                    <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Quick</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {quickColors.map(color => (
                        <TooltipProvider key={color.hex}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setBackgroundColor(color.hex)}
                                className="w-full aspect-square rounded border border-gray-300 hover:border-black hover:scale-105 transition-all shadow-sm"
                                style={{ backgroundColor: color.hex }}
                                title={color.name}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">{color.name}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="border-t border-gray-200 p-6 bg-white flex-shrink-0">
          <div className="flex gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="lg"
                    onClick={handleStartRender}
                    disabled={(isModularMode ? !modularConfig : !modelFilename) || isSubmitting || isBlocked || isRenderingAll || isRenderingSelected}
                    className="flex-1 h-12 text-base font-semibold bg-black hover:bg-gray-800"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Rendering...
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Render ({currentVariantName})
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                {isBlocked ? (
                  <TooltipContent>
                    <div className="text-sm">Render already in progress for this model</div>
                  </TooltipContent>
                ) : (
                  <TooltipContent>
                    <div className="text-sm">Render the current variant with selected settings</div>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleRenderSelected}
                    disabled={(isModularMode ? !modularConfig : !modelFilename) || isSubmitting || isBlocked || isRenderingAll || isRenderingSelected || selectedVariants.length === 0}
                    className={`flex-1 h-12 text-base font-semibold border-2 hover:bg-gray-100 ${
                      selectedVariants.length === 0
                        ? 'border-gray-300 text-gray-400 cursor-not-allowed' 
                        : 'border-black'
                    }`}
                  >
                    {isRenderingSelected ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Queueing...
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Render Selected ({selectedVariants.length})
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {selectedVariants.length === 0
                      ? 'Select variants from the right panel to render' 
                      : `Queue renders for ${selectedVariants.length} selected variant${selectedVariants.length !== 1 ? 's' : ''}`
                    }
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleRenderAll}
                    disabled={(isModularMode ? !modularConfig : !modelFilename) || isSubmitting || isBlocked || isRenderingAll || isRenderingSelected || resolution !== '1024'}
                    className={`flex-1 h-12 text-base font-semibold border-2 hover:bg-gray-100 ${
                      resolution !== '1024' 
                        ? 'border-gray-300 text-gray-400 cursor-not-allowed' 
                        : 'border-black'
                    }`}
                  >
                    {isRenderingAll ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Queueing...
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Render All
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {resolution !== '1024' 
                      ? 'Only available at 1024px resolution' 
                      : 'Queue renders for all variants at 1024px'
                    }
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Right Section - History (exactly 50%) */}
      <div className="w-1/2 bg-white flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">
            Render History - {modelFilename ? modelFilename.replace(/\.(gltf|glb)$/i, '') : 'Select Model'}
          </h3>
        </div>
        
        <div className="flex-1 overflow-auto">
          {modelFilename ? (
            <div className="h-full">
              <RenderHistoryPanel clientName={clientName} modelName={modelFilename.replace(/\.(gltf|glb)$/i, '')} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <div>
                <div className="text-sm text-gray-500">Select a model to view render history</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Render All Warning Dialog */}
      <Dialog open={showRenderAllDialog} onOpenChange={setShowRenderAllDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <DialogTitle>Render All Variants</DialogTitle>
            </div>
            <DialogDescription className="text-left">
              You are about to queue renders for <strong>{variantCount} variant{variantCount !== 1 ? 's' : ''}</strong> of this model.
              <br />
              <br />
              Depending on the number of materials and selected camera angles, this process may take a considerable amount of time to complete.
              <br />
              <br />
              All renders will be queued at 1024px resolution with your current settings.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRenderAllDialog(false)}
              disabled={isRenderingAll}
              className="sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={proceedWithRenderAll}
              disabled={isRenderingAll}
              className="sm:order-2 bg-black hover:bg-gray-800"
            >
              {isRenderingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Queueing...
                </>
              ) : (
                'Proceed'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Render Selected Variants Dialog */}
      <Dialog open={showRenderSelectedDialog} onOpenChange={setShowRenderSelectedDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <Camera className="h-5 w-5 text-black" />
              <DialogTitle>Render Selected Variants</DialogTitle>
            </div>
            <div className="text-left text-sm text-muted-foreground">
              <div className="mb-3">
                You are about to queue renders for <strong>{selectedVariants.length} selected variant{selectedVariants.length !== 1 ? 's' : ''}</strong>:
              </div>
              
              {/* Selected Variants List */}
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2 mb-3 border border-gray-200">
                <ul className="text-sm space-y-1">
                  {selectedVariants.map((variant, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-gray-700">
                      <div className="w-1 h-1 bg-black rounded-full"></div>
                      {variant}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Current Settings Preview */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                <div className="text-sm font-semibold text-blue-900 mb-2">Current Settings:</div>
                <div className="text-xs text-blue-800 space-y-1">
                  <div>• <strong>Resolution:</strong> {resolution}px</div>
                  <div>• <strong>Format:</strong> {outputFormat.toUpperCase()}</div>
                  <div>• <strong>Background:</strong> {backgroundMode === 'transparent' ? 'Transparent' : backgroundColor}</div>
                  <div>• <strong>Camera Angles:</strong> {selectedViews.map(v => cameraPresets.find(p => p.name === v)?.label || v).join(', ')}</div>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                Depending on the number of selected camera angles and material complexity, this process may take some time to complete.
              </div>
            </div>
          </DialogHeader>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRenderSelectedDialog(false)}
              disabled={isRenderingSelected}
              className="sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={proceedWithRenderSelected}
              disabled={isRenderingSelected}
              className="sm:order-2 bg-black hover:bg-gray-800"
            >
              {isRenderingSelected ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Queueing {selectedVariants.length} Render{selectedVariants.length !== 1 ? 's' : ''}...
                </>
              ) : (
                `Queue ${selectedVariants.length} Render${selectedVariants.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RenderOptionsPanel;
