'use client';

import { useParams, notFound } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { clients, isValidClient } from '@/config/clientConfig';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TextureUploadDialog from '@/components/TextureUploadDialog';

interface ImageItem {
  name: string;
  uri: string;
  size?: number;
  lastModified?: string;
}

export default function TexturesPage() {
  const params = useParams();
  const clientName = params.client as string;

  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];

  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadImages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/images?client=${clientName}&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load images');
      const data = await res.json();
      const list: ImageItem[] = Array.isArray(data?.images) ? data.images : [];
      setImages(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, [clientName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) => (img.name || img.uri || '').toLowerCase().includes(q));
  }, [images, search]);

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (filename.trim()) form.append('filename', filename.trim());
      const res = await fetch(`/api/images?client=${clientName}`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      setFile(null);
      setFilename('');
      await loadImages();
      setUploadOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onRefreshModels={loadImages} onUploadModels={() => setUploadOpen(true)} onSave={() => {}} isSaving={false} />
      <div className="flex h-[calc(100vh-56px)]">
        {/* Main content only */}
        <div className="flex-1 p-4 overflow-y-scroll overflow-x-hidden [scrollbar-gutter:stable]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Textures</h2>
              <p className="text-sm text-gray-600">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input className="w-64" placeholder="Search textures..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="border rounded overflow-hidden bg-white shadow-sm">
                  <div className="w-full h-32 bg-gray-100 animate-pulse" />
                  <div className="h-6 bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-500">No textures found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filtered.map((img) => {
                const clean = img.uri?.startsWith('images/') ? img.uri.substring(7) : img.uri;
                const base = clientConfig?.bunnyCdn?.publicBaseUrl?.replace(/\/$/, '') || 'https://cdn.charpstar.net';
                const imagesRoot = clientConfig?.bunnyCdn?.imagesPath?.replace(/\/$/, '') || '';
                const src = `${base}/${imagesRoot}/${clean}`;
                return (
                  <div key={img.uri} className="border rounded overflow-hidden bg-white shadow-sm">
                    <a href={src} target="_blank" rel="noopener noreferrer" title="Open original image in new tab">
                      <div className="relative w-full h-32 [content-visibility:auto]">
                        <Image
                          src={src}
                          alt={img.name || clean}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                          className="object-cover pointer-events-none select-none"
                          loading="lazy"
                          placeholder="empty"
                          draggable={false}
                          onError={(e) => { /* fail silently */ }}
                        />
                      </div>
                    </a>
                    <div className="p-2 text-xs truncate" title={img.name}>{img.name}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upload Modal (drag-and-drop like models) */}
          <TextureUploadDialog 
            isOpen={uploadOpen}
            onClose={() => setUploadOpen(false)}
            clientName={clientName}
            onSuccess={loadImages}
          />
        </div>
      </div>
    </div>
  );
}


