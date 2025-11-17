'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface QueueItemMeta {
  jobId: string;
  client: string;
  modelName?: string;
  variantName?: string | null;
  view?: { name: string };
  views?: Array<{ name: string }>;
  background?: string;
  resolution?: number;
  format?: string;
  createdAt: string;
  status?: 'queued' | 'running' | 'pending' | 'completed' | 'failed' | 'unknown';
}

interface CombinedStatusResponse {
  stage?: 'preparing' | 'rendering';
  status?: 'queued' | 'running' | 'pending' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  queuePosition?: number;
  imageUrl?: string;
  imageUrls?: string[];
  images?: Array<{ url: string; view: string; format: string }>;
  error?: string;
}

const RenderQueuePanel: React.FC<{ clientName: string }> = ({ clientName }) => {
  const [items, setItems] = useState<QueueItemMeta[]>([]);
  const [statuses, setStatuses] = useState<Record<string, CombinedStatusResponse>>({});
  const timerRef = useRef<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json?.items) ? json.items as any[] : [];
        setItems(arr);
        setStatuses(arr.reduce((acc: any, it: any) => { acc[it.jobId] = it; return acc; }, {}));
        if (arr.length > 0) setVisible(true);
      } catch {}
    };
    load();
  }, [clientName]);

  useEffect(() => {
    const onStarted = () => { setVisible(true); };
    try { window.addEventListener('charpstar:renderJobStarted', onStarted as EventListener); } catch {}
    return () => {
      try { window.removeEventListener('charpstar:renderJobStarted', onStarted as EventListener); } catch {}
    };
  }, [clientName]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json?.items) ? json.items as any[] : [];
        setItems(arr);
        const next: Record<string, CombinedStatusResponse> = {};
        for (const it of arr) next[it.jobId] = it;
        setStatuses(next);
        setVisible(arr.length > 0);
      } catch {}
    };
    poll();
    timerRef.current = setInterval(poll, 5000); // CRITICAL FIX: 5s instead of 2s (60% less load)
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [clientName]);

  const clearFinished = async () => {
    try {
      await fetch('/api/render/jobs/clear-finished', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientName })
      });
      const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      const arr = Array.isArray(json?.items) ? json.items as any[] : [];
      setItems(arr);
      setStatuses(arr.reduce((acc: any, it: any) => { acc[it.jobId] = it; return acc; }, {}));
      setVisible(arr.length > 0);
    } catch {}
  };

  if (!visible) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">Queue</div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2 text-xs text-gray-600 hover:text-gray-900" 
          onClick={clearFinished}
        >
          <Trash2 className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
      <div className="space-y-3 max-h-80 overflow-auto">
        {items.map((it, idx) => {
          const st = statuses[it.jobId] || {};
          const combinedPct = (() => {
            const cp = (st as any)?.combinedProgress;
            if (typeof cp === 'number') return Math.max(0, Math.min(100, cp));
            return 0;
          })();
          const effectiveQueuePos = (() => {
            const qp = (st as any)?.queuePosition;
            if (typeof qp === 'number' && qp > 0) return qp;
            return undefined;
          })();
          const isDone = st.status === 'completed' || st.status === 'failed';
          const isQueued = st.status === 'queued' || st.status === 'pending';
          const stageLabel = st.stage === 'preparing'
            ? 'Preparing'
            : (st.stage === 'rendering'
              ? 'Rendering'
              : (String((st as any).stage) === 'queued' ? 'Queued' : undefined));
          
          return (
            <div key={`${it.jobId}-${idx}`} className="p-3 rounded-lg bg-gray-50/50 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-gray-900 truncate">
                  {it.modelName || 'Model'} {it.variantName ? `(${it.variantName})` : ''}
                  {!isDone && stageLabel && (
                    <span className="text-[11px] text-gray-500 font-normal"> • {`${stageLabel}${isQueued ? (effectiveQueuePos ? ` #${effectiveQueuePos}` : '') : ` ${combinedPct}%`}`}</span>
                  )}
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {st.status === 'completed' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : st.status === 'failed' ? (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  )}
                </div>
              </div>
              <div className="mt-1.5 text-[10px] text-gray-500">
                {(() => {
                  const viewsArray = it.views || (it.view ? [it.view] : []);
                  const shortNames: Record<string, string> = {
                    'angledright': 'R35°',
                    'angledleft': 'L35°',
                    'table': 'Table',
                    'front': 'Front',
                    'back': 'Back',
                    'side': 'Side',
                    'top': 'Top',
                    'default': 'Def'
                  };
                  const viewNames = viewsArray.map(v => shortNames[v.name.toLowerCase()] || v.name).join(', ');
                  const bg = it.background === 'transparent' ? 'Transparent' : `#${it.background}`;
                  const fmt = it.format ? it.format.toUpperCase() : 'PNG';
                  return `${viewNames} • ${bg} • ${it.resolution}px • ${fmt}`;
                })()}
              </div>
              {!isDone && (
                <div className="mt-2 space-y-2">
                  <div className="w-full bg-gray-200/50 rounded-full h-1 overflow-hidden">
                    <div className="bg-blue-500 h-1 transition-all duration-300" style={{ width: `${combinedPct}%` }} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-gray-600 hover:text-gray-900"
                    onClick={async () => {
                      setItems(prev => prev.filter(x => x.jobId !== it.jobId));
                      setStatuses(prev => { const n = { ...prev }; delete (n as any)[it.jobId]; return n; });
                      try {
                        const res = await fetch('/api/render/cancel', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId: it.jobId, client: clientName })
                        });
                        await res.json().catch(() => ({}));
                      } catch {}
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {st.status === 'failed' && st.error && (
                <div className="mt-2 text-[10px] text-red-600 truncate" title={st.error as any}>{st.error}</div>
              )}
              {(() => {
                const isCompleted = st.status === 'completed';
                const isRendering = st.status === 'running' || st.status === 'pending';
                
                const images: Array<{ url: string; view?: string; format?: string }> = isCompleted && (st as any)
                  ? (Array.isArray((st as any).images)
                    ? (st as any).images
                    : (Array.isArray((st as any).imageUrls)
                      ? (st as any).imageUrls.map((url: string) => ({ url }))
                      : (typeof (st as any).imageUrl === 'string' ? [{ url: (st as any).imageUrl }] : [])))
                  : [];
                
                const viewsArray = it.views || (it.view ? [it.view] : []);
                const showPlaceholders = isRendering && viewsArray.length > 0;
                
                if (images.length > 0 || showPlaceholders) {
                  return (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {isCompleted && images.slice(0, 8).map((img, i) => (
                        <div key={`${it.jobId}-img-${i}`} className="group relative">
                          <a href={img.url} target="_blank" rel="noreferrer" className="block">
                            <img 
                              src={img.url} 
                              alt={`${img.view || 'render'} thumbnail`} 
                              width={56} 
                              height={56} 
                              className="w-14 h-14 object-cover rounded-md border border-gray-200 hover:border-blue-400 hover:scale-105 transition-all" 
                              loading="lazy" 
                            />
                          </a>
                          {img.view && (
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-gray-900/90 text-white text-[9px] font-medium rounded whitespace-nowrap">
                              {(() => {
                                const viewName = img.view || '';
                                const shortNames: Record<string, string> = {
                                  'angledright': 'R35°',
                                  'angledleft': 'L35°',
                                  'table': 'Table',
                                  'front': 'Front',
                                  'back': 'Back',
                                  'side': 'Side',
                                  'top': 'Top',
                                  'default': 'Def'
                                };
                                return shortNames[viewName.toLowerCase()] || viewName;
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                      {showPlaceholders && viewsArray.map((view, i) => (
                        <div key={`${it.jobId}-placeholder-${i}`} className="relative">
                          <div className="w-14 h-14 rounded-md border border-dashed border-gray-300 bg-white flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                          </div>
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-gray-700/90 text-white text-[9px] font-medium rounded whitespace-nowrap">
                            {(() => {
                              const viewName = view.name || '';
                              const shortNames: Record<string, string> = {
                                'angledright': 'R35°',
                                'angledleft': 'L35°',
                                'table': 'Table',
                                'front': 'Front',
                                'back': 'Back',
                                'side': 'Side',
                                'top': 'Top',
                                'default': 'Def'
                              };
                              return shortNames[viewName.toLowerCase()] || viewName;
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RenderQueuePanel;
