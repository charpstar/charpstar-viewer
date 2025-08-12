// src/components/GlobalJobNotifications.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { isValidClient } from '@/config/clientConfig';
import ApplyJobNotification from './ApplyJobNotification';

interface JobProgress {
  total: number;
  done: number;
  failed: number;
  currentFile?: string;
  processedFiles?: Array<{
    filename: string;
    status: 'success' | 'failed' | 'processing';
    size?: number;
    error?: string;
  }>;
}

interface JobSummary {
  total: number;
  done: number;
  failed: number;
  failedFiles: string[];
  processedFiles?: Array<{
    filename: string;
    status: 'success' | 'failed';
    size?: number;
    error?: string;
  }>;
}

interface ActiveJob {
  clientName: string;
  jobId: string;
  isApplying: boolean;
  progress: JobProgress | null;
  summary: JobSummary | null;
}

const GlobalJobNotifications: React.FC = () => {
  const params = useParams();
  const pathname = usePathname();
  const clientName = params?.client as string;
  const isClientView = isValidClient(clientName);
  
  const [activeJobs, setActiveJobs] = useState<Record<string, ActiveJob>>({});
  const pollTimersRef = useRef<Record<string, any>>({});
  const lastUpdateRef = useRef<Record<string, string>>({});  // Track last JSON state to prevent redundant updates
  const stalledCountsRef = useRef<Record<string, number>>({});
  
  // Stable per-tab id
  const tabId = useMemo(() => {
    try {
      let id = sessionStorage.getItem('charpstar:globalTabId');
      if (!id) {
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('charpstar:globalTabId', id);
      }
      return id;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  // Check for existing jobs on mount and client change
  useEffect(() => {
    if (!isClientView || !clientName) return;
    
    const checkExistingJob = async () => {
      try {
        const jobId = localStorage.getItem(`charpstar:applyJob:${clientName}`);
        if (!jobId) return;
        
        // Check if job is still active
        const response = await fetch(`/api/apply/status?jobId=${encodeURIComponent(jobId)}`, { 
          cache: 'no-store' 
        });
        
        if (!response.ok) {
          // Job doesn't exist anymore, clean up
          localStorage.removeItem(`charpstar:applyJob:${clientName}`);
          return;
        }
        
        const data = await response.json();
        const isStillActive = data.status !== 'completed';
        
        if (isStillActive) {
          // Resume tracking this job
          setActiveJobs(prev => ({
            ...prev,
            [clientName]: {
              clientName,
              jobId,
              isApplying: true,
              progress: {
                total: data.total || 0,
                done: data.done || 0,
                failed: data.failed || 0,
                processedFiles: data.processedFiles || []
              },
              summary: null
            }
          }));
          
          startPolling(clientName, jobId);
        } else {
          // Job completed, show summary
          setActiveJobs(prev => ({
            ...prev,
            [clientName]: {
              clientName,
              jobId,
              isApplying: false,
              progress: null,
              summary: {
                total: data.total || 0,
                done: data.done || 0,
                failed: data.failed || 0,
                failedFiles: (data.processedFiles || [])
                  .filter((f: any) => f.status === 'failed')
                  .map((f: any) => f.filename),
                processedFiles: data.processedFiles || []
              }
            }
          }));
        }
      } catch (error) {
        console.error('Error checking existing job:', error);
      }
    };
    
    checkExistingJob();
  }, [clientName, isClientView]);

  const startPolling = (client: string, jobId: string) => {
    // Clear existing timer
    if (pollTimersRef.current[client]) {
      clearInterval(pollTimersRef.current[client]);
    }
    
    let pollInterval = 2000; // Start with 2 seconds
    let errorCount = 0;
    let lastUpdateTime = Date.now();
    
    const finalizeWithError = (message: string, snapshot?: { total?: number; done?: number; failed?: number; processedFiles?: any[] }) => {
      const current = activeJobs[client];
      const total = snapshot?.total ?? current?.progress?.total ?? 0;
      const done = snapshot?.done ?? current?.progress?.done ?? 0;
      const failed = Math.max(1, snapshot?.failed ?? current?.progress?.failed ?? 0);
      const files = snapshot?.processedFiles ?? current?.progress?.processedFiles ?? [];
      const augmented = [...files, { filename: 'Job interrupted', status: 'failed', error: message } as any];
      setActiveJobs(prev => ({
        ...prev,
        [client]: {
          clientName: client,
          jobId,
          isApplying: false,
          progress: null,
          summary: {
            total,
            done: Math.min(total, done + failed),
            failed,
            failedFiles: augmented.filter((f: any) => f?.status === 'failed').map((f: any) => f?.filename),
            processedFiles: augmented,
          },
        },
      }));
      try { localStorage.removeItem(`charpstar:applyJob:${client}`); } catch {}
      window.dispatchEvent(new CustomEvent('charpstar:jobSummary', { detail: { clientName: client, status: 'terminated', summary: {
        total,
        done: Math.min(total, done + failed),
        failed,
        failedFiles: augmented.filter((f: any) => f?.status === 'failed').map((f: any) => f?.filename),
        processedFiles: augmented,
      } } }));
      stopPolling(client);
    };

    const poll = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        
        const response = await fetch(`/api/apply/status?jobId=${encodeURIComponent(jobId)}`, { 
          cache: 'no-store',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Job not found or other error -> finalize with error
          finalizeWithError('Background job terminated');
          return;
        }
        
        const data = await response.json();
        const done = data.done || 0;
        const failed = data.failed || 0;
        const total = data.total || 0;
        const files = data.processedFiles || [];
        
        // If worker marks terminated explicitly
        if (data.status === 'terminated') {
          finalizeWithError('Background job terminated', { total, done, failed, processedFiles: files });
          return;
        }

        // Only update state if data actually changed
        const currentProgress = activeJobs[client]?.progress;
        const hasChanges = done !== currentProgress?.done || 
                          failed !== currentProgress?.failed ||
                          files.length !== (currentProgress?.processedFiles?.length || 0);
        
        if (hasChanges) {
          // Use functional update to minimize re-renders
          const newProgress = { total, done, failed, processedFiles: files };
          const newProgressJson = JSON.stringify(newProgress);
          
          // Skip update if exact same data as last time
          if (lastUpdateRef.current[client] === newProgressJson) {
            return;
          }
          
          lastUpdateRef.current[client] = newProgressJson;
          
          setActiveJobs(prev => {
            const current = prev[client];
            if (!current) return prev;
            
            return {
              ...prev,
              [client]: {
                ...current,
                progress: newProgress
              }
            };
          });
          lastUpdateTime = Date.now();
          pollInterval = 2000; // Reset to fast polling when there are updates
          stalledCountsRef.current[client] = 0;
        } else {
          // No changes - slow down polling to reduce load
          const timeSinceUpdate = Date.now() - lastUpdateTime;
          if (timeSinceUpdate > 30000) { // 30 seconds
            pollInterval = Math.min(10000, pollInterval * 1.2); // Max 10 seconds
          }
          // If no change, ask worker if client has an active job; if not, treat as terminated
          try {
            const cr = await fetch(`/api/apply/client-status?client=${encodeURIComponent(client)}`, { cache: 'no-store' });
            const cj = await cr.json().catch(() => ({} as any));
            const active = cr.ok && !!cj?.active;
            if (!active) {
              stalledCountsRef.current[client] = (stalledCountsRef.current[client] || 0) + 1;
              if (stalledCountsRef.current[client] >= 2) {
                finalizeWithError('Background job terminated', { total, done, failed, processedFiles: files });
                return;
              }
            } else {
              stalledCountsRef.current[client] = 0;
            }
          } catch {}
          // Hard timeout: if absolutely no progress for a long time, consider job stalled and finalize
          if (timeSinceUpdate > 120000) { // 2 minutes of no progress
            finalizeWithError('Job stalled (no progress for 2 minutes)', { total, done, failed, processedFiles: files });
            return;
          }
        }
        
        // Check if completed
        if (data.status === 'completed' || (total > 0 && done + failed >= total)) {
          setActiveJobs(prev => ({
            ...prev,
            [client]: {
              ...prev[client],
              isApplying: false,
              summary: {
                total,
                done: done + failed,
                failed,
                failedFiles: files
                  .filter((f: any) => f.status === 'failed')
                  .map((f: any) => f.filename),
                processedFiles: files
              }
            }
          }));
          
          stopPolling(client);
          localStorage.removeItem(`charpstar:applyJob:${client}`);
          window.dispatchEvent(new CustomEvent('charpstar:jobSummary', { detail: { clientName: client, status: 'completed', summary: {
            total,
            done: done + failed,
            failed,
            failedFiles: files.filter((f: any) => f.status === 'failed').map((f: any) => f.filename),
            processedFiles: files,
          } } }));
          return;
        }
        
        errorCount = 0; // Reset error count on success
        
      } catch (error) {
        errorCount++;
        console.error('Polling error:', error);
        
        // Exponential backoff on errors
        if (errorCount > 3) {
          pollInterval = Math.min(30000, pollInterval * 2); // Max 30 seconds
        }
      }
      
      // Schedule next poll
      pollTimersRef.current[client] = setTimeout(poll, pollInterval);
    };
    
    // Start polling immediately
    poll();
  };

  const stopPolling = (client: string) => {
    if (pollTimersRef.current[client]) {
      clearTimeout(pollTimersRef.current[client]);
      delete pollTimersRef.current[client];
    }
  };

  const dismissJob = useCallback((client: string) => {
    setActiveJobs(prev => {
      const next = { ...prev };
      delete next[client];
      return next;
    });
    stopPolling(client);
    
    // Clean up refs
    delete lastUpdateRef.current[client];
    
    // Clean up localStorage
    try {
      localStorage.removeItem(`charpstar:applyJob:${client}`);
    } catch {}
  }, []);

  // Listen for new jobs being started (from materials page)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key?.startsWith('charpstar:applyJob:')) return;
      
      const client = e.key.replace('charpstar:applyJob:', '');
      if (e.newValue && !activeJobs[client]) {
        // New job started
        const jobId = e.newValue;
        setActiveJobs(prev => ({
          ...prev,
          [client]: {
            clientName: client,
            jobId,
            isApplying: true,
            progress: { total: 0, done: 0, failed: 0, processedFiles: [] },
            summary: null
          }
        }));
        startPolling(client, jobId);
      } else if (!e.newValue && activeJobs[client]) {
        // Job removed
        dismissJob(client);
      }
    };

    // Listen for custom events (same-tab communication)
    const handleJobStarted = (e: CustomEvent) => {
      const { clientName: client, jobId } = e.detail;
      if (!activeJobs[client]) {
        setActiveJobs(prev => ({
          ...prev,
          [client]: {
            clientName: client,
            jobId,
            isApplying: true,
            progress: { total: 0, done: 0, failed: 0, processedFiles: [] },
            summary: null
          }
        }));
        startPolling(client, jobId);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('charpstar:jobStarted', handleJobStarted as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('charpstar:jobStarted', handleJobStarted as EventListener);
    };
  }, [activeJobs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(pollTimersRef.current).forEach(stopPolling);
    };
  }, []);

  // Render all active job notifications
  const jobArray = Object.values(activeJobs);
  
  return (
    <>
      {jobArray.map((job, index) => (
        <ApplyJobNotification
          key={job.clientName}
          isVisible={true}
          isApplying={job.isApplying}
          progress={job.progress}
          summary={job.summary}
          clientName={job.clientName}
          stackIndex={index}
          onDismiss={() => dismissJob(job.clientName)}
        />
      ))}
    </>
  );
};

export default GlobalJobNotifications;
