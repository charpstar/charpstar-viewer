'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { notFound } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Palette, Trash2, Edit, Upload, X } from 'lucide-react';
import Header from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DebouncedColorPicker from '@/components/material/DebouncedColorPicker';
import { SliderWithInput } from '@/components/ui/slider-with-input';
import { Progress } from '@/components/ui/progress';
import { toast, Toaster } from 'sonner';

// Material interface for the editor
interface Material {
  name: string;
  baseColor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor: [number, number, number];
  normalScale: number;
  occlusionStrength: number;
  baseColorTexture?: string;
  baseColorTextureRotation?: number;
  metallicRoughnessTexture?: string;
  normalTexture?: string;
  normalTextureRotation?: number;
  occlusionTexture?: string;
  emissiveTexture?: string;
  sheenFactor?: number; // legacy UI alias
  sheenTexture?: string; // legacy UI alias
  sheenRoughnessFactor?: number;
  sheenRoughnessTexture?: string;
  sheenColor?: [number, number, number];
  sheenColorTexture?: string;
  sheenColorTextureRotation?: number;
  // Texture tiling (KHR_texture_transform scale)
  baseColorTextureScale?: [number, number];
  normalTextureScale?: [number, number];
  sheenColorTextureScale?: [number, number];
  sheenRoughnessTextureScale?: [number, number];
  // Sheen texCoord (UV set)
  sheenColorTextureTexCoord?: number;
  sheenRoughnessTextureTexCoord?: number;
}

interface ReferenceGltf {
  materials: Material[];
  textures: any[];
  images: any[];
  meshes?: string[];
  lastModified: string;
}

// Intentionally no viewer/model logic – UI-only mode
// But we will load the module build of model-viewer and map 'three' via import map

function ensureModelViewerModuleLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).customElements?.get?.('model-viewer')) {
      resolve();
      return;
    }

    // Ensure import map for 'three' exists before loading module script
    const existingImportMap = document.querySelector('script[type="importmap"][data-loader="mv-importmap"]');
    if (!existingImportMap) {
      const importMap = document.createElement('script');
      importMap.type = 'importmap';
      importMap.setAttribute('data-loader', 'mv-importmap');
      importMap.textContent = JSON.stringify({
        imports: {
          three: '/three.module.js'
        }
      });
      document.head.appendChild(importMap);
    }

    // Load module version of model-viewer (no bundled three)
    const existing = document.querySelector('script[type="module"][data-loader="model-viewer-module"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load model-viewer module')));
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/model-viewer-module.js';
    script.setAttribute('data-loader', 'model-viewer-module');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load model-viewer module')));
    document.head.appendChild(script);
  });
}

// Resolve a texture name or URI to a loadable URL. Leaves data/blob/http(s) URIs untouched.
function resolveTextureUrl(clientName: string, name?: string): string | undefined {
  if (!name) return undefined;
  const raw = String(name).trim();
  if (!raw) return undefined;
  // If already an absolute or data/blob URI, return as-is
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
  const cfg = clients[clientName];
  const base = cfg?.bunnyCdn?.publicBaseUrl?.replace(/\/$/, '') || 'https://cdn.charpstar.net';
  const imagesRoot = (cfg?.bunnyCdn?.imagesPath || '').replace(/^\/+|\/+$/g, '');
  const cleaned = raw.startsWith('images/') ? raw : (imagesRoot ? `${imagesRoot}/${raw}` : raw);
  return `${base}/${cleaned}`;
}

// Helper: expose three model access on the element
function attachThreeAccess(modelViewerEl: any) {
  if (!modelViewerEl || typeof modelViewerEl !== 'object') return;
  if (typeof modelViewerEl.getThreeModel === 'function') return;
  try {
    const sceneSymbol = Object.getOwnPropertySymbols(modelViewerEl)
      .find((s) => {
        try {
          const v: any = (modelViewerEl as any)[s as any];
          return v && (v.model || v.scene);
        } catch { return false; }
      });
    modelViewerEl.getThreeModel = () => {
      if (!sceneSymbol) return null;
      const container: any = (modelViewerEl as any)[sceneSymbol as any];
      return container?.model || container?.scene || null;
    };
    modelViewerEl.withThreeModel = (fn: (root: any) => void) => {
      const root = modelViewerEl.getThreeModel?.();
      if (root) {
        try { fn(root); } catch { }
      }
    };
  } catch { }
}

function forceModelViewerRender(modelViewerEl: any) {
  try {
    // Preferred: ask Lit element to update
    if (typeof modelViewerEl.requestUpdate === 'function') {
      modelViewerEl.requestUpdate();
    }
    // Nudge a render by toggling a numeric property minutely
    const original = Number(modelViewerEl.exposure ?? 1.0);
    const epsilon = 1e-6;
    const next = original + epsilon;
    modelViewerEl.exposure = next;
    // restore on next frame
    requestAnimationFrame(() => {
      try { modelViewerEl.exposure = original; } catch { }
    });
  } catch { }
}

