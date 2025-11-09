'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Item = { url: string; variant?: string; view?: string; resolution?: number; background?: string; timestamp?: string; filename: string };

const RenderHistoryPanel: React.FC<{ clientName: string; modelName: string }>= ({ clientName, modelName }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

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

  useEffect(() => { fetchHistory(); }, [clientName, modelName]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const startIdx = (current - 1) * pageSize;
  const endIdx = Math.min(items.length, startIdx + pageSize);
  const pageItems = items.slice(startIdx, endIdx);

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '';
    // Expecting YYYYMMDDTHHMMSS
    try {
      if (/^\d{8}T\d{6}$/.test(ts)) {
        const y = Number(ts.slice(0, 4));
        const m = Number(ts.slice(4, 6)) - 1;
        const d = Number(ts.slice(6, 8));
        const hh = Number(ts.slice(9, 11));
        const mm = Number(ts.slice(11, 13));
        const date = new Date(y, m, d, hh, mm, 0);
        return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    } catch {}
    return ts;
  };

  if (loading && items.length === 0) return <div className="text-xs text-gray-600">Loading history…</div>;
  if (error) return (
    <div className="text-xs text-red-600">{error}
      <Button variant="link" className="h-6 px-1 ml-2 text-xs" onClick={fetchHistory}>Retry</Button>
    </div>
  );

  if (!items.length) return <div className="text-xs text-gray-600">No renders yet for this model.</div>;

  return (
    <Card className="bg-white/95 border border-gray-200">
      <div className="max-h-72 overflow-auto divide-y">
        {pageItems.map((it, idx) => (
          <div key={it.url + idx} className="p-2 flex items-center gap-3">
            <a href={it.url} target="_blank" rel="noreferrer" className="shrink-0">
              <img
                src={it.url}
                alt={`${it.view || 'View'} ${it.background || ''} ${it.resolution || ''}`}
                width={64}
                height={64}
                className="w-16 h-16 object-cover rounded border border-gray-200"
                loading="lazy"
              />
            </a>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-900 truncate">{it.view || 'View'} • {it.background} • {it.resolution}px {it.variant ? `• ${it.variant}` : ''}</div>
              <div className="text-[11px] text-gray-600 truncate">{formatTimestamp(it.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 flex items-center justify-between">
        <div className="text-[11px] text-gray-600">Page {current} of {pageCount}</div>
        <div className="space-x-2">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={current <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={current >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</Button>
        </div>
      </div>
    </Card>
  );
};

export default RenderHistoryPanel;


