'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, File, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface TextureUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  onSuccess: () => void;
}

interface UploadItem {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const TextureUploadDialog = ({ isOpen, onClose, clientName, onSuccess }: TextureUploadDialogProps) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    const valid = files.filter(file => {
      const n = file.name.toLowerCase();
      return n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg');
    });
    const mapped = valid.map(file => ({ file, id: `${Date.now()}-${Math.random()}`, progress: 0, status: 'pending' as const }));
    setItems(prev => [...prev, ...mapped]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFilesSelected(files);
  }, [handleFilesSelected]);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleUpload = useCallback(async () => {
    const pending = items.filter(f => f.status === 'pending');
    if (pending.length === 0) return;
    for (const it of pending) {
      try {
        setItems(prev => prev.map(f => f.id === it.id ? { ...f, status: 'uploading', progress: 10 } : f));

        // Read custom filename from DOM input (no React state churn)
        const input = document.querySelector(`[data-file-id="${it.id}"]`) as HTMLInputElement | null;
        const custom = input?.value?.trim();
        let filename = custom && custom.length > 0 ? custom : it.file.name;
        // Ensure extension .png/.jpg/.jpeg
        const lower = filename.toLowerCase();
        const hasExt = /(\.png|\.jpg|\.jpeg)$/.test(lower);
        if (!hasExt) {
          const origLower = it.file.name.toLowerCase();
          const m = origLower.match(/\.(png|jpg|jpeg)$/);
          const ext = m ? m[0] : '.jpg';
          filename = `${filename}${ext}`;
        }
        // Basic sanitize: strip paths and invalid chars
        filename = filename.split(/[/\\]/).pop() || filename;
        filename = filename.replace(/[^A-Za-z0-9._-]/g, '_');

        const form = new FormData();
        form.append('file', it.file);
        form.append('filename', filename);

        const res = await fetch(`/api/images?client=${encodeURIComponent(clientName)}`, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

        setItems(prev => prev.map(f => f.id === it.id ? { ...f, status: 'success', progress: 100 } : f));
      } catch (e) {
        setItems(prev => prev.map(f => f.id === it.id ? { ...f, status: 'error', progress: 0, error: e instanceof Error ? e.message : 'Upload failed' } : f));
      }
    }

    setTimeout(() => {
      const finalFiles = items.filter(f => f.status !== 'pending');
      const hasErrors = finalFiles.some(f => f.status === 'error');
      if (!hasErrors && finalFiles.length > 0) {
        onSuccess();
        setTimeout(() => {
          onClose();
          setItems([]);
        }, 500);
      }
    }, 400);
  }, [items, clientName, onClose, onSuccess]);

  const getStatusBadge = (f: UploadItem) => {
    switch (f.status) {
      case 'pending': return <Badge variant="secondary">Ready</Badge>;
      case 'uploading': return <Badge variant="default"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading</Badge>;
      case 'success': return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
      case 'error': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    }
  };

  const pendingCount = items.filter(f => f.status === 'pending').length;
  const successCount = items.filter(f => f.status === 'success').length;
  const errorCount = items.filter(f => f.status === 'error').length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Upload Textures</DialogTitle>
          <DialogDescription>Upload PNG/JPG/WEBP/KTX2 textures to the client images folder</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {items.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">Drop texture files here, or click to select</p>
              <p className="text-sm text-gray-500 mb-4">Supports .png, .jpg, .jpeg</p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="cursor-pointer">Select Files</Button>
              <input type="file" ref={fileInputRef} multiple accept=".png,.jpg,.jpeg" className="hidden" onChange={handleFileInputChange} />
            </div>
          ) : (
            <div className="space-y-4">
              <div 
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <p className="text-sm text-gray-600">Drop more files here or <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 hover:text-blue-800 underline cursor-pointer">select files</button></p>
                <input type="file" ref={fileInputRef} multiple accept=".png,.jpg,.jpeg" className="hidden" onChange={handleFileInputChange} />
              </div>

              <div className="border rounded-lg">
                <div className="p-4 border-b bg-gray-50">
                  <h3 className="font-medium text-gray-900">Upload Queue</h3>
                  <p className="text-sm text-gray-500">{items.length} files • {successCount} successful • {errorCount} errors</p>
                </div>
                <div className="p-4 max-h-60 overflow-y-auto space-y-3">
                  {items.map((it) => (
                    <div key={it.id} className="p-3 bg-gray-50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <File className="w-5 h-5 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{it.file.name}</p>
                            <p className="text-xs text-gray-500">{(it.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(it)}
                          {(it.status === 'pending' || it.status === 'error') && (
                            <Button variant="ghost" size="sm" onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-red-600 cursor-pointer">×</Button>
                          )}
                        </div>
                      </div>

                      {it.status === 'pending' && (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Custom filename (optional)</label>
                          <input type="text" data-file-id={it.id} placeholder="Enter filename (no extension needed)" className="w-full px-2 py-1 text-sm border border-gray-300 rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                          <p className="text-xs text-gray-500">We’ll keep or add .png/.jpg/.jpeg automatically.</p>
                        </div>
                      )}

                      {it.status === 'uploading' && <Progress value={it.progress} className="w-full" />}
                      {it.status === 'error' && it.error && (
                        <Alert>
                          <XCircle className="h-4 w-4" />
                          <AlertDescription>{it.error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-4">
          <Button variant="outline" onClick={onClose} className="cursor-pointer">Close</Button>
          {items.length > 0 && (
            <Button onClick={handleUpload} disabled={pendingCount === 0} className="cursor-pointer">
              {pendingCount > 0 ? `Upload ${pendingCount} Files` : 'Upload Complete'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TextureUploadDialog;


