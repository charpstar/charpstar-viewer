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

interface RenderPanelProps {
  modelViewerRef: React.RefObject<any>;
  modelFilename: string | null;
}

type BackgroundOption = 'white' | 'transparent';

const RenderPanel: React.FC<RenderPanelProps> = ({ modelViewerRef, modelFilename }) => {
  const params = useParams();
  const clientName = (params?.client as string) || '';

  const cameraPresets = useMemo(() => ([
    { name: 'Default', orbit: '-25deg 80deg 80%' },
    { name: 'Front', orbit: '0deg 88deg 80%' },
    { name: 'Back', orbit: '180deg 90deg 80%' },
    { name: 'Side', orbit: '90deg 91deg 80%' },
    { name: 'Top', orbit: '0deg -200deg 80%' },
    { name: 'Table', orbit: '-35deg 71deg 80%' },
  ]), []);

  const [selectedView, setSelectedView] = useState<string>('Default');
  const [resolution, setResolution] = useState<string>('1024');  
  const [background, setBackground] = useState<BackgroundOption>('white');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

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

  const handleStartRender = async () => {
    if (!clientName || !modelFilename) return;
    const mv = modelViewerRef.current as any | null;
    const variantName: string | null = mv?.variantName || null;
    const preset = cameraPresets.find(p => p.name === selectedView) || cameraPresets[0];
    const view = { name: preset.name, orbit: preset.orbit };

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
          view,
          background,
          resolution: Number(resolution)
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
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <div className="text-[10px] uppercase text-gray-500 mb-1">View</div>
                <div className="relative">
                  <select
                    value={selectedView}
                    onChange={e => setSelectedView(e.target.value)}
                    className="w-full h-8 text-xs bg-white border border-gray-300 rounded px-2"
                  >
                    {cameraPresets.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500 mb-1">Background</div>
                <div className="relative">
                  <select
                    value={background}
                    onChange={e => setBackground(e.target.value as BackgroundOption)}
                    className="w-full h-8 text-xs bg-white border border-gray-300 rounded px-2"
                  >
                    <option value="white">White</option>
                    <option value="transparent">Transparent</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500 mb-1">Resolution</div>
                <div className="relative">
                  <select
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    className="w-full h-8 text-xs bg-white border border-gray-300 rounded px-2"
                  >
                    <option value="1024">1024</option>
                    <option value="2048">2048</option>
                    <option value="4096">4096</option>
                  </select>
                </div>
              </div>
            </div>
            {/* Render button moved to header to save space */}
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


