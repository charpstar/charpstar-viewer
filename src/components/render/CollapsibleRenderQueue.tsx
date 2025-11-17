'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

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

const CollapsibleRenderQueue: React.FC<{ clientName: string }> = ({ clientName }) => {
  const [items, setItems] = useState<QueueItemMeta[]>([]);
  const [statuses, setStatuses] = useState<Record<string, CombinedStatusResponse>>({});
  const [prevStatuses, setPrevStatuses] = useState<Record<string, CombinedStatusResponse>>({});
  const [totalActiveCount, setTotalActiveCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const timerRef = useRef<any>(null);
  const [visible, setVisible] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json?.items) ? json.items as any[] : [];
        setItems(arr);
        setStatuses(arr.reduce((acc: any, it: any) => { acc[it.jobId] = it; return acc; }, {}));
        setTotalActiveCount(typeof json?.activeCount === 'number' ? json.activeCount : 0);
        setQueuedCount(typeof json?.queuedCount === 'number' ? json.queuedCount : 0);
        if (arr.length > 0 || json?.activeCount > 0) setVisible(true);
      } catch {}
    };
    load();
  }, [clientName]);

  useEffect(() => {
    const onStarted = () => { setVisible(true); setIsCollapsed(false); };
    try { window.addEventListener('charpstar:renderJobStarted', onStarted as EventListener); } catch {}
    return () => {
      try { window.removeEventListener('charpstar:renderJobStarted', onStarted as EventListener); } catch {}
    };
  }, [clientName]);

  useEffect(() => {
    let localPrevStatuses = prevStatuses; // Capture in closure to avoid dependency
    
    const poll = async () => {
      try {
        const res = await fetch(`/api/render/jobs/list?client=${encodeURIComponent(clientName)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json?.items) ? json.items as any[] : [];
        
        // Update counts from API
        setTotalActiveCount(typeof json?.activeCount === 'number' ? json.activeCount : 0);
        setQueuedCount(typeof json?.queuedCount === 'number' ? json.queuedCount : 0);
        
        // Items already filtered by API (oldest 10 active + recent 10 finished)
        setItems(arr);
        
        const next: Record<string, CombinedStatusResponse> = {};
        for (const it of arr) next[it.jobId] = it;
        
        // Check for newly completed jobs
        for (const jobId of Object.keys(next)) {
          const prevStatus = localPrevStatuses[jobId];
          const currentStatus = next[jobId];
          if (currentStatus?.status === 'completed' && prevStatus?.status !== 'completed') {
            // Job just completed, dispatch event
            try {
              window.dispatchEvent(new CustomEvent('charpstar:renderCompleted', { detail: { jobId } }));
            } catch {}
          }
        }
        
        localPrevStatuses = next; // Update local copy
        setPrevStatuses(next);
        setStatuses(next);
        setVisible(arr.length > 0 || (typeof json?.activeCount === 'number' && json.activeCount > 0));
      } catch {}
    };
    poll();
    
    // Adaptive polling interval based on total active jobs count
    // CRITICAL FIX: Use fixed 5s interval to prevent infinite loop
    // The adaptive logic was causing re-renders that recreated the interval
    timerRef.current = setInterval(poll, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [clientName]); // CRITICAL FIX: Only depend on clientName to prevent infinite loop

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
      setTotalActiveCount(typeof json?.activeCount === 'number' ? json.activeCount : 0);
      setQueuedCount(typeof json?.queuedCount === 'number' ? json.queuedCount : 0);
      setVisible(arr.length > 0 || (typeof json?.activeCount === 'number' && json.activeCount > 0));
    } catch {}
  };

  if (!visible) return null;

  // Display total counts (accurate)
  const displayText = totalActiveCount > 0 
    ? queuedCount > 0 
      ? `${totalActiveCount} in queue (tracking ${totalActiveCount - queuedCount})`
      : `${totalActiveCount} in queue`
    : 'No jobs in queue';

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-white border border-gray-300 rounded-t-lg shadow-2xl z-40" style={{maxHeight: '45vh'}}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2.5 bg-black text-white cursor-pointer rounded-t-lg"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-2">
          <div className="relative">
            {totalActiveCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalActiveCount > 99 ? '99+' : totalActiveCount}
              </div>
            )}
            <Loader2 className={`w-4 h-4 ${totalActiveCount > 0 ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="text-xs font-semibold">Render Queue</div>
            <div className="text-[10px] opacity-75">
              {displayText}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-[10px] text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              clearFinished();
            }}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
          {isCollapsed ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Queue Content */}
      {!isCollapsed && (
        <div className="max-h-[calc(45vh-55px)] overflow-auto p-2 space-y-1.5">
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
              <div key={`${it.jobId}-${idx}`} className="p-2 rounded bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="text-[11px] font-medium text-gray-900 truncate flex-1">
                    {it.modelName || 'Model'} {it.variantName ? `(${it.variantName})` : ''}
                    {!isDone && stageLabel && (
                      <span className="text-[9px] text-gray-500 font-normal"> • {`${stageLabel}${isQueued ? (effectiveQueuePos ? ` #${effectiveQueuePos}` : '') : ` ${combinedPct}%`}`}</span>
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0">
                    {st.status === 'completed' ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : st.status === 'failed' ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <Loader2 className="w-3 h-3 text-black animate-spin" />
                    )}
                  </div>
                </div>
                <div className="mt-0.5 text-[9px] text-gray-500">
                  {(() => {
                    const bg = it.background === 'transparent' ? 'Transparent' : `#${it.background}`;
                    const fmt = it.format ? it.format.toUpperCase() : 'PNG';
                    return `${bg} • ${it.resolution}px • ${fmt}`;
                  })()}
                </div>
                {!isDone && (
                  <div className="mt-1.5">
                    <div className="w-full bg-gray-200 rounded-full h-0.5 overflow-hidden">
                      <div className="bg-black h-0.5 transition-all duration-300" style={{ width: `${combinedPct}%` }} />
                    </div>
                  </div>
                )}
                {st.status === 'failed' && st.error && (
                  <div className="mt-1 text-[9px] text-red-600 truncate" title={st.error as any}>{st.error}</div>
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
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                        {isCompleted && images.slice(0, 8).map((img, i) => {
                          const thumbnailUrl = img.url.includes('?') 
                            ? `${img.url}&width=56&height=56` 
                            : `${img.url}?width=56&height=56`;
                          return (
                            <div key={`${it.jobId}-img-${i}`} className="group relative">
                              <a href={img.url} target="_blank" rel="noreferrer" className="block">
                                <img 
                                  src={thumbnailUrl} 
                                  alt={`${img.view || 'render'} thumbnail`} 
                                  width={28} 
                                  height={28} 
                                  className="w-7 h-7 object-cover rounded border border-gray-300 hover:border-black hover:scale-105 transition-all" 
                                  loading="lazy" 
                                />
                              </a>
                              {img.view && (
                                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-0.5 py-0.5 bg-black text-white text-[7px] font-medium rounded whitespace-nowrap leading-none">
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
                          );
                        })}
                        {showPlaceholders && viewsArray.map((view, i) => (
                          <div key={`${it.jobId}-placeholder-${i}`} className="relative">
                            <div className="w-7 h-7 rounded border border-dashed border-gray-300 bg-white flex items-center justify-center">
                              <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
                            </div>
                            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-0.5 py-0.5 bg-gray-700 text-white text-[7px] font-medium rounded whitespace-nowrap leading-none">
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
      )}
    </div>
  );
};

export default CollapsibleRenderQueue;
