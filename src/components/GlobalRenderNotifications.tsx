'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';
import { isValidClient } from '@/config/clientConfig';
import { useParams } from 'next/navigation';

interface CombinedStatusResponse {
  stage?: 'preparing' | 'rendering';
  status?: 'queued' | 'running' | 'pending' | 'completed' | 'failed' | 'unknown';
  progress?: number;
  queuePosition?: number;
  imageUrl?: string;
  error?: string;
}

const GlobalRenderNotifications: React.FC = () => {
  const params = useParams();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<CombinedStatusResponse | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!isClientView) return;
    try {
      const id = localStorage.getItem(`charpstar:renderJob:${clientName}`);
      if (id) {
        setJobId(id);
        setVisible(true);
      }
    } catch {}
  }, [clientName, isClientView]);

  useEffect(() => {
    const onStarted = (e: any) => {
      const d = e?.detail;
      if (d?.clientName === clientName && d?.jobId) {
        setJobId(d.jobId);
        setVisible(true);
      }
    };
    window.addEventListener('charpstar:renderJobStarted', onStarted as EventListener);
    return () => window.removeEventListener('charpstar:renderJobStarted', onStarted as EventListener);
  }, [clientName]);

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/render/combined-status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus({ status: 'failed' });
          return;
        }
        setStatus(json as CombinedStatusResponse);
        if (json?.status === 'completed' || json?.status === 'failed') {
          clearInterval(timerRef.current);
          timerRef.current = null;
          try { localStorage.removeItem(`charpstar:renderJob:${clientName}`); } catch {}
        }
      } catch (e) {}
    };
    poll();
    timerRef.current = setInterval(poll, 2000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jobId, clientName]);

  if (!visible || !jobId) return null;
  const isComplete = status?.status === 'completed' || status?.status === 'failed';
  const pct = Math.max(0, Math.min(100, Number(status?.progress || 0)));
  let progressText = '';
  if (status?.stage === 'preparing') {
    progressText = status?.status === 'queued' ? `Preparing (queued #${status?.queuePosition || 0})` : `Preparing... ${pct}%`;
  } else if (status?.stage === 'rendering') {
    if (status?.status === 'queued' || status?.status === 'pending') {
      progressText = `Rendering (queued #${status?.queuePosition || 0})`;
    } else if (status?.status === 'running') {
      progressText = `Rendering... ${pct}%`;
    } else if (status?.status === 'completed') {
      progressText = 'Render complete';
    } else if (status?.status === 'failed') {
      progressText = 'Render failed';
    }
  }

  return (
    <div className="fixed left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4" style={{ top: '16px' }}>
      <Card className="shadow-lg border-l-4 border-l-purple-500 bg-white/95 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              {status?.status === 'completed' ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : status?.status === 'failed' ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{progressText}</div>
                <div className="text-xs text-gray-600">{clientName}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isComplete && (
                <Button variant="ghost" size="sm" onClick={() => setVisible(false)} className="h-6 w-6 p-0">
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          {isComplete && status?.status === 'completed' && (status as any)?.imageUrl && (
            <div className="mt-3 flex items-center justify-end">
              <a href={(status as any).imageUrl as string} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs">Open image</Button>
              </a>
            </div>
          )}
          {!isComplete && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                <div className="bg-purple-500 h-2" style={{ width: `${pct}%` }} />
              </div>
              {typeof status?.queuePosition === 'number' && status.queuePosition > 0 && (
                <div className="mt-1 text-xs text-gray-600">In queue: #{status.queuePosition}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GlobalRenderNotifications;