export default function MaterialEditorPage() {
  const params = useParams();
  const clientName = params.client as string;

  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];

  // State management
  const [referenceGltf, setReferenceGltf] = useState<ReferenceGltf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [editedMaterial, setEditedMaterial] = useState<Material | null>(null);
  const [stagedMaterials, setStagedMaterials] = useState<Record<string, Material>>({});
  const [editedTextures, setEditedTextures] = useState<{
    baseColorTexture?: string;
    metallicRoughnessTexture?: string;
    normalTexture?: string;
    occlusionTexture?: string;
    emissiveTexture?: string;
    sheenRoughnessTexture?: string;
    sheenColorTexture?: string;
  } | null>(null);
  const [uiScalars, setUiScalars] = useState<{
    roughnessFactor: number;
    metallicFactor: number;
    occlusionStrength: number;
    normalScale: number;
    baseOpacity: number;
    sheenRoughnessFactor?: number;
  } | null>(null);
  const [uiColors, setUiColors] = useState<{ base?: string | null; sheen?: string | null }>({ base: null, sheen: null });
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [texturePicker, setTexturePicker] = useState<{ open: boolean; slot: keyof Material | null; search: string }>({ open: false, slot: null, search: '' });
  const [textureEditor, setTextureEditor] = useState<{ open: boolean; texture: string | null; slot: keyof Material | null }>({ open: false, texture: null, slot: null });
  const [textureTimestamps, setTextureTimestamps] = useState<Record<string, number>>({});
  const [cdnImages, setCdnImages] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; name: string } | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const modelViewerRef = useRef<any>(null);
  const originalAoMapRef = useRef<any | null>(null);
  const selectedMeshNamesRef = useRef<Set<string> | null>(null);
  const aoMapByMeshNameRef = useRef<Map<string, any>>(new Map());
  // Remove caching optimization to keep code minimal as requested
  const [editingModelUrl, setEditingModelUrl] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [sceneMeshNames, setSceneMeshNames] = useState<string[]>([]);
  const [meshVisibility, setMeshVisibility] = useState<Record<string, boolean>>({});
  const [isApplyingLive, setIsApplyingLive] = useState(false);
  const activeJobIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<any>(null);
  const [applyProgress, setApplyProgress] = useState<{
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
  } | null>(null);
  const [applySummary, setApplySummary] = useState<{
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
  } | null>(null);
  const lockKey = useMemo(() => `charpstar:applyLock:${clientName}`, [clientName]);
  const [globalLock, setGlobalLock] = useState<null | { active?: boolean; total?: number; done?: number; failed?: number; failedFiles?: string[]; summary?: boolean }>(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  // Backups UI state
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [backups, setBackups] = useState<Array<{ name: string; url: string; size?: number; lastModified?: string }>>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  // Stable per-tab id (persists across refresh within the same tab only)
  const tabId = useMemo(() => {
    try {
      let id = sessionStorage.getItem('charpstar:tabId');
      if (!id) {
        id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('charpstar:tabId', id);
      }
      return id;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  // Helper: apply a mutator only to target meshes using Three.js APIs
  const withTargetMeshes = useCallback(async (mutate: (mat: any, obj: any, THREE: any) => void) => {
    try {
      const mv = modelViewerRef.current as any;
      if (!mv) return;
      // @ts-expect-error: Resolved at runtime via public ESM; types shimmed in types/three-module.d.ts
      const THREE = await import(/* webpackIgnore: true */ '/three.module.js');
      attachThreeAccess(mv);
      const root = mv.getThreeModel?.();
      if (!root) return;
      const targets = selectedMeshNamesRef.current;
      if (!targets || targets.size === 0) return; // no fallback as requested
      root.traverse((obj: any) => {
        if (!obj?.isMesh) return;
        const meshName: string | undefined = obj.name;
        if (targets && (!meshName || !targets.has(meshName))) return;
        // Always clone material to avoid shared instance side-effects
        let mat: any = obj.material?.clone ? obj.material.clone() : obj.material;
        if (!mat) return;
        obj.material = mat;
        try {
          mutate(mat, obj, THREE);
          mat.needsUpdate = true;
        } catch (e) { }
      });
      mv.requestRender?.();
      forceModelViewerRender(mv);
    } catch { }
  }, [modelViewerRef]);

  // Sync cross-tab lock/progress
  useEffect(() => {
    const readLock = () => {
      try {
        const raw = localStorage.getItem(lockKey);
        const parsed = raw ? JSON.parse(raw) : null;
        // Enforce TTL: auto-clear locks older than 60 minutes or missing timestamp
        const MAX_AGE_MS = 60 * 60 * 1000;
        const now = Date.now();
        const startedAt = typeof parsed?.startedAt === 'number' ? parsed.startedAt : undefined;
        const isActive = !!parsed?.active;
        const isStale = isActive && (!startedAt || (now - startedAt > MAX_AGE_MS));
        if (isStale) {
          try { localStorage.removeItem(lockKey); } catch { }
          try { localStorage.removeItem(`charpstar:applyJob:${clientName}`); } catch { }
          setGlobalLock(null);
          setIsApplyingLive(false);
        } else {
          setGlobalLock(parsed);
        }
      } catch { setGlobalLock(null); }
    };
    readLock();
    const onStorage = (e: StorageEvent) => { if (e.key === lockKey) readLock(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lockKey]);

  // Defer these effects until after reloadMaterials is defined
  const postFinishReset = useCallback(() => {
    try {
      localStorage.removeItem(lockKey);
      localStorage.removeItem(`charpstar:applyJob:${clientName}`);
    } catch { }
    setIsApplyingLive(false);
    setApplyProgress(null);
    setApplySummary(null);
    setGlobalLock(null);
    setOverlayDismissed(false);
    try { reloadMaterials(); } catch { }
  }, [clientName, lockKey]);

  // Remove auto hard-reload on summary so user can read log; we will hard-reload only on explicit Dismiss
  useEffect(() => {
    if (globalLock?.summary) {
      // Keep summary visible; do not reset automatically
    }
  }, [globalLock?.summary]);

  // Fallback: if we were applying and the lock becomes inactive, reset UI
  useEffect(() => {
    if (isApplyingLive && globalLock && globalLock.active === false) {
      postFinishReset();
    }
  }, [isApplyingLive, globalLock?.active, postFinishReset]);

  // Hard reset only when the user explicitly clicks Dismiss in the global notification
  useEffect(() => {
    const onJobDismissed = (e: Event) => {
      try {
        const ce = e as CustomEvent;
        const detail = (ce?.detail || {}) as any;
        if (detail?.clientName && detail.clientName !== clientName) return;
      } catch { }
      postFinishReset();
      setTimeout(() => { try { window.location.reload(); } catch { } }, 100);
    };
    window.addEventListener('charpstar:jobDismissed', onJobDismissed as EventListener);
    return () => window.removeEventListener('charpstar:jobDismissed', onJobDismissed as EventListener);
  }, [clientName, postFinishReset]);

  // If this tab owned an in-progress or summary lock and page was refreshed, clear it
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lockKey);
      const lock = raw ? JSON.parse(raw) : null;
      if (lock && lock.owner === tabId && (lock.active || lock.summary)) {
        localStorage.removeItem(lockKey);
        setGlobalLock(null);
        setApplyProgress(null);
        setApplySummary(null);
        setIsApplyingLive(false);
      }
    } catch { }
    // Also clear on unload to avoid stale locks if the tab closes mid-process
    const clearOnUnload = () => {
      try {
        const raw = localStorage.getItem(lockKey);
        const lock = raw ? JSON.parse(raw) : null;
        if (lock && lock.owner === tabId) {
          localStorage.removeItem(lockKey);
        }
      } catch { }
    };
    window.addEventListener('beforeunload', clearOnUnload);
    window.addEventListener('pagehide', clearOnUnload);
    return () => {
      window.removeEventListener('beforeunload', clearOnUnload);
      window.removeEventListener('pagehide', clearOnUnload);
    };
  }, [lockKey, tabId]);

  // Global notifications now handle job tracking, so this is simplified
  useEffect(() => {
    // Just check if there's an active job to set local state
    try {
      const jobId = localStorage.getItem(`charpstar:applyJob:${clientName}`);
      if (jobId) {
        activeJobIdRef.current = jobId;
        setIsApplyingLive(true);
      }
    } catch { }
  }, [clientName]);

  // Load reference GLTF data via server (GLTF-Transform on server)
  const loadReferenceGltf = async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const forceParam = force ? '&force=1' : '';
      const response = await fetch(`/api/reference-gltf?client=${clientName}${forceParam}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load reference GLTF');
      const data = await response.json();
      setReferenceGltf(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reference GLTF');
    } finally {
      setIsLoading(false);
    }
  };


  // Initialize data and ensure model-viewer module is available
  useEffect(() => {
    ensureModelViewerModuleLoaded()
      .then(async () => {
        await loadReferenceGltf();
        // Load last selected model for preview from localStorage
        try {
          const key = `charpstar:lastSelectedModel:${clientName}`;
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { filename?: string } | null;
            const filename = parsed?.filename;
            if (filename && typeof filename === 'string') {
              // Build URL from publicBaseUrl + modelPath
              const cfg = clients[clientName];
              const base = cfg?.bunnyCdn?.publicBaseUrl?.replace(/\/$/, '') || 'https://cdn.charpstar.net';
              const modelRoot = cfg?.bunnyCdn?.modelPath?.replace(/\/$/, '') || '';
              const modelUrl = `${base}/${modelRoot}/${filename}`;
              setEditingModelUrl(modelUrl);
              setEditingModelName(filename.replace(/\.(gltf|glb)$/i, ''));
            }
          }
          // Fallback: if no stored selection, auto-pick first available model
          if (!raw) {
            try {
              const listRes = await fetch(`/api/list-models?client=${clientName}`, { cache: 'no-store' });
              const listJson = await listRes.json().catch(() => ({ models: [] }));
              const models: Array<{ filename: string; size?: number }> = Array.isArray(listJson?.models) ? listJson.models : [];
              const first = models
                .map((m) => (typeof m.filename === 'string' ? m.filename : ''))
                .find((fn) => typeof fn === 'string' && (fn.toLowerCase().endsWith('.gltf') || fn.toLowerCase().endsWith('.glb')));
              if (first) {
                const cfg = clients[clientName];
                const base = cfg?.bunnyCdn?.publicBaseUrl?.replace(/\/$/, '') || 'https://cdn.charpstar.net';
                const modelRoot = cfg?.bunnyCdn?.modelPath?.replace(/\/$/, '') || '';
                const modelUrl = `${base}/${modelRoot}/${first}`;
                setEditingModelUrl(modelUrl);
                setEditingModelName(first.replace(/\.(gltf|glb)$/i, ''));
                try { localStorage.setItem(key, JSON.stringify({ filename: first })); } catch { }
              }
            } catch { }
          }
        } catch { }
      })
      .catch((err) => setError(err.message || 'Failed to initialize viewer'));
  }, [clientName]);

  // Collect mesh names from the displayed model when it loads
  useEffect(() => {
    const mv = modelViewerRef.current as any;
    if (!mv) return;
    const collect = () => {
      try {
        attachThreeAccess(mv);
        const root = mv.getThreeModel?.();
        if (!root) return;
        const names: string[] = [];
        root.traverse((obj: any) => {
          if (obj?.isMesh) {
            const nm = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : '(unnamed)';
            names.push(nm);
          }
        });
        const unique = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
        setSceneMeshNames(unique);
        // Initialize or merge visibility map; default only one visible per numeric-suffix group
        setMeshVisibility(prev => {
          const groups: Record<string, string[]> = {};
          const groupKey = (nm: string) => {
            const m = nm.match(/^(.*)_\d+(?:mm|cm|m)?$/i);
            return m ? m[1] : nm;
          };
          unique.forEach(nm => {
            const key = groupKey(nm);
            if (!groups[key]) groups[key] = [];
            groups[key].push(nm);
          });
          const next: Record<string, boolean> = {};
          Object.entries(groups).forEach(([_, group]) => {
            const sorted = [...group].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            const defaultVisible = sorted[0];
            group.forEach(nm => {
              next[nm] = prev.hasOwnProperty(nm) ? prev[nm] : nm === defaultVisible;
            });
          });
          try {
            const rootNow = mv.getThreeModel?.();
            if (rootNow) {
              rootNow.traverse((obj: any) => {
                if (!obj?.isMesh) return;
                const nm = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : '(unnamed)';
                const visible = next[nm] !== false;
                if (obj.visible !== visible) obj.visible = visible;
              });
              try { const sc = typeof mv.getScene === 'function' ? mv.getScene() : null; if (sc) sc.isDirty = true; } catch { }
              mv.requestRender?.();
              forceModelViewerRender(mv);
            }
          } catch { }
          return next;
        });
      } catch { }
    };
    mv.addEventListener?.('load', collect);
    if (mv.loaded) collect();
    return () => { mv.removeEventListener?.('load', collect); };
  }, [editingModelUrl]);

  // Load CDN images when texture picker opens
  useEffect(() => {
    if (!texturePicker.open) return;
    (async () => {
      try {
        const res = await fetch(`/api/images?client=${clientName}&t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        const list = Array.isArray(data?.images) ? data.images : [];
        const names: string[] = list.map((img: any) => {
          const uri = img?.uri || img?.name || '';
          return typeof uri === 'string' && uri.startsWith('images/') ? uri.substring(7) : uri;
        }).filter((s: any) => typeof s === 'string' && s.length > 0);
        setCdnImages(names);
      } catch {
        setCdnImages([]);
      }
    })();
  }, [texturePicker.open, clientName]);

  // Open backups dialog: fetch list
  useEffect(() => {
    if (!backupDialogOpen) return;
    setBackupsLoading(true);
    setBackupsError(null);
    (async () => {
      try {
        const res = await fetch(`/api/reference-gltf?client=${clientName}&listBackups=1&t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.backups) ? data.backups : [];
        setBackups(list);
      } catch (e) {
        setBackupsError('Failed to load backups');
        setBackups([]);
      } finally {
        setBackupsLoading(false);
      }
    })();
  }, [backupDialogOpen, clientName]);

  const handleRestoreBackup = useCallback(async (backupName: string) => {
    if (!backupName) return;
    setReverting(true);
    try {
      // Restore the backup to active reference.gltf
      const res = await fetch('/api/revert-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientName, backup: backupName })
      });
      if (!res.ok) throw new Error('Restore failed');
      addToast('Reference restored from backup', 'success');
      setBackupDialogOpen(false);
      await loadReferenceGltf();
    } catch (e) {
      addToast('Failed to restore backup', 'error');
    } finally {
      setReverting(false);
    }
  }, [clientName]);


  // Removed old PoC auto-apply effect

  // Handle material selection
  const handleMaterialSelect = useCallback((material: Material) => {
    // Ensure all required properties exist with defaults
    const materialWithDefaults = {
      name: material.name || 'Unnamed Material',
      baseColor: material.baseColor || [0.8, 0.8, 0.8, 1.0],
      metallicFactor: material.metallicFactor ?? 0,
      roughnessFactor: material.roughnessFactor ?? 0.5,
      emissiveFactor: material.emissiveFactor || [0, 0, 0],
      normalScale: material.normalScale ?? 1,
      occlusionStrength: material.occlusionStrength ?? 1,
      baseColorTexture: material.baseColorTexture,
      baseColorTextureRotation: (material as any).baseColorTextureRotation ?? 0,
      metallicRoughnessTexture: material.metallicRoughnessTexture,
      normalTexture: material.normalTexture,
      normalTextureRotation: (material as any).normalTextureRotation ?? 0,
      occlusionTexture: material.occlusionTexture,
      emissiveTexture: material.emissiveTexture,
      // Sheen fields from reader (support full names and legacy) — do NOT default when absent
      sheenRoughnessFactor: (material as any).sheenRoughnessFactor ?? (material as any).sheenFactor,
      sheenRoughnessTexture: ((material as any).sheenRoughnessTexture ?? (material as any).sheenTexture) || undefined,
      sheenColor: Array.isArray((material as any).sheenColor) ? (material as any).sheenColor : undefined,
      sheenColorTexture: (material as any).sheenColorTexture || undefined,
      sheenColorTextureRotation: (material as any).sheenColorTextureRotation ?? 0,
      // Tiling defaults
      baseColorTextureScale: (material as any).baseColorTextureScale || [1, 1],
      metallicRoughnessTextureScale: (material as any).metallicRoughnessTextureScale || [1, 1],
      normalTextureScale: (material as any).normalTextureScale || [1, 1],
      sheenColorTextureScale: (material as any).sheenColorTextureScale || [1, 1],
      sheenRoughnessTextureScale: (material as any).sheenRoughnessTextureScale || [1, 1],
      // Sheen texCoord (UV set) passthrough
      sheenColorTextureTexCoord: (material as any).sheenColorTextureTexCoord,
      sheenRoughnessTextureTexCoord: (material as any).sheenRoughnessTextureTexCoord,
      // Variant mesh usage (for sidebar tooltip and viewer overlay)
      variantMeshes: (material as any).variantMeshes || [],
    };

    const staged = stagedMaterials[materialWithDefaults.name];
    const active = staged ? { ...materialWithDefaults, ...staged } : materialWithDefaults;

    // Update selection
    setSelectedMaterial(materialWithDefaults);
    {
      setEditedMaterial(active);
      setEditedTextures({
        baseColorTexture: active.baseColorTexture,
        metallicRoughnessTexture: active.metallicRoughnessTexture,
        normalTexture: active.normalTexture,
        occlusionTexture: active.occlusionTexture,
        emissiveTexture: active.emissiveTexture,
        sheenRoughnessTexture: active.sheenRoughnessTexture,
        sheenColorTexture: active.sheenColorTexture,
      });
      setUiScalars({
        roughnessFactor: active.roughnessFactor ?? 0,
        metallicFactor: active.metallicFactor ?? 0,
        occlusionStrength: active.occlusionStrength ?? 0,
        normalScale: active.normalScale ?? 0,
        baseOpacity: active.baseColor?.[3] ?? 1,
        sheenRoughnessFactor: (active as any).sheenRoughnessFactor ?? (active as any).sheenFactor,
      });
      // Sync UI color pickers to active material colors
      const toHex = (r?: number, g?: number, b?: number) => {
        const rr = Math.round((r ?? 1) * 255).toString(16).padStart(2, '0');
        const gg = Math.round((g ?? 1) * 255).toString(16).padStart(2, '0');
        const bb = Math.round((b ?? 1) * 255).toString(16).padStart(2, '0');
        return `#${rr}${gg}${bb}`;
      };
      setUiColors({
        base: toHex(active.baseColor?.[0], active.baseColor?.[1], active.baseColor?.[2]),
        sheen: (Array.isArray((active as any).sheenColor) ? toHex((active as any).sheenColor?.[0], (active as any).sheenColor?.[1], (active as any).sheenColor?.[2]) : null),
      });
    }

    // Apply selected material to the preview cube (pure three.js)
    (async () => {
      try {
        const mv = modelViewerRef.current as any;
        if (!mv) return;
        // @ts-expect-error: Resolved at runtime via public ESM; types shimmed in types/three-module.d.ts
        const THREE = await import(/* webpackIgnore: true */ '/three.module.js');
        attachThreeAccess(mv);
        const root = mv.getThreeModel?.();
        if (!root) return;
        let firstMesh: any = null;
        const variantNames: string[] = Array.isArray((active as any).variantMeshes) ? (active as any).variantMeshes : [];
        const meshNameSet = variantNames.length > 0 ? new Set(variantNames) : null;
        selectedMeshNamesRef.current = meshNameSet;
        if (!meshNameSet || meshNameSet.size === 0) {
          // No target meshes specified: do not mutate display materials
          return;
        }
        // Find a first mesh for fallback and capture original AO maps for target meshes
        root.traverse((obj: any) => {
          if (obj?.isMesh) {
            if (!firstMesh) firstMesh = obj;
            const meshName: string | undefined = obj.name;
            if (!meshNameSet || (meshName && meshNameSet.has(meshName))) {
              if (!aoMapByMeshNameRef.current.has(meshName || '')) {
                try { aoMapByMeshNameRef.current.set(meshName || '', obj.material?.aoMap ?? null); } catch { }
              }
            }
          }
        });
        if (!firstMesh) return;
        try { originalAoMapRef.current = firstMesh?.material?.aoMap ?? null; } catch { }
        const hasSheen = (
          (active as any).sheenRoughnessFactor != null ||
          Array.isArray((active as any).sheenColor) ||
          (active as any).sheenColorTexture ||
          (active as any).sheenRoughnessTexture ||
          (active as any).sheenTexture
        );
        let mat: any = firstMesh.material;
        const shouldBePhysical = hasSheen;
        const bc = active.baseColor || [1, 1, 1, 1];

        const loader = new THREE.TextureLoader();
        const toUrl = (name?: string) => resolveTextureUrl(clientName, name);
        const loadTex = (url?: string) => new Promise<any>((resolve) => {
          if (!url) return resolve(null);
          loader.load(
            url,
            (t: any) => {
              // Do not force wrapping here; base/normal set wrapping later explicitly.
              resolve(t);
            },
            undefined,
            () => resolve(null)
          );
        });

        const [mapTex, mrTex, normalTex, aoTex, emisTex, sheenColorTex, sheenRoughTex] = await Promise.all([
          loadTex(toUrl(active.baseColorTexture)),
          loadTex(toUrl(active.metallicRoughnessTexture)),
          loadTex(toUrl(active.normalTexture)),
          loadTex(toUrl(active.occlusionTexture)),
          loadTex(toUrl(active.emissiveTexture)),
          loadTex(toUrl((active as any).sheenColorTexture)),
          loadTex(toUrl((active as any).sheenRoughnessTexture || (active as any).sheenTexture)),
        ]);

        // Keep normal map default flip; enforce flipY=false for non-normal. Also apply to sheen maps.
        try {
          if (mapTex) mapTex.flipY = false;
          if (mrTex) mrTex.flipY = false;
          if (aoTex) aoTex.flipY = false;
          if (emisTex) emisTex.flipY = false;
          if (sheenColorTex) (sheenColorTex as any).flipY = false;
          if (sheenRoughTex) (sheenRoughTex as any).flipY = false;
        } catch { }

        const applyRotation = (tex: any, rot?: number) => {
          if (!tex || rot == null) return;
          try {
            if (tex.center?.set) tex.center.set(0.5, 0.5);
            tex.rotation = rot;
            tex.needsUpdate = true;
          } catch { }
        };
        applyRotation(mapTex, (active as any).baseColorTextureRotation ?? 0);
        applyRotation(normalTex, (active as any).normalTextureRotation ?? 0);
        applyRotation(sheenColorTex, (active as any).sheenColorTextureRotation ?? 0);

        // Ensure correct color space: base color, emissive and sheen color maps should be sRGB
        const setSRGB = (tex?: any) => {
          if (!tex) return;
          try {
            if ('colorSpace' in tex && (THREE as any).SRGBColorSpace !== undefined) {
              (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
            } else if ('encoding' in tex && (THREE as any).sRGBEncoding !== undefined) {
              (tex as any).encoding = (THREE as any).sRGBEncoding;
            }
            tex.needsUpdate = true;
          } catch { }
        };
        setSRGB(mapTex);
        setSRGB(emisTex);
        // Sheen color map is a color texture — use sRGB
        setSRGB(sheenColorTex);

        // Per-mesh application happens below

        // Apply to all target-named meshes (variantMeshes) or fallback first mesh only
        root.traverse((obj: any) => {
          if (!obj?.isMesh) return;
          const meshName: string | undefined = obj.name;
          if (meshNameSet && (!meshName || !meshNameSet.has(meshName))) return;
          // Build a material instance per mesh to avoid shared state across meshes
          let m: any = obj.material?.clone ? obj.material.clone() : obj.material;
          const shouldBePhysicalLocal = hasSheen;
          if (!m) {
            m = shouldBePhysicalLocal ? new (THREE as any).MeshPhysicalMaterial() : new (THREE as any).MeshStandardMaterial();
          } else if (shouldBePhysicalLocal && !m.isMeshPhysicalMaterial) {
            const phys = new (THREE as any).MeshPhysicalMaterial();
            if (m.color) phys.color.copy?.(m.color);
            if ('metalness' in m) phys.metalness = m.metalness;
            if ('roughness' in m) phys.roughness = m.roughness;
            phys.map = m.map ?? null;
            phys.metalnessMap = m.metalnessMap ?? null;
            phys.roughnessMap = m.roughnessMap ?? null;
            phys.normalMap = m.normalMap ?? null;
            phys.aoMap = m.aoMap ?? null;
            if (m.emissive) phys.emissive.copy?.(m.emissive);
            phys.emissiveMap = m.emissiveMap ?? null;
            phys.opacity = m.opacity ?? phys.opacity;
            phys.transparent = m.transparent ?? phys.transparent;
            if (m.normalScale) phys.normalScale?.copy?.(m.normalScale);
            m = phys;
          } else if (!shouldBePhysicalLocal && m.isMeshPhysicalMaterial) {
            // Downgrade Physical → Standard when no sheen is present
            const std = new (THREE as any).MeshStandardMaterial();
            if (m.color) std.color.copy?.(m.color);
            if ('metalness' in m) std.metalness = m.metalness;
            if ('roughness' in m) std.roughness = m.roughness;
            std.map = m.map ?? null;
            std.metalnessMap = m.metalnessMap ?? null;
            std.roughnessMap = m.roughnessMap ?? null;
            std.normalMap = m.normalMap ?? null;
            std.aoMap = m.aoMap ?? null;
            if (m.emissive) std.emissive.copy?.(m.emissive);
            std.emissiveMap = m.emissiveMap ?? null;
            std.opacity = m.opacity ?? std.opacity;
            std.transparent = m.transparent ?? std.transparent;
            if (m.normalScale) std.normalScale?.copy?.(m.normalScale);
            m = std;
          }
          obj.material = m;

          // Only apply scalar/color changes to target meshes
          const isTarget = !meshNameSet || (meshName && meshNameSet.has(meshName));
          if (isTarget && m.color?.setRGB) m.color.setRGB(bc[0], bc[1], bc[2]);
          if (isTarget && 'metalness' in m) m.metalness = active.metallicFactor ?? 0;
          if (isTarget && 'roughness' in m) m.roughness = active.roughnessFactor ?? 0.5;
          if (isTarget && m.emissive?.setRGB && Array.isArray(active.emissiveFactor)) {
            m.emissive.setRGB(
              active.emissiveFactor[0] ?? 0,
              active.emissiveFactor[1] ?? 0,
              active.emissiveFactor[2] ?? 0
            );
          }
          if (isTarget && 'opacity' in m) {
            const a = bc[3] ?? 1;
            m.opacity = a;
            m.transparent = a < 1;
            // Ensure proper blending state toggles are respected
            if (m.transparent && typeof m.depthWrite === 'boolean') m.depthWrite = a >= 1;
          }
          if (isTarget && m.normalScale?.set && typeof active.normalScale === 'number') {
            m.normalScale.set(active.normalScale, -active.normalScale);
          }
          if (isTarget && 'aoMapIntensity' in m && typeof active.occlusionStrength === 'number') {
            m.aoMapIntensity = active.occlusionStrength;
          }

          // Bind textures with repeats per mesh
          if (mapTex) {
            const s = Array.isArray((active as any).baseColorTextureScale) ? (active as any).baseColorTextureScale : [1, 1];
            mapTex.wrapS = (THREE as any).RepeatWrapping;
            mapTex.wrapT = (THREE as any).RepeatWrapping;
            if (mapTex.repeat?.set) mapTex.repeat.set(s[0] ?? 1, s[1] ?? 1);

          }
          if (isTarget) {
            m.map = mapTex || null;
            m.metalnessMap = mrTex || null;
            m.roughnessMap = mrTex || null;
            if (mrTex) {
              const sMR = Array.isArray((active as any).metallicRoughnessTextureScale)
                ? (active as any).metallicRoughnessTextureScale
                : [1, 1];
              mrTex.wrapS = (THREE as any).RepeatWrapping;
              mrTex.wrapT = (THREE as any).RepeatWrapping;
              if (mrTex.repeat?.set) mrTex.repeat.set(sMR[0] ?? 1, sMR[1] ?? 1);
            }
          }
          if (normalTex) {
            const sN = Array.isArray((active as any).normalTextureScale) ? (active as any).normalTextureScale : [1, 1];
            normalTex.wrapS = (THREE as any).RepeatWrapping;
            normalTex.wrapT = (THREE as any).RepeatWrapping;
            if (normalTex.repeat?.set) normalTex.repeat.set(sN[0] ?? 1, sN[1] ?? 1);

          }
          if (isTarget) {
            m.normalMap = normalTex || null;
            const originalAo = aoMapByMeshNameRef.current.get(meshName || '') ?? originalAoMapRef.current;
            m.aoMap = (originalAo ?? aoTex) || null;
            m.emissiveMap = emisTex || null;
          }
          if (m.isMeshPhysicalMaterial && hasSheen) {
            if ('sheen' in m) m.sheen = 1;
            if ((active as any).sheenRoughnessFactor != null && 'sheenRoughness' in m) {
              m.sheenRoughness = (active as any).sheenRoughnessFactor;
            }
            if (Array.isArray((active as any).sheenColor) && m.sheenColor?.setRGB) {
              const sc = (active as any).sheenColor as [number, number, number];
              if (isTarget) m.sheenColor.setRGB(sc[0] ?? 0, sc[1] ?? 0, sc[2] ?? 0);
            }
            // Assign sheen maps. Respect KHR_texture_transform tiling if present in reference data.
            if (isTarget && 'sheenColorMap' in m) {
              (m as any).sheenColorMap = sheenColorTex || null;
              const s = Array.isArray((active as any).sheenColorTextureScale) ? (active as any).sheenColorTextureScale : undefined;
              if (sheenColorTex && Array.isArray(s)) {
                sheenColorTex.wrapS = (THREE as any).RepeatWrapping;
                sheenColorTex.wrapT = (THREE as any).RepeatWrapping;
                if (sheenColorTex.repeat?.set) sheenColorTex.repeat.set(s[0] ?? 1, s[1] ?? 1);
              }
              // Apply UV channel (texCoord) if provided
              try {
                const tc = (active as any).sheenColorTextureTexCoord;
                // model-viewer/three use channel=1 for UV1, channel=0 for UV0; texCoord maps 0->0,1->1 etc.
                if (typeof tc === 'number') {
                  if ((m as any).sheenColorMap) (m as any).sheenColorMap.channel = tc;
                  if (typeof (m as any).sheenColorMap?.setUvChannel === 'function') (m as any).sheenColorMap.setUvChannel(tc);
                }
              } catch { }
            }
            if (isTarget && 'sheenRoughnessMap' in m) {
              (m as any).sheenRoughnessMap = sheenRoughTex || null;
              const s = Array.isArray((active as any).sheenRoughnessTextureScale) ? (active as any).sheenRoughnessTextureScale : undefined;
              if (sheenRoughTex && Array.isArray(s)) {
                sheenRoughTex.wrapS = (THREE as any).RepeatWrapping;
                sheenRoughTex.wrapT = (THREE as any).RepeatWrapping;
                if (sheenRoughTex.repeat?.set) sheenRoughTex.repeat.set(s[0] ?? 1, s[1] ?? 1);
              }
              // Apply UV channel (texCoord) if provided
              try {
                const tc = (active as any).sheenRoughnessTextureTexCoord;
                if (typeof tc === 'number') {
                  if ((m as any).sheenRoughnessMap) (m as any).sheenRoughnessMap.channel = tc;
                  if (typeof (m as any).sheenRoughnessMap?.setUvChannel === 'function') (m as any).sheenRoughnessMap.setUvChannel(tc);
                }
              } catch { }
            }
          }

          m.needsUpdate = true;
        });
        mv.requestRender?.();
        forceModelViewerRender(mv);
      } catch { }
    })();
  }, [stagedMaterials]);

  // Reload materials from server and reset staged edits
  const reloadMaterials = useCallback(async () => {
    await loadReferenceGltf(true);
    // Clear staged edits and clear any selection per request
    setStagedMaterials({});
    setEditedTextures(null);
    setUiScalars(null);
    setUiColors({ base: null, sheen: null });
    setSelectedMaterial(null);
    setEditedMaterial(null);
  }, [clientName, selectedMaterial, handleMaterialSelect]);


  // Handle material property changes
  const handleMaterialChange = useCallback((property: string, value: any) => {
    setEditedMaterial(prev => {
      if (!prev) return prev;
      // If the change is to a numeric factor and not to a texture field, avoid creating a new object
      const isTextureField = property === 'baseColorTexture' || property === 'metallicRoughnessTexture' || property === 'normalTexture' || property === 'occlusionTexture' || property === 'emissiveTexture' || property === 'sheenRoughnessTexture' || property === 'sheenColorTexture';
      if (!isTextureField) {
        // Mutate in place to preserve object identity for non-texture changes
        (prev as any)[property] = value;
        return { ...prev }; // shallow spread to update dependents without changing nested texture refs
      }

      // Update textures in separate state to decouple from slider-driven re-renders
      setEditedTextures((texPrev) => {
        const next = { ...(texPrev || {}), [property]: value ?? undefined } as any;
        // Reflect deletions (null) as undefined for UI rendering
        return next;
      });
      // Reset tiling to 1,1 when a new base or normal texture is added
      const resetBase = property === 'baseColorTexture' && typeof value === 'string';
      const resetNormal = property === 'normalTexture' && typeof value === 'string';
      const resetRotationProp =
        property === 'baseColorTexture' ? 'baseColorTextureRotation'
          : property === 'normalTexture' ? 'normalTextureRotation'
            : property === 'sheenColorTexture' ? 'sheenColorTextureRotation'
              : null;
      const updated = {
        ...prev,
        [property]: value,
        ...(resetBase ? { baseColorTextureScale: [1, 1] as any } : {}),
        ...(resetNormal ? { normalTextureScale: [1, 1] as any } : {}),
        ...(resetRotationProp ? { [resetRotationProp]: 0 } : {}),
      };
      // Persist texture edits into staged materials so Save includes them
      const name = prev.name;
      if (name) {
        setStagedMaterials((prevStaged) => ({
          ...prevStaged,
          [name]: {
            ...(prevStaged[name] ?? prev),
            [property]: value,
            ...(resetBase ? { baseColorTextureScale: [1, 1] as any } : {}),
            ...(resetNormal ? { normalTextureScale: [1, 1] as any } : {}),
            ...(resetRotationProp ? { [resetRotationProp]: 0 } : {}),
          } as any,
        }));
      }
      // Apply to viewer immediately when texture is removed or added
      if (value == null) {
        try {
          withTargetMeshes((mat) => {
            switch (property) {
              case 'baseColorTexture': mat.map = null; break;
              case 'metallicRoughnessTexture': mat.metalnessMap = null; mat.roughnessMap = null; break;
              case 'normalTexture': mat.normalMap = null; break;
              case 'occlusionTexture': mat.aoMap = null; break;
              case 'emissiveTexture': mat.emissiveMap = null; break;
              case 'sheenRoughnessTexture': if ('sheenRoughnessMap' in mat) (mat as any).sheenRoughnessMap = null; break;
              case 'sheenColorTexture': if ('sheenColorMap' in mat) (mat as any).sheenColorMap = null; break;
            }
          });
        } catch { }
      } else if (typeof value === 'string') {
        (async () => {
          try {
            const mv = modelViewerRef.current as any;
            if (!mv) return;
            // @ts-expect-error: Resolved at runtime via public ESM; types shimmed in types/three-module.d.ts
            const THREE = await import(/* webpackIgnore: true */ '/three.module.js');
            const loader = new THREE.TextureLoader();
            const toUrl = (name?: string) => resolveTextureUrl(clientName, name);
            const url = toUrl(value);
            if (!url) return;
            const tex = await new Promise<any>((resolve) => {
              loader.load(
                url,
                (t: any) => {
                  t.wrapS = THREE.RepeatWrapping;
                  t.wrapT = THREE.RepeatWrapping;
                  resolve(t);
                },
                undefined,
                () => resolve(null)
              );
            });
            if (!tex) return;
            // For dynamically added textures, enforce flipY=false for color/AO/emissive only (not sheen)
            try {
              switch (property) {
                case 'baseColorTexture':
                case 'metallicRoughnessTexture':
                case 'occlusionTexture':
                case 'emissiveTexture':
                  (tex as any).flipY = false;
                  break;
                case 'normalTexture':
                case 'sheenRoughnessTexture':
                case 'sheenColorTexture':
                default:
                  // leave default for normal map
                  break;
              }
            } catch { }
            const rot = (() => {
              switch (property) {
                case 'baseColorTexture': return (editedMaterial as any)?.baseColorTextureRotation ?? 0;
                case 'normalTexture': return (editedMaterial as any)?.normalTextureRotation ?? 0;
                case 'sheenColorTexture': return (editedMaterial as any)?.sheenColorTextureRotation ?? 0;
                default: return 0;
              }
            })();
            try {
              if (tex.center?.set) tex.center.set(0.5, 0.5);
              tex.rotation = rot;
            } catch { }
            const baseScale = [1, 1] as [number, number];
            const normalScaleVals = [1, 1] as [number, number];
            withTargetMeshes((mat, obj, THREEctx) => {
              // Ensure physical material if setting sheen maps
              const needsPhysical = property === 'sheenRoughnessTexture' || property === 'sheenColorTexture';
              if (needsPhysical && !mat.isMeshPhysicalMaterial) {
                const phys = new (THREEctx as any).MeshPhysicalMaterial();
                if (mat.color) phys.color.copy?.(mat.color);
                if ('metalness' in mat) phys.metalness = mat.metalness;
                if ('roughness' in mat) phys.roughness = mat.roughness;
                phys.map = mat.map ?? null;
                phys.metalnessMap = mat.metalnessMap ?? null;
                phys.roughnessMap = mat.roughnessMap ?? null;
                phys.normalMap = mat.normalMap ?? null;
                phys.aoMap = mat.aoMap ?? null;
                if (mat.emissive) phys.emissive.copy?.(mat.emissive);
                phys.emissiveMap = mat.emissiveMap ?? null;
                phys.opacity = mat.opacity ?? phys.opacity;
                phys.transparent = mat.transparent ?? phys.transparent;
                if (mat.normalScale) phys.normalScale?.copy?.(mat.normalScale);
                obj.material = phys;
                mat = phys;
              }
              switch (property) {
                case 'baseColorTexture': {
                  // sRGB for base color maps and reset tiling to 1,1
                  try {
                    if ('colorSpace' in tex && (THREEctx as any).SRGBColorSpace !== undefined) (tex as any).colorSpace = (THREEctx as any).SRGBColorSpace;
                    else if ('encoding' in tex && (THREEctx as any).sRGBEncoding !== undefined) (tex as any).encoding = (THREEctx as any).sRGBEncoding;
                    tex.needsUpdate = true;
                  } catch { }
                  tex.wrapS = THREEctx.RepeatWrapping; tex.wrapT = THREEctx.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(baseScale[0] ?? 1, baseScale[1] ?? 1);
                  mat.map = tex; break;
                }
                case 'metallicRoughnessTexture': mat.metalnessMap = tex; mat.roughnessMap = tex; break;
                case 'normalTexture': {
                  // Reset normal tiling to 1,1 on new texture
                  tex.wrapS = THREEctx.RepeatWrapping; tex.wrapT = THREEctx.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(normalScaleVals[0] ?? 1, normalScaleVals[1] ?? 1);
                  mat.normalMap = tex; break;
                }
                case 'occlusionTexture': mat.aoMap = tex; break;
                case 'emissiveTexture': {
                  // sRGB for emissive color map
                  try {
                    if ('colorSpace' in tex && (THREEctx as any).SRGBColorSpace !== undefined) (tex as any).colorSpace = (THREEctx as any).SRGBColorSpace;
                    else if ('encoding' in tex && (THREEctx as any).sRGBEncoding !== undefined) (tex as any).encoding = (THREEctx as any).sRGBEncoding;
                    tex.needsUpdate = true;
                  } catch { }
                  mat.emissiveMap = tex; break;
                }
                case 'sheenRoughnessTexture': if ('sheenRoughnessMap' in mat) (mat as any).sheenRoughnessMap = tex; break;
                case 'sheenColorTexture': {
                  if ('sheenColorMap' in mat) (mat as any).sheenColorMap = tex; break;
                }
              }
            });
          } catch { }
        })();
      }
      return updated;
    });
  }, []);

  // Handle texture rotation (radians) for base color / normal / sheen color maps
  const handleTextureRotationChange = useCallback((slot: 'baseColorTexture' | 'normalTexture' | 'sheenColorTexture', radians: number) => {
    const rad = isFinite(radians) ? radians : 0;
    const prop =
      slot === 'baseColorTexture' ? 'baseColorTextureRotation'
        : slot === 'normalTexture' ? 'normalTextureRotation'
          : 'sheenColorTextureRotation';
    setEditedMaterial(prev => {
      if (!prev) return prev;
      return { ...prev, [prop]: rad } as any;
    });
    const name = editedMaterial?.name;
    if (name) {
      setStagedMaterials(prev => {
        const base = prev[name] ?? editedMaterial!;
        return {
          ...prev,
          [name]: { ...(base as any), [prop]: rad } as any,
        };
      });
    }
    try {
      withTargetMeshes((mat) => {
        const tex =
          slot === 'baseColorTexture' ? mat?.map
            : slot === 'normalTexture' ? mat?.normalMap
              : (mat as any)?.sheenColorMap;
        if (tex) {
          if (tex.center?.set) tex.center.set(0.5, 0.5);
          tex.rotation = rad;
          tex.needsUpdate = true;
        }
      });
    } catch { }
  }, [editedMaterial, withTargetMeshes]);

  // Removed slider control logic – we will rebuild cleanly

  // Save ALL materials (staged) – single upload
  const saveAllMaterials = async () => {
    if (!referenceGltf) return;
    setIsSaving(true);
    try {
      // Merge staged edits over reference materials by name
      const outgoing = referenceGltf.materials.map((m) => stagedMaterials[m.name] ?? m);
      const res = await fetch('/api/save-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientName, materials: outgoing })
      });
      if (!res.ok) throw new Error('Save failed');
      addToast('Materials saved', 'success');
      // Update local reference state in-place without reloading the page or clearing selection
      setReferenceGltf((prev) => {
        if (!prev) return prev;
        const byName = new Map(outgoing.map((m) => [m.name, m] as const));
        const nextMaterials = prev.materials.map((m) => byName.get(m.name) ?? m);
        return { ...prev, materials: nextMaterials };
      });
      // Clear staged edits since they are now persisted, keep current selection and editedMaterial as-is
      setStagedMaterials({});

      // (debug download removed)
    } catch (e) {
      addToast('Failed to save materials', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add new material by name (invoked from modal)
  const addNewMaterialByName = (
    name: string,
    assignMeshNames?: string[] | string,
    assignAsVariant: boolean = true,
    createMeshes: boolean = false
  ) => {
    const trimmed = name.trim();
    if (!trimmed || !referenceGltf) return;
    const newMaterial: Material = {
      name: trimmed,
      baseColor: [0.8, 0.8, 0.8, 1.0],
      metallicFactor: 0.0,
      roughnessFactor: 0.5,
      emissiveFactor: [0, 0, 0],
      normalScale: 1.0,
      occlusionStrength: 1.0,
    };
    // If meshes were chosen, annotate with variantMeshes only if assignAsVariant is true
    const meshList: string[] | undefined = Array.isArray(assignMeshNames)
      ? assignMeshNames.filter(Boolean)
      : (typeof assignMeshNames === 'string' && assignMeshNames ? [assignMeshNames] : undefined);

    // Only add variantMeshes if assignAsVariant is true
    const annotated: any = { ...newMaterial };
    if (meshList && meshList.length > 0) {
      if (assignAsVariant) {
        annotated.variantMeshes = meshList;
      }
      if (createMeshes) {
        (annotated as any).pendingMeshes = meshList;
      }
    }

    setReferenceGltf(prev => prev ? { ...prev, materials: [...prev.materials, annotated] } : prev);
    setIsAddingMaterial(false);
    handleMaterialSelect(annotated);

    // Stage the material for save (always needed to create the mesh object)
    if (meshList && meshList.length > 0) {
      setStagedMaterials(prev => ({ ...prev, [annotated.name]: annotated } as any));
    }
  };

  // Lightweight local modal for adding material (isolates input re-renders)
  const AddMaterialModal = React.memo(({
    open,
    onOpenChange,
    onSubmit
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onSubmit: (name: string, meshNames?: string[] | string, assignAsVariant?: boolean, createMeshes?: boolean) => void;
  }) => {
    const [name, setName] = useState('');
    const [selectedMeshes, setSelectedMeshes] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState('');
    const [meshInputMode, setMeshInputMode] = useState<'existing' | 'new'>('existing');
    const [newMeshName, setNewMeshName] = useState('');
    const [assignAsVariant, setAssignAsVariant] = useState(true);

    useEffect(() => {
      if (open) {
        setName('');
        setSelectedMeshes(new Set());
        setFilter('');
        setMeshInputMode('existing');
        setNewMeshName('');
        setAssignAsVariant(true);
      }
    }, [open]);

    const meshOptions: string[] = Array.isArray((referenceGltf as any)?.meshes)
      ? ((referenceGltf as any).meshes as string[])
      : sceneMeshNames;
    const filteredOptions = meshOptions.filter(m => m && m.toLowerCase().includes(filter.toLowerCase()));

    const handleSubmit = () => {
      const isNewMeshMode = meshInputMode === 'new';
      const meshNamesToSubmit = isNewMeshMode
        ? (newMeshName.trim() ? [newMeshName.trim()] : undefined)
        : (selectedMeshes.size > 0 ? Array.from(selectedMeshes) : undefined);
      onSubmit(name, meshNamesToSubmit, assignAsVariant, isNewMeshMode);
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex items-center">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Material</DialogTitle>
            <DialogDescription>
              Create a new material. Optionally assign it as a variant for meshes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Material name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mt-3">
              <label className="block text-xs text-gray-600 mb-2">Assign as Variant to Meshes (optional)</label>

              {/* Mode Toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setMeshInputMode('existing')}
                  className={`flex-1 px-3 py-2 text-xs rounded border transition-colors ${meshInputMode === 'existing'
                    ? 'bg-blue-50 border-blue-500 text-blue-900'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Select Existing
                </button>
                <button
                  type="button"
                  onClick={() => setMeshInputMode('new')}
                  className={`flex-1 px-3 py-2 text-xs rounded border transition-colors ${meshInputMode === 'new'
                    ? 'bg-blue-50 border-blue-500 text-blue-900'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Create New Mesh
                </button>
              </div>

              {/* Conditional UI based on mode */}
              {meshInputMode === 'existing' ? (
                <>
                  <Input
                    placeholder="Filter meshes..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="mb-2"
                  />
                  <div className="max-h-40 overflow-auto border rounded p-2 bg-white">
                    {filteredOptions.length === 0 ? (
                      <div className="text-xs text-gray-500">No meshes</div>
                    ) : (
                      filteredOptions.map((m) => (
                        <label key={m} className="flex items-center text-xs space-x-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedMeshes.has(m)}
                            onChange={(e) => {
                              setSelectedMeshes((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(m); else next.delete(m);
                                return next;
                              });
                            }}
                          />
                          <span className="truncate">{m}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedMeshes.size > 0 && (
                    <div className="text-[11px] text-gray-500 mt-1">{selectedMeshes.size} mesh{selectedMeshes.size !== 1 ? 'es' : ''} selected</div>
                  )}
                </>
              ) : (
                <>
                  <Input
                    placeholder="New mesh name (e.g., ChairArm_500mm)"
                    value={newMeshName}
                    onChange={(e) => setNewMeshName(e.target.value)}
                  />
                  <div className="mt-3">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignAsVariant}
                        onChange={(e) => setAssignAsVariant(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">Assign as material variant</span>
                    </label>
                    <div className="text-[11px] text-gray-500 mt-1">
                      {assignAsVariant
                        ? 'Material will be assigned as a variant. Uncheck to assign as the default material only.'
                        : 'Material will be assigned as the default material without creating a variant.'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim()}>
              Add Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });


  // Delete material
  const deleteMaterial = (materialName: string) => {
    if (!referenceGltf) return;
    const updatedMaterials = referenceGltf.materials.filter(mat => mat.name !== materialName);
    setReferenceGltf({ ...referenceGltf, materials: updatedMaterials });
    // Remove any staged edits for this material
    setStagedMaterials(prev => {
      const next = { ...prev } as Record<string, Material>;
      delete next[materialName];
      return next;
    });
    if (selectedMaterial?.name === materialName) {
      // If there are materials left, select the first one; otherwise clear selection
      const nextMat = updatedMaterials[0];
      if (nextMat) {
        handleMaterialSelect(nextMat as Material);
      } else {
        setSelectedMaterial(null);
        setEditedMaterial(null);
        setEditedTextures(null);
        setUiScalars(null);
        setUiColors({ base: null, sheen: null });
      }
    }
  };

  // Simple filtered materials
  const filteredMaterials = referenceGltf?.materials.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // MapSlot component (simple image cell)
  const MapSlot = ({ texture, onPick, onRemove, slot, alt }: { texture?: string; onPick: () => void; onRemove: () => void; slot?: keyof Material; alt: string }) => {
    const [showPreview, setShowPreview] = React.useState(false);
    const [previewPos, setPreviewPos] = React.useState({ x: 0, y: 0 });
    const thumbRef = React.useRef<HTMLDivElement>(null);
    const timestamp = texture ? textureTimestamps[texture] : undefined;
    const baseUrl = texture ? resolveTextureUrl(clientName, texture) : null;
    const src = baseUrl ? (timestamp ? `${baseUrl}?t=${timestamp}` : baseUrl) : null;
      
    const handleMouseEnter = () => {
      if (!src) return;
      if (thumbRef.current) {
        const rect = thumbRef.current.getBoundingClientRect();
        setPreviewPos({ x: rect.left, y: rect.top + rect.height / 2 });
      }
      setShowPreview(true);
    };
    
    return (
      <div className="flex items-center gap-2">
        <div 
          ref={thumbRef}
          className="relative w-6 h-6 rounded overflow-hidden border border-gray-300 bg-white flex-shrink-0"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setShowPreview(false)}
        >
          {src ? (
            <div
              aria-label={alt}
              className="w-full h-full cursor-pointer"
              onClick={onPick}
              style={{
                backgroundImage: `url(${src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                willChange: 'transform',
                contain: 'paint',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={onPick}
              className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600"
              aria-label={`Pick ${alt}`}
              title="Add"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          )}
          {showPreview && (
            <div 
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: `${previewPos.x - 208}px`,
                top: `${previewPos.y}px`,
                transform: 'translateY(-50%)',
              }}
            >
              <div className="bg-white rounded-lg shadow-2xl border-2 border-gray-300 overflow-hidden">
                <div className="bg-gray-100 px-2 py-1 border-b border-gray-300">
                  <p className="text-xs font-medium text-gray-900 truncate max-w-[180px]" title={texture}>
                    {texture}
                  </p>
                </div>
                <div 
                  className="w-48 h-48"
                  style={{
                    backgroundImage: `url(${src})`,
                    backgroundSize: '200%',
                    backgroundPosition: 'center',
                    imageRendering: 'pixelated',
                  }}
                />
              </div>
            </div>
          )}
        </div>
        {src && slot && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTextureEditor({ open: true, texture: texture || null, slot: slot || null })}
              className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Edit texture"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Remove texture"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Debug logging removed for cleanliness

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        onRefreshModels={() => { reloadMaterials(); }}
        onUploadModels={() => { }}
        onSave={saveAllMaterials}
        isSaving={isSaving}
        title={editingModelName || undefined}
        titlePrefix="Displaying"
        onOpenBackups={() => setBackupDialogOpen(true)}
        onStopApply={() => {
          (async () => {
            try {
              // Try to cancel on the server first
              const jobId = (() => { try { return localStorage.getItem(`charpstar:applyJob:${clientName}`); } catch { return null; } })();
              if (jobId) {
                const res = await fetch('/api/apply/cancel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jobId })
                });
                // Optional: read logUrl for future use
                await res.json().catch(() => ({} as any));
              }
              addToast('Apply cancelled', 'success');
            } catch {
              addToast('Failed to cancel on server; clearing local state', 'error');
            } finally {
              // Always clear local state so UI unsticks
              try { localStorage.removeItem(lockKey); } catch { }
              try { localStorage.removeItem(`charpstar:applyJob:${clientName}`); } catch { }
              setIsApplyingLive(false);
              setApplyProgress(null);
              setApplySummary(null);
              setGlobalLock(null);
              try { window.dispatchEvent(new CustomEvent('charpstar:jobSummary', { detail: { clientName, status: 'cancelled' } })); } catch { }
            }
          })();
        }}
        onApplyToLiveModels={async () => {
          try {
            // Prevent re-entry if another tab is already applying
            try {
              const raw = localStorage.getItem(lockKey);
              const lock = raw ? JSON.parse(raw) : null;
              if (lock?.active) {
                addToast('Another apply is already in progress', 'error');
                return;
              }
            } catch { }
            setIsApplyingLive(true);
            setApplyProgress(null);
            // 1) Save All to reference first
            await saveAllMaterials();
            // Simple guard: give CDN a moment to propagate the updated reference before starting the apply job
            await new Promise((r) => setTimeout(r, 1500));
            // 2) Discover targets on the app server to ensure worker gets a concrete list
            const listRes = await fetch(`/api/list-models?client=${clientName}`, { cache: 'no-store' });
            const listJson = await listRes.json().catch(() => ({ models: [] }));
            const models: Array<{ filename: string; size?: number }> = Array.isArray(listJson?.models) ? listJson.models : [];
            const targets = models
              .map((m) => (typeof m.filename === 'string' ? m.filename : ''))
              .filter((fn) => typeof fn === 'string' && fn.toLowerCase().endsWith('.gltf'));

            if (targets.length === 0) {
              throw new Error('No .gltf models found in client root');
            }

            // 3) Start background job via server proxy with explicit targets to avoid worker listing issues
            const startRes = await fetch('/api/apply/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client: clientName, targets })
            });
            if (!startRes.ok) {
              const t = await startRes.text();
              throw new Error(`Failed to start apply job: ${startRes.status} ${t}`);
            }
            const startJson = await startRes.json().catch(() => ({} as any));
            const jobId: string | undefined = startJson?.jobId;
            const total: number = typeof startJson?.total === 'number' ? startJson.total : targets.length;
            if (!jobId) throw new Error('Apply job did not return jobId');

            // Persist a lightweight lock and job id for cross-tab/refresh awareness
            try {
              localStorage.setItem(lockKey, JSON.stringify({ owner: tabId, active: true, total, done: 0, failed: 0, failedFiles: [], jobId, startedAt: Date.now() }));
              localStorage.setItem(`charpstar:applyJob:${clientName}`, jobId);

              // Dispatch custom event for same-tab communication
              window.dispatchEvent(new CustomEvent('charpstar:jobStarted', {
                detail: { clientName, jobId }
              }));
            } catch { }

            activeJobIdRef.current = jobId;
            // Initialize UI progress
            setApplyProgress({ total, done: 0, failed: 0, processedFiles: [] });

            // Since we now have global notifications, we can remove local polling
            // The global notification system will handle all job tracking
            console.log('Job started, global notifications will handle tracking');
          } catch (e) {
            addToast(e instanceof Error ? e.message : 'Apply failed', 'error');
          } finally {
            // keep isApplyingLive true until job completes via polling
          }
        }}
        isApplyingToLiveModels={isApplyingLive || !!globalLock?.active}
      />
      {/* Backups dialog */}
      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reference Backups</DialogTitle>
            <DialogDescription>Restore a previous version of reference.gltf. This will overwrite the active reference.</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto border rounded-md">
            {backupsLoading ? (
              <div className="p-4 text-sm text-gray-600">Loading backups…</div>
            ) : backupsError ? (
              <div className="p-4 text-sm text-red-600">{backupsError}</div>
            ) : backups.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No backups found.</div>
            ) : (
              <ul className="divide-y">
                {backups.map((b) => (
                  <li key={b.name} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{b.name}</div>
                      <div className="text-xs text-gray-500">{new Date(b.lastModified || Date.now()).toLocaleString()} • {Math.round((b.size || 0) / 1024)} KB</div>
                    </div>
                    <Button size="sm" variant="outline" disabled={reverting} onClick={() => handleRestoreBackup(b.name)}>
                      {reverting ? 'Restoring…' : 'Restore'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? (
        <div className="flex h-[calc(100vh-56px)] items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 mb-4">Error: {error}</div>
            <Button onClick={() => loadReferenceGltf(true)} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex h-[calc(100vh-56px)]">
          {/* Left Sidebar Skeleton */}
          <div className="w-80 bg-white border-r border-gray-200 p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-28 bg-gray-200 rounded"></div>
              <div className="h-8 w-full bg-gray-200 rounded"></div>
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded"></div>
                ))}
              </div>
            </div>
          </div>

          {/* Center Viewer Skeleton */}
          <div className="flex-1 p-4 bg-white">
            <div className="h-full rounded-lg bg-gray-100 animate-pulse" />
          </div>

          {/* Right Panel Skeleton */}
          <div className="w-80 border-l border-gray-200 bg-white p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-32 bg-gray-200 rounded"></div>
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-6 bg-gray-100 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-56px)]">

          {/* Left Sidebar - Material List */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col min-h-0">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Palette className="w-5 h-5 mr-2" />
                  Materials
                </h2>
                <AddMaterialModal open={isAddingMaterial} onOpenChange={setIsAddingMaterial} onSubmit={addNewMaterialByName} />
              </div>

              <Input
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-3"
              />

              <p className="text-sm text-gray-600">
                {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {filteredMaterials.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No materials found</p>
                </div>
              ) : (
                filteredMaterials.map((material) => (
                  <Card
                    key={material.name}
                    className={`group cursor-pointer transition-colors ${selectedMaterial?.name === material.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                      }`}
                    onClick={() => handleMaterialSelect(material)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-gray-900">{material.name}</h4>
                          <div className="flex items-start space-x-2 mt-1">
                            <div
                              className="w-4 h-4 rounded border border-gray-300 mt-0.5"
                              style={{
                                backgroundColor: `rgb(${Math.round(material.baseColor[0] * 255)}, ${Math.round(material.baseColor[1] * 255)}, ${Math.round(material.baseColor[2] * 255)})`
                              }}
                            />
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray((material as any).variantMeshes) && (material as any).variantMeshes.length > 0 ? (
                                <>
                                  {(material as any).variantMeshes.slice(0, 4).map((meshName: string) => (
                                    <span key={meshName} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                                      {meshName}
                                    </span>
                                  ))}
                                  {(material as any).variantMeshes.length > 4 && (
                                    <span className="text-xs text-gray-500">+{(material as any).variantMeshes.length - 4} more</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-gray-500">No variants</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialog({ open: true, name: material.name });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Center - Simple Cube Preview via model-viewer (module build) */}
          <div className="flex-1 p-4 bg-white flex flex-col">
            <div className="h-full rounded-lg overflow-hidden shadow-md bg-[#F8F9FA] flex items-center justify-center relative">
              {/* @ts-ignore - model-viewer custom element */}
              <model-viewer
                ref={modelViewerRef}
                src={editingModelUrl || '/Cube1.glb'}
                alt="Material preview cube"
                style={{ width: '100%', height: '100%' }}
                camera-controls
                disable-pan
                interaction-prompt="none"
                shadow-intensity="0.6"
                shadow-softness="0.9"
                environment-image={clients[clientName]?.hdrPath || ""}
                exposure={String(clients[clientName]?.exposure ?? 1.0)}
                tone-mapping={(clients[clientName]?.toneMapping || 'neutral') as any}
              />
              {(selectedMaterial || editedMaterial) && (
                <div className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg p-3 shadow-sm">
                  <h4 className="font-medium text-gray-900 mb-1">
                    {(editedMaterial || selectedMaterial)?.name}
                  </h4>
                  <div className="text-[11px] text-gray-700">
                    <div className="font-medium mb-1">Material present on meshes</div>
                    {Array.isArray((editedMaterial as any)?.variantMeshes) && (editedMaterial as any).variantMeshes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[320px]">
                        {(editedMaterial as any).variantMeshes.map((meshName: string) => (
                          <span key={meshName} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                            {meshName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-600">No variant mappings for this material</div>
                    )}
                  </div>
                </div>
              )}

              {/* Scene mesh visibility overlay */}
              {sceneMeshNames.length > 0 && (
                <div className="absolute bottom-4 right-4 bg-white rounded-lg border border-gray-200 shadow-lg w-80 max-h-56 overflow-auto">
                  <div className="px-3 pt-2 pb-2 border-b border-gray-100 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Scene Meshes</div>
                    <div className="text-xs text-gray-500">{sceneMeshNames.length}</div>
                  </div>
                  <div className="px-3 py-2 text-xs text-gray-800 space-y-1">
                    {sceneMeshNames.map((nm) => (
                      <label key={nm} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          checked={meshVisibility[nm] !== false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMeshVisibility(prev => {
                              const next = { ...prev, [nm]: checked } as Record<string, boolean>;
                              try {
                                const mv = modelViewerRef.current as any;
                                if (mv) {
                                  attachThreeAccess(mv);
                                  const root = mv.getThreeModel?.();
                                  if (root) {
                                    root.traverse((obj: any) => {
                                      if (!obj?.isMesh) return;
                                      const name = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : '(unnamed)';
                                      const visible = next[name] !== false;
                                      if (obj.visible !== visible) obj.visible = visible;
                                    });
                                    try { const sc = typeof mv.getScene === 'function' ? mv.getScene() : null; if (sc) sc.isDirty = true; } catch { }
                                    mv.requestRender?.();
                                    forceModelViewerRender(mv);
                                  }
                                }
                              } catch { }
                              return next;
                            });
                          }}
                        />
                        <span className="truncate" title={nm}>{nm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Material Properties */}
          <div id="material-sidebar" className="w-80 border-l border-gray-200 bg-white flex flex-col">
            {selectedMaterial ? (
              <>
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{selectedMaterial.name}</h3>
                    {/* Save All moved to header */}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Material Properties</p>
                </div>

                {editedMaterial && (
                  <div className="flex-1 overflow-y-scroll px-4 py-6 space-y-4 scrollbar-hide"
                    style={{
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none'
                    }}>

                    <div className="rounded-md bg-neutral-50 p-3 space-y-2 shadow-inner">
                      {/* Group: Base Color */}
                      <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                        {/* Base Color */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Base Color</span>
                            <DebouncedColorPicker
                              value={uiColors.base || `#${Math.round(editedMaterial.baseColor[0] * 255).toString(16).padStart(2, '0')}${Math.round(editedMaterial.baseColor[1] * 255).toString(16).padStart(2, '0')}${Math.round(editedMaterial.baseColor[2] * 255).toString(16).padStart(2, '0')}`}
                              onChange={(hex) => {
                                if (!hex || typeof hex !== 'string' || hex.length < 7) return;
                                setUiColors((c) => ({ ...c, base: hex }));
                                const mv = modelViewerRef.current as any;
                                if (!mv) return;
                                const r = parseInt(hex.slice(1, 3), 16) / 255;
                                const g = parseInt(hex.slice(3, 5), 16) / 255;
                                const b = parseInt(hex.slice(5, 7), 16) / 255;
                                // stage baseColor
                                const name = editedMaterial?.name;
                                if (name) {
                                  setStagedMaterials(prev => {
                                    const base = prev[name] ?? editedMaterial!;
                                    const next: Material = { ...base, baseColor: [r, g, b, (base.baseColor?.[3] ?? editedMaterial!.baseColor[3])] as any };
                                    return { ...prev, [name]: next };
                                  });
                                  // keep local editedMaterial in sync so color picker doesn't snap back
                                  setEditedMaterial(prev => prev ? ({
                                    ...prev,
                                    baseColor: [r, g, b, (prev.baseColor?.[3] ?? 1)] as any,
                                  }) : prev);
                                }
                                try {
                                  withTargetMeshes((mat) => {
                                    if (mat?.color?.setRGB) mat.color.setRGB(r, g, b);
                                  });
                                } catch { }
                              }}
                            />
                          </div>
                        </div>

                        {/* Base Color Map */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Base Color Map</span>
                            <MapSlot
                              texture={editedTextures?.baseColorTexture}
                              alt="base color"
                              slot="baseColorTexture"
                              onPick={() => setTexturePicker({ open: true, slot: 'baseColorTexture', search: '' })}
                              onRemove={() => handleMaterialChange('baseColorTexture', null)}
                            />
                          </div>
                          {editedTextures?.baseColorTexture && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-600 w-12">U Tile</span>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.01"
                                  value={String((editedMaterial as any)?.baseColorTextureScale?.[0] ?? 1)}
                                  onChange={(e) => {
                                    const u = Math.max(0.01, parseFloat(e.target.value || '1'));
                                    const v = (editedMaterial as any)?.baseColorTextureScale?.[1] ?? 1;
                                    const next: [number, number] = [u, v];
                                    setEditedMaterial(prev => prev ? ({ ...prev, baseColorTextureScale: next as any }) : prev);
                                    const name = editedMaterial?.name;
                                    if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), baseColorTextureScale: next as any } } as any));
                                    (async () => {
                                      try {
                                        await withTargetMeshes((mat, _obj, THREE) => {
                                          if (mat?.map) {
                                            const tex = mat.map; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                          }
                                        });
                                      } catch { }
                                    })();
                                  }}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-600 w-12">V Tile</span>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.01"
                                  value={String((editedMaterial as any)?.baseColorTextureScale?.[1] ?? 1)}
                                  onChange={(e) => {
                                    const v = Math.max(0.01, parseFloat(e.target.value || '1'));
                                    const u = (editedMaterial as any)?.baseColorTextureScale?.[0] ?? 1;
                                    const next: [number, number] = [u, v];
                                    setEditedMaterial(prev => prev ? ({ ...prev, baseColorTextureScale: next as any }) : prev);
                                    const name = editedMaterial?.name;
                                    if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), baseColorTextureScale: next as any } } as any));
                                    (async () => {
                                      try {
                                        await withTargetMeshes((mat, _obj, THREE) => {
                                          if (mat?.map) {
                                            const tex = mat.map; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                          }
                                        });
                                      } catch { }
                                    })();
                                  }}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          )}
                          <div className="mt-2 flex items-center space-x-2">
                            <span className="text-xs text-gray-600 w-16">Rotation (rad)</span>
                            <Input
                              type="number"
                              step="0.001"
                              value={String(Math.round((((editedMaterial as any)?.baseColorTextureRotation ?? 0) * 1e6)) / 1e6)}
                              onChange={(e) => {
                                const rad = parseFloat(e.target.value || '0');
                                handleTextureRotationChange('baseColorTexture', rad);
                              }}
                              disabled={!editedTextures?.baseColorTexture}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Group: Roughness & Metalness */}
                      <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                        {/* Roughness */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Roughness</span>
                            <span className="text-sm text-gray-600">{Math.round((uiScalars?.roughnessFactor ?? 0) * 100)}%</span>
                          </div>
                          <SliderWithInput
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={uiScalars?.roughnessFactor ?? 0}
                            onChange={(v) => {
                              setUiScalars(prev => prev ? { ...prev, roughnessFactor: v } : prev)
                              // Persist in staged material
                              const name = editedMaterial?.name;
                              if (name) {
                                setStagedMaterials(prev => {
                                  const base = prev[name] ?? editedMaterial!;
                                  const next: Material = { ...base, roughnessFactor: v };
                                  return { ...prev, [name]: next };
                                });
                              }
                              const mv = modelViewerRef.current as any;
                              if (!mv) return;
                              try { withTargetMeshes((mat) => { if ('roughness' in mat) mat.roughness = v; }); } catch { }
                            }}
                            min={0} max={1} step={0.01}
                          />
                        </div>

                        {/* Roughness Map */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Roughness Map</span>
                            <MapSlot
                              texture={editedTextures?.metallicRoughnessTexture}
                              alt="roughness map"
                              slot="metallicRoughnessTexture"
                              onPick={() => setTexturePicker({ open: true, slot: 'metallicRoughnessTexture', search: '' })}
                              onRemove={() => handleMaterialChange('metallicRoughnessTexture', null)}
                            />
                          </div>
                        </div>

                        {/* Metalness */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Metalness</span>
                            <span className="text-sm text-gray-600">{Math.round((uiScalars?.metallicFactor ?? 0) * 100)}%</span>
                          </div>
                          <SliderWithInput
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={uiScalars?.metallicFactor ?? 0}
                            onChange={(v) => {
                              setUiScalars(prev => prev ? { ...prev, metallicFactor: v } : prev);
                              const name = editedMaterial?.name;
                              if (name) {
                                setStagedMaterials(prev => {
                                  const base = prev[name] ?? editedMaterial!;
                                  const next: Material = { ...base, metallicFactor: v };
                                  return { ...prev, [name]: next };
                                });
                              }
                              const mv = modelViewerRef.current as any;
                              if (!mv) return;
                              attachThreeAccess(mv);
                              try { withTargetMeshes((mat) => { if ('metalness' in mat) mat.metalness = v; }); } catch { }
                            }}
                            min={0} max={1} step={0.01}
                          />
                        </div>

                        {/* Metallic Map */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Metallic Map</span>
                            <MapSlot
                              texture={editedTextures?.metallicRoughnessTexture}
                              alt="metallic map"
                              slot="metallicRoughnessTexture"
                              onPick={() => setTexturePicker({ open: true, slot: 'metallicRoughnessTexture', search: '' })}
                              onRemove={() => handleMaterialChange('metallicRoughnessTexture', null)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Group: Occlusion & Normal */}
                      <div className="rounded-md bg-neutral-100/60 p-2 space-y-2">
                        {/* Occlusion Strength */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Occlusion Strength</span>
                            <span className="text-sm text-gray-600">{Math.round((uiScalars?.occlusionStrength ?? 0) * 100)}%</span>
                          </div>
                          <SliderWithInput
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={uiScalars?.occlusionStrength ?? 0}
                            onChange={(v) => {
                              setUiScalars(prev => prev ? { ...prev, occlusionStrength: v } : prev);
                              const name = editedMaterial?.name;
                              if (name) {
                                setStagedMaterials(prev => {
                                  const base = prev[name] ?? editedMaterial!;
                                  const next: Material = { ...base, occlusionStrength: v };
                                  return { ...prev, [name]: next };
                                });
                              }
                              const mv = modelViewerRef.current as any;
                              if (!mv) return;
                              try { withTargetMeshes((mat) => { if ('aoMapIntensity' in mat) mat.aoMapIntensity = v; }); } catch { }
                            }}
                            min={0} max={1} step={0.01}
                          />
                        </div>

                        {/* Normal factor */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Normal factor</span>
                            <span className="text-sm text-gray-600">{Math.round((uiScalars?.normalScale ?? 0) * 100)}%</span>
                          </div>
                          <SliderWithInput
                            className="w-full"
                            sliderWidth="w-full"
                            showValue={false}
                            value={uiScalars?.normalScale ?? 0}
                            onChange={(v) => {
                              setUiScalars(prev => prev ? { ...prev, normalScale: v } : prev);
                              const name = editedMaterial?.name;
                              if (name) {
                                setStagedMaterials(prev => {
                                  const base = prev[name] ?? editedMaterial!;
                                  const next: Material = { ...base, normalScale: v };
                                  return { ...prev, [name]: next };
                                });
                              }
                              const mv = modelViewerRef.current as any;
                              if (!mv) return;
                              try { withTargetMeshes((mat) => { if (mat?.normalScale?.set) mat.normalScale.set(v, -v); }); } catch { }
                            }}
                            min={0} max={2} step={0.01}
                          />
                        </div>

                        {/* Normal Map (texture) */}
                        <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">Normal Map</span>
                            <MapSlot
                              texture={editedTextures?.normalTexture}
                              alt="normal map"
                              slot="normalTexture"
                              onPick={() => setTexturePicker({ open: true, slot: 'normalTexture', search: '' })}
                              onRemove={() => handleMaterialChange('normalTexture', null)}
                            />
                          </div>
                          {editedTextures?.normalTexture && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-600 w-12">U Tile</span>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.01"
                                  value={String((editedMaterial as any)?.normalTextureScale?.[0] ?? 1)}
                                  onChange={(e) => {
                                    const u = Math.max(0.01, parseFloat(e.target.value || '1'));
                                    const v = (editedMaterial as any)?.normalTextureScale?.[1] ?? 1;
                                    const next: [number, number] = [u, v];
                                    setEditedMaterial(prev => prev ? ({ ...prev, normalTextureScale: next as any }) : prev);
                                    const name = editedMaterial?.name;
                                    if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), normalTextureScale: next as any } } as any));
                                    (async () => {
                                      try {
                                        await withTargetMeshes((mat, _obj, THREE) => {
                                          if (mat?.normalMap) {
                                            const tex = mat.normalMap; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                          }
                                        });
                                      } catch { }
                                    })();
                                  }}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-600 w-12">V Tile</span>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0.01"
                                  value={String((editedMaterial as any)?.normalTextureScale?.[1] ?? 1)}
                                  onChange={(e) => {
                                    const v = Math.max(0.01, parseFloat(e.target.value || '1'));
                                    const u = (editedMaterial as any)?.normalTextureScale?.[0] ?? 1;
                                    const next: [number, number] = [u, v];
                                    setEditedMaterial(prev => prev ? ({ ...prev, normalTextureScale: next as any }) : prev);
                                    const name = editedMaterial?.name;
                                    if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), normalTextureScale: next as any } } as any));
                                    (async () => {
                                      try {
                                        await withTargetMeshes((mat, _obj, THREE) => {
                                          if (mat?.normalMap) {
                                            const tex = mat.normalMap; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                          }
                                        });
                                      } catch { }
                                    })();
                                  }}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          )}
                          <div className="mt-2 flex items-center space-x-2">
                            <span className="text-xs text-gray-600 w-16">Rotation (rad)</span>
                            <Input
                              type="number"
                              step="0.001"
                              value={String(Math.round((((editedMaterial as any)?.normalTextureRotation ?? 0) * 1e6)) / 1e6)}
                              onChange={(e) => {
                                const rad = parseFloat(e.target.value || '0');
                                handleTextureRotationChange('normalTexture', rad);
                              }}
                              disabled={!editedTextures?.normalTexture}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Advanced options */}
                    <div className="space-y-2">
                      <div
                        className="flex items-center justify-between cursor-pointer py-2"
                        onClick={() => setShowAdvanced(v => !v)}
                      >
                        <span className="text-sm font-medium text-gray-900">Advanced options</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      {showAdvanced && (
                        <div className="space-y-4 rounded-md bg-neutral-50 p-3 shadow-inner">

                          {/* Opacity */}
                          <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">Opacity</span>
                              <span className="text-sm text-gray-600">{Math.round(((uiScalars?.baseOpacity ?? 1)) * 100)}%</span>
                            </div>
                            <SliderWithInput
                              className="w-full"
                              sliderWidth="w-full"
                              showValue={false}
                              value={uiScalars?.baseOpacity ?? 1}
                              onChange={(v) => {
                                setUiScalars(prev => prev ? { ...prev, baseOpacity: v } : prev);
                                const name = editedMaterial?.name;
                                if (name) {
                                  setStagedMaterials(prev => {
                                    const base = prev[name] ?? editedMaterial!;
                                    const [r, g, b, a] = base.baseColor ?? editedMaterial!.baseColor;
                                    const next: Material = { ...base, baseColor: [r, g, b, v] as any };
                                    return { ...prev, [name]: next };
                                  });
                                }
                                const mv = modelViewerRef.current as any;
                                if (!mv) return;
                                try { withTargetMeshes((mat) => { if ('opacity' in mat) { mat.opacity = v; mat.transparent = v < 1; } }); } catch { }
                              }}
                              min={0} max={1} step={0.01}
                            />
                          </div>

                          {/* Sheen Roughness */}
                          <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">Sheen Roughness</span>
                              <span className="text-sm text-gray-600">{Math.round(((uiScalars?.sheenRoughnessFactor ?? (editedMaterial as any).sheenFactor ?? 0)) * 100)}%</span>
                            </div>
                            <SliderWithInput
                              className="w-full"
                              sliderWidth="w-full"
                              showValue={false}
                              value={uiScalars?.sheenRoughnessFactor ?? (editedMaterial as any).sheenFactor ?? 0}
                              onChange={(v) => {
                                setUiScalars(prev => prev ? { ...prev, sheenRoughnessFactor: v } : prev);
                                const name = editedMaterial?.name;
                                if (name) {
                                  setStagedMaterials(prev => {
                                    const base = prev[name] ?? editedMaterial!;
                                    const next: Material = { ...base, sheenRoughnessFactor: v as any };
                                    return { ...prev, [name]: next };
                                  });
                                }
                                const mv = modelViewerRef.current as any;
                                if (!mv) return;
                                try {
                                  withTargetMeshes((mat, obj, THREE) => {
                                    // Upgrade to MeshPhysicalMaterial on-the-fly if needed to reflect sheen changes live
                                    if (!mat?.isMeshPhysicalMaterial) {
                                      const phys = new (THREE as any).MeshPhysicalMaterial();
                                      if (mat?.color) phys.color.copy?.(mat.color);
                                      if ('metalness' in mat) phys.metalness = mat.metalness;
                                      if ('roughness' in mat) phys.roughness = mat.roughness;
                                      phys.map = mat.map ?? null;
                                      phys.metalnessMap = mat.metalnessMap ?? null;
                                      phys.roughnessMap = mat.roughnessMap ?? null;
                                      phys.normalMap = mat.normalMap ?? null;
                                      phys.aoMap = mat.aoMap ?? null;
                                      if (mat.emissive) phys.emissive.copy?.(mat.emissive);
                                      phys.emissiveMap = mat.emissiveMap ?? null;
                                      phys.opacity = mat.opacity ?? phys.opacity;
                                      phys.transparent = mat.transparent ?? phys.transparent;
                                      if (mat.normalScale) phys.normalScale?.copy?.(mat.normalScale);
                                      obj.material = phys;
                                      mat = phys;
                                    }
                                    if ('sheen' in mat) (mat as any).sheen = 1;
                                    if ('sheenRoughness' in mat) (mat as any).sheenRoughness = v;
                                  });
                                } catch { }
                              }}
                              min={0} max={1} step={0.01}
                            />
                          </div>

                          {/* Sheen Roughness Map */}
                          <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">Sheen Roughness Map</span>
                              <MapSlot
                                texture={editedTextures?.sheenRoughnessTexture || (editedMaterial as any).sheenTexture}
                                alt="sheen roughness map"
                                slot="sheenRoughnessTexture"
                                onPick={() => setTexturePicker({ open: true, slot: 'sheenRoughnessTexture' as any, search: '' })}
                                onRemove={() => handleMaterialChange('sheenRoughnessTexture', null)}
                              />
                            </div>
                          </div>

                          {/* Sheen Color */}
                          <div className="space-y-2 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900">Sheen Color</span>
                              <DebouncedColorPicker
                                value={uiColors.sheen || `#${Math.round((editedMaterial.sheenColor?.[0] ?? 1) * 255).toString(16).padStart(2, '0')}${Math.round((editedMaterial.sheenColor?.[1] ?? 1) * 255).toString(16).padStart(2, '0')}${Math.round((editedMaterial.sheenColor?.[2] ?? 1) * 255).toString(16).padStart(2, '0')}`}
                                onChange={(hex) => {
                                  if (!hex || typeof hex !== 'string' || hex.length < 7) return;
                                  setUiColors((c) => ({ ...c, sheen: hex }));
                                  const mv = modelViewerRef.current as any;
                                  if (!mv) return;
                                  const r = parseInt(hex.slice(1, 3), 16) / 255;
                                  const g = parseInt(hex.slice(3, 5), 16) / 255;
                                  const b = parseInt(hex.slice(5, 7), 16) / 255;
                                  const name = editedMaterial?.name;
                                  if (name) {
                                    setStagedMaterials(prev => ({
                                      ...prev,
                                      [name]: { ...(prev[name] ?? editedMaterial!), sheenColor: [r, g, b] as any },
                                    }));
                                    // keep local editedMaterial in sync for stable picker value
                                    setEditedMaterial(prev => prev ? ({
                                      ...prev,
                                      sheenColor: [r, g, b] as any,
                                    }) : prev);
                                  }
                                  try {
                                    withTargetMeshes((mat, obj, THREE) => {
                                      // Upgrade to MeshPhysicalMaterial on-the-fly if needed
                                      if (!mat?.isMeshPhysicalMaterial) {
                                        const phys = new (THREE as any).MeshPhysicalMaterial();
                                        if (mat?.color) phys.color.copy?.(mat.color);
                                        if ('metalness' in mat) phys.metalness = mat.metalness;
                                        if ('roughness' in mat) phys.roughness = mat.roughness;
                                        phys.map = mat.map ?? null;
                                        phys.metalnessMap = mat.metalnessMap ?? null;
                                        phys.roughnessMap = mat.roughnessMap ?? null;
                                        phys.normalMap = mat.normalMap ?? null;
                                        phys.aoMap = mat.aoMap ?? null;
                                        if (mat.emissive) phys.emissive.copy?.(mat.emissive);
                                        phys.emissiveMap = mat.emissiveMap ?? null;
                                        phys.opacity = mat.opacity ?? phys.opacity;
                                        phys.transparent = mat.transparent ?? phys.transparent;
                                        if (mat.normalScale) phys.normalScale?.copy?.(mat.normalScale);
                                        obj.material = phys;
                                        mat = phys;
                                      }
                                      if ('sheen' in mat) (mat as any).sheen = 1;
                                      if (mat?.sheenColor?.setRGB) mat.sheenColor.setRGB(r, g, b);
                                      mat.needsUpdate = true;
                                    });
                                    const req = mv.requestRender?.();
                                    forceModelViewerRender(mv);
                                  } catch { }
                                }}
                              />
                            </div>
                          </div>

                {/* Sheen Color Map */}
                <div className="space-y-2 pb-3 rounded-sm px-2 py-2 transition-colors hover:bg-white/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Sheen Color Map</span>
                    <MapSlot
                      texture={editedTextures?.sheenColorTexture}
                      alt="sheen color map"
                      slot="sheenColorTexture"
                      onPick={() => setTexturePicker({ open: true, slot: 'sheenColorTexture' as any, search: '' })}
                      onRemove={() => handleMaterialChange('sheenColorTexture', null)}
                    />
                  </div>
                  {editedTextures?.sheenColorTexture && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-600 w-12">U Tile</span>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.01"
                          value={String((editedMaterial as any)?.sheenColorTextureScale?.[0] ?? 1)}
                          onChange={(e) => {
                            const u = Math.max(0.01, parseFloat(e.target.value || '1'));
                            const v = (editedMaterial as any)?.sheenColorTextureScale?.[1] ?? 1;
                            const next: [number, number] = [u, v];
                            setEditedMaterial(prev => prev ? ({ ...prev, sheenColorTextureScale: next as any }) : prev);
                            const name = editedMaterial?.name;
                            if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), sheenColorTextureScale: next as any } } as any));
                            (async () => {
                              try {
                                await withTargetMeshes((mat, _obj, THREE) => {
                                  if ((mat as any)?.sheenColorMap) {
                                    const tex = (mat as any).sheenColorMap; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                  }
                                });
                              } catch { }
                            })();
                          }}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-600 w-12">V Tile</span>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.01"
                          value={String((editedMaterial as any)?.sheenColorTextureScale?.[1] ?? 1)}
                          onChange={(e) => {
                            const v = Math.max(0.01, parseFloat(e.target.value || '1'));
                            const u = (editedMaterial as any)?.sheenColorTextureScale?.[0] ?? 1;
                            const next: [number, number] = [u, v];
                            setEditedMaterial(prev => prev ? ({ ...prev, sheenColorTextureScale: next as any }) : prev);
                            const name = editedMaterial?.name;
                            if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), sheenColorTextureScale: next as any } } as any));
                            (async () => {
                              try {
                                await withTargetMeshes((mat, _obj, THREE) => {
                                  if ((mat as any)?.sheenColorMap) {
                                    const tex = (mat as any).sheenColorMap; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; if (tex.repeat?.set) tex.repeat.set(u, v);
                                  }
                                });
                              } catch { }
                            })();
                          }}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )}
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-xs text-gray-600 w-20">Rotation (rad)</span>
                      <Input
                        type="number"
                        step="0.001"
                        value={String(Math.round((((editedMaterial as any)?.sheenColorTextureRotation ?? 0) * 1e6)) / 1e6)}
                        onChange={(e) => {
                          const rad = parseFloat(e.target.value || '0');
                          handleTextureRotationChange('sheenColorTexture', rad);
                        }}
                        disabled={!editedTextures?.sheenColorTexture}
                        className="h-7 text-xs"
                    />
                  </div>
                  {editedTextures?.sheenColorTexture && (
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-xs text-gray-600 w-20">UV Set</span>
                      <div className="flex space-x-1">
                        <button
                          className={`px-3 py-1 text-xs rounded transition-colors ${
                            ((editedMaterial as any)?.sheenColorTextureTexCoord ?? 0) === 0
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                          onClick={() => {
                            setEditedMaterial(prev => prev ? ({ ...prev, sheenColorTextureTexCoord: 0 as any }) : prev);
                            const name = editedMaterial?.name;
                            if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), sheenColorTextureTexCoord: 0 as any } } as any));
                            (async () => {
                              try {
                                await withTargetMeshes((mat) => {
                                  if ((mat as any)?.sheenColorMap) {
                                    (mat as any).sheenColorMap.channel = 0;
                                    if (typeof (mat as any).sheenColorMap?.setUvChannel === 'function') (mat as any).sheenColorMap.setUvChannel(0);
                                  }
                                });
                              } catch { }
                            })();
                          }}
                        >
                          UV0
                        </button>
                        <button
                          className={`px-3 py-1 text-xs rounded transition-colors ${
                            ((editedMaterial as any)?.sheenColorTextureTexCoord ?? 0) === 1
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                          onClick={() => {
                            setEditedMaterial(prev => prev ? ({ ...prev, sheenColorTextureTexCoord: 1 as any }) : prev);
                            const name = editedMaterial?.name;
                            if (name) setStagedMaterials(prev => ({ ...prev, [name]: { ...(prev[name] ?? editedMaterial!), sheenColorTextureTexCoord: 1 as any } } as any));
                            (async () => {
                              try {
                                await withTargetMeshes((mat) => {
                                  if ((mat as any)?.sheenColorMap) {
                                    (mat as any).sheenColorMap.channel = 1;
                                    if (typeof (mat as any).sheenColorMap?.setUvChannel === 'function') (mat as any).sheenColorMap.setUvChannel(1);
                                  }
                                });
                              } catch { }
                            })();
                          }}
                        >
                          UV1
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                        </div>
                      )}
                    </div>



                  </div>
                )}


              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Edit className="w-12 h-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">
                  Select Material
                </h3>
                <p className="text-sm text-gray-500 max-w-xs">
                  Choose a material from the sidebar to edit its properties and preview changes in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Texture Library Picker */}
      {texturePicker.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setTexturePicker({ open: false, slot: null, search: '' })}>
          <div className="bg-white rounded-lg shadow-lg w-[720px] max-w-[90vw] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Pick a texture</h3>
              <button className="text-gray-500 text-sm" onClick={() => setTexturePicker({ open: false, slot: null, search: '' })}>Close</button>
            </div>
            <div className="mb-3">
              <Input placeholder="Search textures..." value={texturePicker.search} onChange={(e) => setTexturePicker(prev => ({ ...prev, search: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 gap-3 max-h-[60vh] overflow-auto">
              {cdnImages
                .filter(name => {
                  const q = texturePicker.search.trim().toLowerCase();
                  if (!q) return true;
                  return name.toLowerCase().includes(q);
                })
                .map((clean, idx) => {
                  const originalSrc = resolveTextureUrl(clientName, clean) as string;
                  const webpThumb = `${originalSrc}?format=webp&width=384&height=384&quality=60`;
                  return (
                    <button key={`${clean}-${idx}`} className="border rounded p-2 hover:border-blue-500 text-left" onClick={() => {
                      if (!texturePicker.slot) return;
                      handleMaterialChange(texturePicker.slot, clean);
                      setTexturePicker({ open: false, slot: null, search: '' });
                    }}>
                      <img
                        src={webpThumb}
                        alt={clean}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = originalSrc; }}
                        className="w-full h-24 object-cover rounded mb-2 bg-gray-100"
                        draggable={false}
                      />
                      <div className="text-xs truncate" title={clean}>{clean}</div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Delete material confirm */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setDeleteDialog(null)}>
          <div className="bg-white rounded-lg shadow-lg w-96 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Material</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>"{deleteDialog.name}"</strong>?
              This will remove the material from the staged list. Click Save All to persist the change.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setDeleteDialog(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => {
                deleteMaterial(deleteDialog.name);
                setDeleteDialog(null);
              }}>
                Delete Material
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Texture Editor Modal */}
      {textureEditor.open && textureEditor.texture && editedMaterial && (
        <TextureEditorModal
          clientName={clientName}
          texture={textureEditor.texture}
          slot={textureEditor.slot}
          modelViewerRef={modelViewerRef}
          withTargetMeshes={withTargetMeshes}
          onClose={() => setTextureEditor({ open: false, texture: null, slot: null })}
          onSave={(timestamp: number) => {
            if (textureEditor.texture) {
              setTextureTimestamps(prev => ({ ...prev, [textureEditor.texture!]: timestamp }));
            }
            setTextureEditor({ open: false, texture: null, slot: null });
          }}
        />
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded-lg shadow-lg text-white ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
      
      {/* Sonner Toast Provider */}
      <Toaster position="top-right" richColors />
    </div>
  );
}

// Texture Editor Modal Component (positioned like color picker)
const TextureEditorModal = ({ 
  clientName, 
  texture, 
  slot,
  modelViewerRef,
  withTargetMeshes,
  onClose,
  onSave,
}: { 
  clientName: string;
  texture: string; 
  slot: keyof Material | null;
  modelViewerRef: React.RefObject<any>;
  withTargetMeshes: (mutate: (mat: any, obj: any, THREE: any) => void) => Promise<void>;
  onClose: () => void;
  onSave: (timestamp: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState(false);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [adjustments, setAdjustments] = useState({ brightness: 100, saturation: 100, contrast: 0, hue: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const [sidebarLeft, setSidebarLeft] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    const sidebar = document.getElementById('material-sidebar');
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      setSidebarLeft(rect.left);
    }
  }, []);

  const resetTextureToOriginal = async () => {
    if (!originalImage) return;
    
    try {
      await withTargetMeshes((mat) => {
        if (!mat || !slot) return;
        
        const mapName = slot === 'baseColorTexture' ? 'map' :
                       slot === 'metallicRoughnessTexture' ? 'roughnessMap' :
                       slot === 'normalTexture' ? 'normalMap' :
                       slot === 'sheenColorTexture' ? 'sheenColorMap' :
                       slot === 'sheenRoughnessTexture' ? 'sheenRoughnessMap' : null;
        
        if (mapName && mat[mapName]) {
          const texture = mat[mapName];
          texture.image = originalImage;
          texture.needsUpdate = true;
          
          const mv = modelViewerRef.current as any;
          if (mv) {
            mv.requestUpdate?.();
          }
        }
      });
    } catch (e) {
      console.warn('Failed to reset texture:', e);
    }
  };

  const handleClose = () => {
    resetTextureToOriginal();
    onClose();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (originalImage) {
          resetTextureToOriginal();
        }
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, originalImage, withTargetMeshes, slot, modelViewerRef]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = resolveTextureUrl(clientName, texture) || '';
    img.onload = () => {
      setOriginalImage(img);
      const canvas = canvasRef.current;
      if (canvas && img) {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      }
    };
  }, [texture, clientName]);

  const applyAdjustments = (img: HTMLImageElement, adj: typeof adjustments) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const brightnessFactor = adj.brightness / 100;
      r *= brightnessFactor;
      g *= brightnessFactor;
      b *= brightnessFactor;

      const contrastFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2 / 255;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (510 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      h = (h + adj.hue / 360) % 1;
      if (h < 0) h += 1;
      s *= adj.saturation / 100;
      s = Math.min(1, Math.max(0, s));

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      if (s === 0) {
        r = g = b = l * 255;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3) * 255;
        g = hue2rgb(p, q, h) * 255;
        b = hue2rgb(p, q, h - 1/3) * 255;
      }

      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const updateCanvasPreview = (adj: typeof adjustments) => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;
    
    const hasChanges = adj.brightness !== 100 || 
                      adj.saturation !== 100 || 
                      adj.contrast !== 0 || 
                      adj.hue !== 0;
    
    if (hasChanges) {
      applyAdjustments(originalImage, adj);
    } else {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(originalImage, 0, 0);
      }
    }
  };

  const updateModelTexture = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    try {
      await withTargetMeshes((mat) => {
        if (!mat || !slot) return;
        
        const mapName = slot === 'baseColorTexture' ? 'map' :
                       slot === 'metallicRoughnessTexture' ? 'roughnessMap' :
                       slot === 'normalTexture' ? 'normalMap' :
                       slot === 'sheenColorTexture' ? 'sheenColorMap' :
                       slot === 'sheenRoughnessTexture' ? 'sheenRoughnessMap' : null;
        
        if (mapName && mat[mapName]) {
          const texture = mat[mapName];
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            texture.image = img;
            texture.needsUpdate = true;
            
            const mv = modelViewerRef.current as any;
            if (mv) {
              mv.requestUpdate?.();
            }
          };
          img.src = canvas.toDataURL('image/png');
        }
      });
    } catch (e) {
      console.warn('Failed to update model-viewer texture:', e);
    }
  };


  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error('Canvas not ready');
      return;
    }

    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Failed to create blob from canvas');
      }

      const formData = new FormData();
      formData.append('file', blob, texture);
      formData.append('client', clientName);
      formData.append('createBackup', 'true');

      const response = await fetch('/api/upload-texture', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const timestamp = data.timestamp || Date.now();
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      try {
        const textureUrl = `${resolveTextureUrl(clientName, texture)}?t=${timestamp}&nocache=${Math.random()}`;
        await fetch(textureUrl, { cache: 'no-store' });
        
        await withTargetMeshes((mat) => {
          if (!mat || !slot) return;
          
          const mapName = slot === 'baseColorTexture' ? 'map' :
                         slot === 'metallicRoughnessTexture' ? 'roughnessMap' :
                         slot === 'normalTexture' ? 'normalMap' :
                         slot === 'sheenColorTexture' ? 'sheenColorMap' :
                         slot === 'sheenRoughnessTexture' ? 'sheenRoughnessMap' : null;
          
          if (mapName && mat[mapName]) {
            const texture = mat[mapName];
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              texture.image = img;
              texture.needsUpdate = true;
              
              const mv = modelViewerRef.current as any;
              if (mv) {
                mv.requestUpdate?.();
              }
            };
            img.src = textureUrl;
          }
        });
      } catch (e) {
        console.warn('Failed to reload texture in model:', e);
      }
      
      onSave(timestamp);
      toast.success('Texture saved successfully!');
    } catch (error) {
      console.error('Failed to save texture:', error);
      toast.error(`Failed to save texture: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div 
      ref={panelRef}
      className="fixed z-[9999] w-96 rounded-md border border-gray-200 bg-white shadow-lg p-4 select-none"
      style={{
        top: '50%',
        left: sidebarLeft !== null ? sidebarLeft : 0,
        transform: sidebarLeft !== null ? 'translate(calc(-100% - 12px), -50%)' : 'translate(-100%, -50%)',
      }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Edit Texture</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-gray-100 rounded-lg p-2 w-full aspect-square flex items-center justify-center">
          <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Hue</span>
              <span>{adjustments.hue}°</span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              value={adjustments.hue}
              onChange={(e) => setAdjustments({ ...adjustments, hue: parseInt(e.target.value) })}
              onMouseUp={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              onTouchEnd={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Saturation</span>
              <span>{adjustments.saturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={adjustments.saturation}
              onChange={(e) => setAdjustments({ ...adjustments, saturation: parseInt(e.target.value) })}
              onMouseUp={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              onTouchEnd={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Brightness</span>
              <span>{adjustments.brightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={adjustments.brightness}
              onChange={(e) => setAdjustments({ ...adjustments, brightness: parseInt(e.target.value) })}
              onMouseUp={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              onTouchEnd={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span>Contrast</span>
              <span>{adjustments.contrast}</span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={adjustments.contrast}
              onChange={(e) => setAdjustments({ ...adjustments, contrast: parseInt(e.target.value) })}
              onMouseUp={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              onTouchEnd={() => {
                updateCanvasPreview(adjustments);
                updateModelTexture();
              }}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
            />
          </div>
        </div>

        {showConfirmation && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="text-xs text-amber-800 mb-2">
              ⚠️ This will permanently overwrite the original texture file. A backup will be created automatically.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  handleSave();
                }}
                disabled={saving}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={async () => {
              const resetAdj = { brightness: 100, saturation: 100, contrast: 0, hue: 0 };
              setAdjustments(resetAdj);
              updateCanvasPreview(resetAdj);
              await updateModelTexture();
            }}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={saving || showConfirmation}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Note: MapSlotCell removed - now using MapSlot everywhere for consistency

// Note: TextureRows component removed - using MapSlot directly in material cards

