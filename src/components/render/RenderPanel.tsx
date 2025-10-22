'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Camera } from 'lucide-react';
import { useParams } from 'next/navigation';

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
  const [resolution, setResolution] = useState<string>('2048');
  const [background, setBackground] = useState<BackgroundOption>('white');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        try { localStorage.setItem(`charpstar:renderJob:${clientName}`, jobId); } catch {}
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
        </div>

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

        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={handleStartRender}
            disabled={!modelFilename || isSubmitting}
            className="h-8 text-xs"
          >
            {isSubmitting ? (<><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Rendering...</>) : 'Render'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RenderPanel;


