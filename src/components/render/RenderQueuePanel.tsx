'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

// localStorage removed; using server registry

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

  // React to new jobs being started and storage updates
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
    timerRef.current = setInterval(poll, 2000);
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
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-800">Render queue</div>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={clearFinished}>
          <Trash2 className="w-3 h-3 mr-1" /> Clear finished
        </Button>
      </div>
      <Card className="bg-white/95 border border-gray-200">
        <div className="max-h-60 overflow-auto divide-y">
          {items.map((it, idx) => {
            const st = statuses[it.jobId] || {};
            const rawPct = Math.max(0, Math.min(100, Number(st.progress || 0)));
            const combinedPct = (() => {
              const cp = (st as any)?.combinedProgress;
              if (typeof cp === 'number') return Math.max(0, Math.min(100, cp));
              // Fallback client-side mapping
              if (String((st as any).stage) === 'queued') return 0;
              if (st.stage === 'preparing') return Math.round(rawPct * 0.25);
              if (st.stage === 'rendering') return 25 + Math.round(rawPct * 0.75);
              return rawPct;
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
              <div key={`${it.jobId}-${idx}`} className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {it.modelName || 'Model'} {it.variantName ? `(${it.variantName})` : ''}
                    {!isDone && stageLabel && (
                      <span className="text-[11px] text-gray-600"> {`– ${stageLabel}${isQueued ? (effectiveQueuePos ? ` #${effectiveQueuePos}` : '') : ` ${combinedPct}%`}`}</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {st.status === 'completed' ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : st.status === 'failed' ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-gray-600 truncate">
                  {(() => {
                    const viewsArray = it.views || (it.view ? [it.view] : []);
                    const viewNames = viewsArray.map(v => v.name).join(', ');
                    const bg = it.background === 'transparent' ? 'Transparent' : `#${it.background}`;
                    const fmt = it.format ? it.format.toUpperCase() : 'PNG';
                    return `${viewNames} • ${bg} • ${it.resolution}px • ${fmt}`;
                  })()}
                </div>
                {!isDone && (
                  <div className="mt-1">
                    <div className="w-full bg-gray-200 rounded h-1 overflow-hidden">
                      <div className="bg-purple-500 h-1" style={{ width: `${combinedPct}%` }} />
                    </div>
                    {typeof st.queuePosition === 'number' && st.queuePosition > 0 && (
                      <div className="mt-1 text-[11px] text-gray-500">In queue: #{st.queuePosition}</div>
                    )}
                    <div className="mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={async () => {
                          // Optimistic remove
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
                  </div>
                )}
                {st.status === 'failed' && st.error && (
                  <div className="mt-1 text-[11px] text-red-600 truncate" title={st.error as any}>{st.error}</div>
                )}
                {st.status === 'completed' && (st as any) && ((st as any).images || (st as any).imageUrls || (st as any).imageUrl) && (
                  <div className="mt-2 space-y-1">
                    {(() => {
                      // Prefer images array with metadata, fallback to imageUrls, then imageUrl
                      const images: Array<{ url: string; view?: string; format?: string }> = Array.isArray((st as any).images)
                        ? (st as any).images
                        : (Array.isArray((st as any).imageUrls)
                          ? (st as any).imageUrls.map((url: string) => ({ url }))
                          : (typeof (st as any).imageUrl === 'string' ? [{ url: (st as any).imageUrl }] : []));
                      
                      return images.slice(0, 8).map((img, i) => (
                        <div key={`${it.jobId}-img-${i}`} className="flex items-center gap-2">
                          <a href={img.url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img 
                              src={img.url} 
                              alt={`${img.view || 'render'} thumbnail`} 
                              width={48} 
                              height={48} 
                              className="w-12 h-12 object-cover rounded border border-gray-200" 
                              loading="lazy" 
                            />
                          </a>
                          {img.view && (
                            <div className="text-[11px] text-gray-600">
                              <span className="font-medium capitalize">{img.view}</span>
                              {img.format && <span className="text-gray-400"> • {img.format.toUpperCase()}</span>}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default RenderQueuePanel;


