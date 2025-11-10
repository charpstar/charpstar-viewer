'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Camera } from 'lucide-react';
import { useParams } from 'next/navigation';
import RenderQueuePanel from '@/components/render/RenderQueuePanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RenderHistoryPanel from '@/components/render/RenderHistoryPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import DebouncedColorPicker from '@/components/material/DebouncedColorPicker';

interface RenderPanelProps {
  modelViewerRef: React.RefObject<any>;
  modelFilename: string | null;
}

type BackgroundMode = 'transparent' | 'color';
type OutputFormat = 'png' | 'jpg' | 'webp';

const RenderPanel: React.FC<RenderPanelProps> = ({ modelViewerRef, modelFilename }) => {
  const params = useParams();
  const clientName = (params?.client as string) || '';

  const cameraPresets = useMemo(() => ([
    { name: 'default', label: 'Default', orbit: '-25deg 80deg 80%' },
    { name: 'front', label: 'Front', orbit: '0deg 88deg 80%' },
    { name: 'back', label: 'Back', orbit: '180deg 90deg 80%' },
    { name: 'side', label: 'Side', orbit: '90deg 91deg 80%' },
    { name: 'top', label: 'Top', orbit: '0deg -200deg 80%' },
  ]), []);

  // Load settings from localStorage with defaults
  const [selectedViews, setSelectedViews] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['front'];
    try {
      const saved = localStorage.getItem('charpstar:renderSettings:views');
      return saved ? JSON.parse(saved) : ['front'];
    } catch {
      return ['front'];
    }
  });
  
  const [resolution, setResolution] = useState<string>(() => {
    if (typeof window === 'undefined') return '1024';
    try {
      return localStorage.getItem('charpstar:renderSettings:resolution') || '1024';
    } catch {
      return '1024';
    }
  });
  
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    if (typeof window === 'undefined') return 'color';
    try {
      return (localStorage.getItem('charpstar:renderSettings:backgroundMode') as BackgroundMode) || 'color';
    } catch {
      return 'color';
    }
  });
  
  const [backgroundColor, setBackgroundColor] = useState<string>(() => {
    if (typeof window === 'undefined') return '#ffffff';
    try {
      return localStorage.getItem('charpstar:renderSettings:backgroundColor') || '#ffffff';
    } catch {
      return '#ffffff';
    }
  });
  
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(() => {
    if (typeof window === 'undefined') return 'png';
    try {
      return (localStorage.getItem('charpstar:renderSettings:format') as OutputFormat) || 'png';
    } catch {
      return 'png';
    }
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  // Save settings to localStorage whenever they change
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

  const computeBlocked = async () => {
    try {
      const modelName = modelFilename ? modelFilename.replace(/\.(gltf|glb)$/i, '') : '';
      const currentVariant = (modelViewerRef.current as any)?.variantName || null;
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
    const t = setInterval(update, 2000);
    return () => {
      try { window.removeEventListener('charpstar:renderJobStarted', onStarted as any); } catch {}
      clearInterval(t);
    };
  }, [clientName, modelFilename]);

  const toggleView = (viewName: string) => {
    setSelectedViews(prev => {
      if (prev.includes(viewName)) {
        // Don't allow deselecting if it's the last one
        return prev.length > 1 ? prev.filter(v => v !== viewName) : prev;
      }
      return [...prev, viewName];
    });
  };

  const handleStartRender = async () => {
    if (!clientName || !modelFilename || selectedViews.length === 0) return;
    const mv = modelViewerRef.current as any | null;
    const variantName: string | null = mv?.variantName || null;
    
    // Build views array with orbit data
    const views = selectedViews.map(viewName => {
      const preset = cameraPresets.find(p => p.name === viewName) || cameraPresets[0];
      return { name: preset.name, orbit: preset.orbit };
    });

    // Build background string: 'transparent' or hex color
    const backgroundValue = backgroundMode === 'transparent' ? 'transparent' : backgroundColor.replace('#', '');

    try {
      setIsSubmitting(true);
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
      if (!res.ok) throw new Error(json?.error || 'Failed to start render');
      const jobId = json?.jobId as string | undefined;
      if (jobId) {
        try { window.dispatchEvent(new CustomEvent('charpstar:renderJobStarted', { detail: { clientName, jobId } })); } catch {}
      }
    } catch (e) {
      console.error('Failed to start render:', e);
      alert('Failed to start render. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="bg-white/95 border border-gray-200 shadow-md">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Camera className="w-4 h-4 text-gray-700" />
            <div className="text-xs font-semibold text-gray-800">Photoreal Render</div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleStartRender}
                  disabled={!modelFilename || isSubmitting || isBlocked}
                  className="h-7 text-xs"
                >
                  {isSubmitting ? (<><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Render</>) : 'Render'}
                </Button>
              </TooltipTrigger>
              {isBlocked && (
                <TooltipContent>
                  <div className="text-xs">Render already in progress for this model/variant</div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        <Tabs defaultValue="options">
          <TabsList className="h-7">
            <TabsTrigger value="options" className="text-xs">Options</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Model History</TabsTrigger>
          </TabsList>
          <TabsContent value="options" className="mt-2">
            {/* Views Selection */}
            <div className="mb-3">
              <div className="text-[10px] uppercase text-gray-500 mb-1.5">Views to Render</div>
              <div className="flex flex-wrap gap-1.5">
                {cameraPresets.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => toggleView(preset.name)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      selectedViews.includes(preset.name)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {selectedViews.length} view{selectedViews.length !== 1 ? 's' : ''} selected
              </div>
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {/* Resolution */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 mb-1">Resolution</div>
                <select
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  className="w-full h-8 text-xs bg-white border border-gray-300 rounded px-2"
                >
                  <option value="1024">1024px</option>
                  <option value="2048">2048px</option>
                  <option value="4096">4096px</option>
                </select>
              </div>

              {/* Output Format */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 mb-1">Format</div>
                <select
                  value={outputFormat}
                  onChange={e => setOutputFormat(e.target.value as OutputFormat)}
                  className="w-full h-8 text-xs bg-white border border-gray-300 rounded px-2"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
            </div>

            {/* Background Settings */}
            <div className="mb-3">
              <div className="text-[10px] uppercase text-gray-500 mb-1.5">Background</div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setBackgroundMode('transparent')}
                  className={`flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
                    backgroundMode === 'transparent'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Transparent
                </button>
                <button
                  onClick={() => setBackgroundMode('color')}
                  className={`flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
                    backgroundMode === 'color'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Color
                </button>
              </div>
              {backgroundMode === 'color' && (
                <div className="bg-gray-50 rounded p-2">
                  <DebouncedColorPicker
                    label="Background Color"
                    value={backgroundColor}
                    onChange={setBackgroundColor}
                    debounceTime={100}
                  />
                </div>
              )}
            </div>

            <RenderQueuePanel clientName={clientName} />
          </TabsContent>
          <TabsContent value="history" className="mt-2">
            {modelFilename && (
              <RenderHistoryPanel clientName={clientName} modelName={modelFilename.replace(/\.(gltf|glb)$/i, '')} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RenderPanel;


