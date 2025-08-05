'use client';

import { useParams } from 'next/navigation';
import { clients, isValidClient } from '@/config/clientConfig';
import { useState, useRef, useCallback, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, File, CheckCircle, XCircle, ArrowLeft, Loader2, Trash2, RefreshCw, FolderOpen, Search, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import SavePasswordDialog from '@/components/SavePasswordDialog';
import DeleteModelDialog from '@/components/DeleteModelDialog';

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  uploadedUrl?: string;
}

interface ModelFile {
  filename: string;
  size: number;
  lastModified: string;
}

export default function ManageModelsPage() {
  const params = useParams();
  const clientName = params.client as string;
  
  // Validate client
  if (!isValidClient(clientName)) {
    notFound();
  }

  const clientConfig = clients[clientName];
  
  // State management
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [existingModels, setExistingModels] = useState<ModelFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<UploadFile[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{isOpen: boolean, modelName: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing models
  const loadExistingModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`/api/list-models?client=${clientName}`);
      if (response.ok) {
        const data = await response.json();
        setExistingModels(data.models || []);
      } else {
        console.error('Failed to load existing models');
        setExistingModels([]);
      }
    } catch (error) {
      console.error('Error loading existing models:', error);
      setExistingModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [clientName]);

  // Load models on component mount
  useEffect(() => {
    loadExistingModels();
  }, [loadExistingModels]);

  // File validation
  const validateFile = (file: File): string | null => {
    const maxSize = 100 * 1024 * 1024; // 100MB
    const validTypes = ['model/gltf-binary', 'model/gltf+json'];
    const validExtensions = ['.glb', '.gltf'];
    
    // Check file size
    if (file.size > maxSize) {
      return 'File size must be less than 100MB';
    }
    
    // Check file extension
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension) {
      return 'File must be a .glb or .gltf file';
    }
    
    return null;
  };

  // Handle file selection
  const handleFiles = useCallback((files: FileList) => {
    const newFiles: UploadFile[] = [];
    
    Array.from(files).forEach(file => {
      const error = validateFile(file);
      
      const uploadFile: UploadFile = {
        file,
        id: `${Date.now()}-${Math.random()}`,
        progress: 0,
        status: error ? 'error' : 'pending',
        error: error || undefined
      };
      
      newFiles.push(uploadFile);
    });
    
    setUploadFiles(prev => [...prev, ...newFiles]);
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
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // File input change handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  // Upload a single file
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'uploading', progress: 0 }
            : f
        ));

        const file = uploadFile.file;
        let fileData: string;
        
        // Handle different file types
        if (file.name.toLowerCase().endsWith('.glb')) {
          // For GLB files, convert to base64
          const arrayBuffer = await file.arrayBuffer();
          fileData = Buffer.from(arrayBuffer).toString('base64');
        } else {
          // For GLTF files, read as text
          fileData = await file.text();
        }

        // Simulate progress during file reading
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, progress: 30 }
            : f
        ));

        // First upload the file
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: fileData,
            filename: file.name,
            client: clientName,
            isGlbFile: file.name.toLowerCase().endsWith('.glb')
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
        }

        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, progress: 85 }
            : f
        ));

        // If it's a GLTF file, automatically convert it
        if (file.name.toLowerCase().endsWith('.gltf')) {
          console.log('Automatically converting GLTF file:', file.name);
          
          const convertResponse = await fetch('/api/convert-gltf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              gltfContent: fileData,
              filename: file.name,
              client: clientName,
            })
          });

          if (!convertResponse.ok) {
            const convertError = await convertResponse.json();
            console.warn('Auto-conversion failed:', convertError.error);
            // Don't throw error - the file was still uploaded successfully
          } else {
            const convertResult = await convertResponse.json();
            console.log('Auto-conversion successful:', convertResult.message);
          }
        }

        const result = await response.json();
        
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { 
                ...f, 
                status: 'success', 
                progress: 100,
                uploadedUrl: result.fileUrl 
              }
            : f
        ));

        // Refresh the existing models list
        loadExistingModels();

        resolve();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        setUploadFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { 
                ...f, 
                status: 'error', 
                error: errorMessage,
                progress: 0
              }
            : f
        ));

        reject(error);
      }
    });
  };

  // Start upload process (with password check)
  const handleStartUpload = () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;
    
    setPendingUploads(pendingFiles);
    setIsPasswordDialogOpen(true);
  };

  // Upload all pending files after password confirmation
  const handleConfirmedUpload = async () => {
    setIsPasswordDialogOpen(false);
    
    for (const file of pendingUploads) {
      try {
        await uploadFile(file);
      } catch (error) {
        console.error(`Failed to upload ${file.file.name}:`, error);
      }
    }
    
    setPendingUploads([]);
  };

  // Handle password confirmation
  const handlePasswordConfirm = (password: string) => {
    const isCorrect = password === clientConfig.livePassword;
    if (isCorrect) {
      handleConfirmedUpload();
    }
    return isCorrect;
  };

  // Show delete confirmation dialog
  const showDeleteDialog = (filename: string) => {
    setDeleteDialog({ isOpen: true, modelName: filename });
  };



  // Delete existing model
  const handleDeleteModel = async () => {
    if (!deleteDialog) return;
    
    const filename = deleteDialog.modelName;
    setDeletingFiles(prev => new Set([...prev, filename]));

    try {
      const response = await fetch('/api/delete-model', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          client: clientName,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      // Refresh the models list
      await loadExistingModels();
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error; // Re-throw to be handled by the dialog
    } finally {
      setDeletingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
    }
  };

  // Remove file from upload list
  const removeFile = (id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id));
  };

  // Clear completed uploads
  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(f => 
      f.status !== 'success' && f.status !== 'error'
    ));
  };

  // Get status badge
  const getStatusBadge = (file: UploadFile) => {
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

  // Filter and group models
  const filteredModels = existingModels.filter(model =>
    model.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group models alphabetically
  const groupedModels = filteredModels.reduce((groups: Record<string, ModelFile[]>, model) => {
    const firstLetter = model.filename[0].toUpperCase();
    const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(model);
    return groups;
  }, {});

  // Sort groups and models within groups
  const sortedGroups = Object.keys(groupedModels).sort().map(key => ({
    letter: key,
    models: groupedModels[key].sort((a, b) => a.filename.localeCompare(b.filename))
  }));

  const pendingCount = uploadFiles.filter(f => f.status === 'pending').length;
  const successCount = uploadFiles.filter(f => f.status === 'success').length;
  const errorCount = uploadFiles.filter(f => f.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Password Dialog */}
      <SavePasswordDialog
        isOpen={isPasswordDialogOpen}
        onClose={() => setIsPasswordDialogOpen(false)}
        onConfirm={handlePasswordConfirm}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialog && (
        <DeleteModelDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog(null)}
          onConfirm={handleDeleteModel}
          modelName={deleteDialog.modelName}
          isDeleting={deletingFiles.has(deleteDialog.modelName)}
        />
      )}



      {/* Header */}
      <div className="h-12 bg-white text-[#111827] flex items-center justify-between px-6 border-b border-gray-200 shadow-sm w-full">
        <div className="flex items-center">
          <Image
            src="/logo.svg"
            alt="Charpstar Logo"
            width={100}
            height={28}
          />
          <div className="ml-6 text-lg font-medium text-gray-700">
            Manage Models
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Link href={`/${clientName}`}>
            <Button variant="outline" size="sm" className="text-xs h-7">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Editor
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="sm"
            onClick={loadExistingModels}
            disabled={isLoadingModels}
            className="text-xs h-7"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingModels ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {uploadFiles.length > 0 && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearCompleted}
                disabled={successCount === 0 && errorCount === 0}
                className="text-xs h-7"
              >
                Clear Completed
              </Button>
              <Button 
                onClick={handleStartUpload}
                disabled={pendingCount === 0}
                className="bg-blue-600 hover:bg-blue-700 text-xs h-7"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload {pendingCount} Files
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex h-[calc(100vh-48px)]">
        {/* Left Sidebar - Existing Models */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-3">
              <FolderOpen className="w-5 h-5 mr-2" />
              Existing Models
            </h2>
            
            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <p className="text-sm text-gray-600">
              {searchQuery 
                ? `${filteredModels.length} of ${existingModels.length} models`
                : `${existingModels.length} models in base folder`
              }
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingModels ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">Loading models...</span>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="text-center py-8 text-gray-500 px-4">
                <File className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                {searchQuery ? (
                  <>
                    <p className="text-sm">No models match "{searchQuery}"</p>
                    <p className="text-xs text-gray-400">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">No models found</p>
                    <p className="text-xs text-gray-400">Upload your first model to get started</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-2">
                {sortedGroups.map(({ letter, models }) => (
                  <div key={letter} className="mb-4">
                    {/* Group Header */}
                    <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-2 py-1 mb-2 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {letter} ({models.length})
                      </h3>
                    </div>
                    
                    {/* Models in Group */}
                    <div className="space-y-1">
                      {models.map((model) => (
                        <div 
                          key={model.filename}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-md border hover:border-gray-300 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate" title={model.filename}>
                              {model.filename}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(model.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => showDeleteDialog(model.filename)}
                            disabled={deletingFiles.has(model.filename)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 hover:bg-red-50 h-7 w-7 p-0"
                          >
                            {deletingFiles.has(model.filename) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Content Area - Upload */}
        <div className="flex-1 flex flex-col">
          {uploadFiles.length === 0 ? (
            /* No files - Full height drag area */
            <div className="flex-1 p-6">
              <div
                className={`h-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition-colors ${
                  isDragOver 
                    ? 'border-blue-400 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-16 h-16 text-gray-400 mb-6" />
                <h3 className="text-xl font-semibold text-gray-700 mb-3">
                  Drop your model files here
                </h3>
                <p className="text-gray-500 mb-6 max-w-md">
                  Upload GLB or GLTF files to your model library. Maximum file size: 100MB per file.
                </p>
                
                <Button 
                  size="lg"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Select Files
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                
                <div className="mt-6 text-sm text-gray-400">
                  Supported formats: GLB, GLTF • Max size: 100MB per file
                </div>
              </div>
            </div>
          ) : (
            /* Files present - Split layout */
            <div className="flex-1 flex flex-col p-6 space-y-6">
              <Card className="flex-shrink-0">
                <CardHeader>
                  <CardTitle>Upload New Models</CardTitle>
                  <CardDescription>
                    Upload GLB or GLTF files to your model library. Maximum file size: 100MB per file.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDragOver 
                        ? 'border-blue-400 bg-blue-50' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 mb-3">
                      Drop more files here or click to browse
                    </p>
                    
                    <Button 
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add More Files
                    </Button>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".glb,.gltf"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Upload Queue - Flexible height */}
              <Card className="flex-1 flex flex-col min-h-0">
                <CardHeader className="flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Upload Queue</CardTitle>
                      <CardDescription>
                        {uploadFiles.length} files • {successCount} successful • {errorCount} errors
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto space-y-3">
                    {uploadFiles.map((uploadFile) => (
                      <div 
                        key={uploadFile.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-3 flex-1">
                          <File className="w-5 h-5 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {uploadFile.file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(uploadFile.file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                            {uploadFile.status === 'uploading' && (
                              <Progress value={uploadFile.progress} className="w-full mt-1" />
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(uploadFile)}
                          {(uploadFile.status === 'pending' || uploadFile.status === 'error') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(uploadFile.id)}
                              className="text-gray-400 hover:text-red-600"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {errorCount > 0 && (
                    <Alert className="mt-4 flex-shrink-0">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        Some files failed to upload. Check the errors above and try again.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}