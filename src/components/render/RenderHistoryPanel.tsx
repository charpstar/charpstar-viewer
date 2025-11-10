'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type Item = { url: string; variant?: string; view?: string; resolution?: number; background?: string; timestamp?: string; filename: string; format?: string };
type GroupedRender = { timestamp: string; variant?: string; resolution?: number; background?: string; format?: string; images: Item[] };

const RenderHistoryPanel: React.FC<{ clientName: string; modelName: string }>= ({ clientName, modelName }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/render/history?client=${encodeURIComponent(clientName)}&model=${encodeURIComponent(modelName)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to load history');
      const list = Array.isArray(json?.items) ? (json.items as Item[]) : [];
      setItems(list);
      setPage(1);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    // Clear items immediately when model changes
    setItems([]);
    setPage(1);
    fetchHistory(); 
  }, [clientName, modelName]);

  // Auto-refresh when render completes
  useEffect(() => {
    const onRenderComplete = () => {
      // Wait a bit for the history to be saved before fetching
      setTimeout(() => fetchHistory(), 1000);
    };
    
    try { 
      window.addEventListener('charpstar:renderCompleted', onRenderComplete as EventListener);
    } catch {}
    
    return () => {
      try { 
        window.removeEventListener('charpstar:renderCompleted', onRenderComplete as EventListener);
      } catch {}
    };
  }, [clientName, modelName]);

  // Group renders by timestamp (multi-view renders go together)
  const groupedRenders = useMemo(() => {
    const groups = new Map<string, GroupedRender>();
    
    items.forEach(item => {
      const key = item.timestamp || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          timestamp: item.timestamp || '',
          variant: item.variant,
          resolution: item.resolution,
          background: item.background,
          format: item.format,
          images: []
        });
      }
      groups.get(key)!.images.push(item);
    });
    
    return Array.from(groups.values()).sort((a, b) => 
      String(b.timestamp).localeCompare(String(a.timestamp))
    );
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(groupedRenders.length / pageSize));
  const current = Math.min(page, pageCount);
  const startIdx = (current - 1) * pageSize;
  const endIdx = Math.min(groupedRenders.length, startIdx + pageSize);
  const pageItems = groupedRenders.slice(startIdx, endIdx);

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '';
    try {
      if (/^\d{8}T\d{6}$/.test(ts)) {
        const y = Number(ts.slice(0, 4));
        const m = Number(ts.slice(4, 6)) - 1;
        const d = Number(ts.slice(6, 8));
        const hh = Number(ts.slice(9, 11));
        const mm = Number(ts.slice(11, 13));
        const date = new Date(y, m, d, hh, mm, 0);
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    } catch {}
    return ts;
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
          <div className="text-sm text-gray-500">Loading history...</div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="text-sm text-red-600 mb-2">{error}</div>
          <Button variant="outline" size="sm" onClick={fetchHistory}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-sm text-gray-500">No renders yet for this model</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* History List - 4 Column Layout */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-4 gap-2">
          {pageItems.map((group, idx) => {
            const bg = group.background === 'transparent' ? 'Transparent' : `#${group.background}`;
            const fmt = group.format?.toUpperCase() || 'PNG';
            
            return (
              <div key={group.timestamp + idx} className="bg-gray-50 rounded p-2 border border-gray-200">
                {/* Thumbnails - Fixed size for consistency (sized for 5) */}
                <div className="mb-2">
                  <div className="flex gap-1">
                    {group.images.map((img, i) => {
                      const thumbnailUrl = img.url.includes('?') 
                        ? `${img.url}&width=128&height=128` 
                        : `${img.url}?width=128&height=128`;
                      return (
                        <div key={img.url + i} className="relative flex-shrink-0 w-[calc(20%-0.2rem)]">
                          <a 
                            href={img.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="block"
                          >
                            <img
                              src={thumbnailUrl}
                              alt={`${img.view || 'render'} thumbnail`}
                              className="w-full aspect-square object-cover rounded border border-gray-300 hover:border-black transition-colors"
                              loading="lazy"
                            />
                          </a>
                          {img.view && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 px-1 py-0.5 bg-black/90 text-white text-[7px] font-medium rounded-sm whitespace-nowrap leading-none">
                              {img.view}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Metadata - 2 Lines: Variant+Date, Settings */}
                <div className="text-[11px] leading-tight">
                  <div className="font-bold text-gray-900 truncate mb-1">
                    {group.variant || 'Default'} • <span className="font-normal text-gray-500">{formatTimestamp(group.timestamp)}</span>
                  </div>
                  <div className="text-gray-600 truncate">
                    {bg} • <span className="font-semibold">{group.resolution}px</span> • {fmt}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Pagination Footer */}
      {pageCount > 1 && (
        <div className="flex-shrink-0 border-t border-gray-200 p-2 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-600">Page {current} of {pageCount}</div>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-[10px]" 
                disabled={current <= 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 text-[10px]" 
                disabled={current >= pageCount} 
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenderHistoryPanel;
