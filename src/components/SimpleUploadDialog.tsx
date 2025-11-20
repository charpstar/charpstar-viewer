'use client';

import React, { useCallback, useRef, useState } from 'react';
import { upload as uploadToBlob } from '@vercel/blob/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, File, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface SimpleUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  onSuccess: () => void; // Callback when uploads complete successfully
}

interface SimpleUploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  uploadedUrl?: string;
}

const SimpleUploadDialog = ({ isOpen, onClose, clientName, onSuccess }: SimpleUploadDialogProps) => {
  // Only track files and their upload status - NO filename state here
  const [uploadFiles, setUploadFiles] = useState<SimpleUploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File selection handlers
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    const validFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb')
    );

    const newUploadFiles = validFiles.map(file => ({
      file,
      id: `${Date.now()}-${Math.random()}`,
      progress: 0,
      status: 'pending' as const
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
  }, []);

  // Drag and drop handlers
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

  // Remove file
  const removeFile = useCallback((id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Upload handler - this is where we read the filename inputs
  const handleUpload = useCallback(async () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    for (const uploadFile of pendingFiles) {
      try {
        // Update status to uploading
        setUploadFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 10 } : f
        ));

        // Read the filename from the input element (NO React state!)
        const filenameInput = document.querySelector(`[data-file-id="${uploadFile.id}"]`) as HTMLInputElement;
        const customFilename = filenameInput?.value?.trim() || '';

        const file = uploadFile.file;

        // Helper to extract error messages from server responses
        async function readServerError(res: Response): Promise<string> {
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const j = await res.json().catch(() => ({}));
              if (j && (j.error || j.message)) return String(j.error || j.message);
            }
            const t = await res.text().catch(() => '');
            return t || `${res.status} ${res.statusText}`;
          } catch {
            return `${res.status} ${res.statusText}`;
          }
        }

        // Determine final filename
        const finalFilename = customFilename
          ? (customFilename.endsWith('.gltf') || customFilename.endsWith('.glb')
            ? customFilename
            : (file.name.toLowerCase().endsWith('.glb') ? `${customFilename}.glb` : `${customFilename}.gltf`))
          : file.name;

        const isGlbFile = finalFilename.toLowerCase().endsWith('.glb');

        setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, progress: 30 } : f));

        // 1) Upload file bytes directly to Vercel Blob storage (browser -> Blob)
        const blobResult = await uploadToBlob(finalFilename, file, {
          access: 'public',
          handleUploadUrl: '/api/blob/generate-upload-token',
          multipart: true,
        });

        setUploadFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...f, progress: 60 } : f));

        // 2) Ask the server to pull from the blob URL and push to Bunny CDN
        const finalizeResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blobResult.url,
            filename: finalFilename,
            client: clientName,
            isGlbFile,
          }),
        });

        if (!finalizeResponse.ok) {
          const msg = await readServerError(finalizeResponse);
          throw new Error(`Finalize failed: ${msg}`);
        }

        const finalizeJson = await finalizeResponse.json().catch(() => ({}));
        if (!finalizeJson?.success) {
          throw new Error(finalizeJson?.error || 'Finalize failed');
        }

        // Success
        setUploadFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? {
              ...f,
              status: 'success' as const,
              progress: 100,
              uploadedUrl: finalizeJson?.fileUrl || finalFilename
            }
            : f
        ));

      } catch (error) {
        console.error('Upload error:', error);
        setUploadFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? {
              ...f,
              status: 'error' as const,
              error: error instanceof Error && error.message ? error.message : 'Upload failed'
            }
            : f
        ));
      }
    }

    // Check if all uploads completed successfully
    setTimeout(() => {
      const finalFiles = uploadFiles.filter(f => f.status !== 'pending');
      const hasErrors = finalFiles.some(f => f.status === 'error');
      if (!hasErrors && finalFiles.length > 0) {
        onSuccess(); // Refresh the model list
        setTimeout(() => {
          onClose();
          setUploadFiles([]);
        }, 1000);
      }
    }, 500);
  }, [uploadFiles, clientName, onSuccess, onClose]);

  const getStatusBadge = (file: SimpleUploadFile) => {
    switch (file.status) {
      case 'pending':
        return <Badge variant="secondary">Ready</Badge>;
      case 'uploading':
        return <Badge variant="default"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    }
  };

  const pendingCount = uploadFiles.filter(f => f.status === 'pending').length;
  const successCount = uploadFiles.filter(f => f.status === 'success').length;
  const errorCount = uploadFiles.filter(f => f.status === 'error').length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Upload GLTF Models</DialogTitle>
          <DialogDescription>
            Upload GLB/GLTF files to integrate with your material system
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {uploadFiles.length === 0 ? (
            /* No files - Full upload area */
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drop GLTF files here, or click to select
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Supports .gltf and .glb files
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer"
              >
                Select Files
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".gltf,.glb"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          ) : (
            /* Files added - Show queue */
            <div className="space-y-4">
              {/* Compact upload area */}
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <p className="text-sm text-gray-600">
                  Drop more files here or{' '}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    select files
                  </button>
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept=".gltf,.glb"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {/* Upload Queue - SIMPLE HTML INPUTS */}
              <div className="border rounded-lg">
                <div className="p-4 border-b bg-gray-50">
                  <h3 className="font-medium text-gray-900">Upload Queue</h3>
                  <p className="text-sm text-gray-500">
                    {uploadFiles.length} files • {successCount} successful • {errorCount} errors
                  </p>
                </div>
                <div className="p-4 max-h-60 overflow-y-auto space-y-3">
                  {uploadFiles.map((uploadFile) => (
                    <div
                      key={uploadFile.id}
                      className="p-3 bg-gray-50 rounded-lg space-y-3"
                    >
                      {/* File Info Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <File className="w-5 h-5 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {uploadFile.file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(uploadFile.file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {getStatusBadge(uploadFile)}
                          {(uploadFile.status === 'pending' || uploadFile.status === 'error') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(uploadFile.id)}
                              className="text-gray-400 hover:text-red-600 cursor-pointer"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* PLAIN HTML INPUT - NO REACT STATE */}
                      {uploadFile.status === 'pending' && (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">
                            Custom Filename (optional)
                          </label>
                          <input
                            type="text"
                            data-file-id={uploadFile.id}
                            placeholder="Enter filename (without extension)"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <p className="text-xs text-gray-500">
                            Leave empty to use original filename. The .gltf extension will be added automatically.
                          </p>
                        </div>
                      )}

                      {/* Progress Bar */}
                      {uploadFile.status === 'uploading' && (
                        <Progress value={uploadFile.progress} className="w-full" />
                      )}

                      {/* Error Message */}
                      {uploadFile.status === 'error' && uploadFile.error && (
                        <Alert>
                          <XCircle className="h-4 w-4" />
                          <AlertDescription>{uploadFile.error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {errorCount > 0 && (
                <Alert>
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    {errorCount} file(s) failed to upload. Please check the errors above and try again.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end space-x-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer"
          >
            Close
          </Button>
          {uploadFiles.length > 0 && (
            <Button
              onClick={handleUpload}
              disabled={pendingCount === 0}
              className="cursor-pointer"
            >
              {pendingCount > 0 ? `Upload ${pendingCount} Files` : 'Upload Complete'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SimpleUploadDialog;
