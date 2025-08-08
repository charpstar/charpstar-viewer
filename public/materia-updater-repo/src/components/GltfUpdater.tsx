// src/components/GltfUpdater.tsx

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import FileUpload from './FileUpload/FileUpload';
import FileList from './FileUpload/FileList';
import ProgressDisplay from './ProgressDisplay/ProgressDisplay';
import WarningDialog from './Dialogs/WarningDialog';
import ErrorDialog from './Dialogs/ErrorDialog';
import PermissionDialog from './Dialogs/PermissionDialog';
import { MaterialData, GltfData } from '@/gltf/gltfTypes';
import { saveFileWithFallback } from '@/utils/fileHandling';
import { formatFileSize } from '@/lib/utils';
import { ArrowUpDown, FolderOpen, Settings2, Eye } from 'lucide-react';
import InspectTargetFilesDialog from './Dialogs/InspectTargetFilesDialog';

declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
}

interface GltfUpdaterProps {
  materialData: MaterialData;
  referenceFile: File | null;
  setReferenceFile: (file: File, path: string) => void;
  clearReferenceFile: () => void;
  referenceFileName: string | null;
  referenceFilePath: string | null;
  isReferenceFileStored: boolean;
  setFeedback: (feedback: string) => void;
  setReferenceMaterials: (materials: string[]) => void;
  setReferenceMeshes: (meshes: string[]) => void;
  openReferenceMaterialsModal: () => void;
  openReferenceMeshesModal: () => void;
  updateMaterialData: (updatedData: MaterialData) => void;
}

const GltfUpdater: React.FC<GltfUpdaterProps> = ({
  materialData,
  referenceFile,
  setReferenceFile,
  clearReferenceFile,
  referenceFileName,
  referenceFilePath,
  isReferenceFileStored,
  setFeedback,
  setReferenceMaterials,
  setReferenceMeshes,
  openReferenceMaterialsModal,
  openReferenceMeshesModal,
  updateMaterialData
}) => {
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [reorderTextures, setReorderTextures] = useState(true);
  const [selectedModel, setSelectedModel] = useState('Regular');
  const [processingMode, setProcessingMode] = useState<'update' | 'export'>('update');
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputDirectory, setOutputDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] = useState<string | null>(null);
  const [concurrentProcesses, setConcurrentProcesses] = useState(1);
  const [currentlyProcessingFiles, setCurrentlyProcessingFiles] = useState<string[]>([]);
  const [latestProcessedFile, setLatestProcessedFile] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<{[key: string]: string}>({});
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [hasFileSystemPermission, setHasFileSystemPermission] = useState(false);

  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const [isInspectDialogOpen, setIsInspectDialogOpen] = useState(false);

  const handleAddMaterialFromInspect = useCallback((materialName: string) => {
    if (materialData && !materialData.materials.some(m => m.name === materialName)) {
      const updatedData = {
        ...materialData,
        materials: [...materialData.materials, { name: materialName, tags: [] }]
      };
      updateMaterialData(updatedData);
      setFeedback(`Added material: ${materialName}`);
    }
  }, [materialData, updateMaterialData, setFeedback]);

  const handleAddMeshFromInspect = useCallback((meshName: string) => {
    if (materialData && !materialData.meshAssignments[meshName]) {
      const updatedData = {
        ...materialData,
        meshAssignments: {
          ...materialData.meshAssignments,
          [meshName]: { defaultMaterial: '', variants: [] }
        }
      };
      updateMaterialData(updatedData);
      setFeedback(`Added mesh assignment: ${meshName}`);
    }
  }, [materialData, updateMaterialData, setFeedback]);

  const validateFile = (file: File) => {
    const errors: {[key: string]: string} = {};
    const maxSize = 100 * 1024 * 1024;
    
    if (file.size > maxSize) {
      errors[file.name] = `File size exceeds 100MB limit (${formatFileSize(file.size)})`;
    }
    
    const validExtensions = ['.gltf', '.glb'];
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(extension)) {
      errors[file.name] = 'Invalid file type. Only .gltf and .glb files are supported.';
    }
    
    return errors;
  };

  const handleReferenceFileSelect = async (fileOrFiles: File | File[]) => {
    // Handle single file
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;
    
    const errors = validateFile(file);
    if (Object.keys(errors).length > 0) {
      setFileErrors(errors);
      return;
    }
  
    setReferenceFile(file, file.name);
    setFeedback(`Reference file selected: ${file.name}`);
    
    try {
      const content = await file.text();
      const data = JSON.parse(content) as GltfData;
      
      if (!data.materials || !data.meshes) {
        throw new Error("Invalid GLTF file: missing materials or meshes");
      }
  
      setReferenceMaterials(data.materials.map(m => m.name));
      setReferenceMeshes(data.meshes.map(m => m.name));
    } catch (error) {
      setErrorMessage(`Error processing reference file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsErrorDialogOpen(true);
    }
  };

  const handleTargetFilesSelect = (fileOrFiles: File | File[]) => {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    
    const newErrors: {[key: string]: string} = {};
    const validFiles = files.filter(file => {
      // Check for duplicates first
      if (targetFiles.some(existingFile => existingFile.name === file.name)) {
        newErrors[file.name] = 'File already added';
        return false;
      }
  
      // Then check other validations
      const errors = validateFile(file);
      if (Object.keys(errors).length > 0) {
        Object.assign(newErrors, errors);
        return false;
      }
      return true;
    });
  
    if (Object.keys(newErrors).length > 0) {
      setFileErrors(prev => ({...prev, ...newErrors}));
    }
  
    if (validFiles.length > 0) {
      setTargetFiles(prev => [...prev, ...validFiles]);
      setFeedback(`Added ${validFiles.length} target file(s)`);
    }
  };

  const handleOutputDirectorySelect = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setOutputDirectory(handle);
      setOutputDirectoryName(handle.name);
      directoryHandleRef.current = handle;
      setIsPermissionDialogOpen(true);
      setFeedback('Output directory selected successfully.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Error selecting output directory:', error);
      setErrorMessage('Failed to select output directory. Please try again.');
      setIsErrorDialogOpen(true);
    }
  };

  const requestFileSystemPermission = async () => {
    if (outputDirectory) {
      try {
        const permission = await outputDirectory.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          setHasFileSystemPermission(true);
          setFeedback('File system permission granted.');
        } else {
          setHasFileSystemPermission(false);
          setFeedback('File system permission denied. Files will be downloaded directly.');
        }
      } catch (error) {
        console.error('Error requesting file system permission:', error);
        setHasFileSystemPermission(false);
        setFeedback('Error requesting file system permission. Files will be downloaded directly.');
      }
    }
    setIsPermissionDialogOpen(false);
  };

  const handleClearFiles = () => {
    setTargetFiles([]);
    setFileErrors({});
    setFeedback('All files cleared');
  };

  const processFiles = useCallback(async () => {
    if (!referenceFile || targetFiles.length === 0 || !materialData || !outputDirectory) {
      setErrorMessage('Please select reference file, target files, ensure material data is loaded, and select an output directory.');
      setIsErrorDialogOpen(true);
      return;
    }

    try {
      const referenceContent = await referenceFile.text();
      const referenceData = JSON.parse(referenceContent) as GltfData;

      setFeedback('Processing files...');
      setProgress(0);
      setIsProcessing(true);
      setLatestProcessedFile(null);

      directoryHandleRef.current = outputDirectory;

      const workerPool = new Array(concurrentProcesses).fill(null).map(() => 
        new Worker(new URL('../workers/gltfWorker.ts', import.meta.url))
      );

      let completedFiles = 0;
      const totalFiles = targetFiles.length;

      const processFile = async (file: File, worker: Worker) => {
        setCurrentlyProcessingFiles(prev => [...prev, file.name]);
        
        try {
          const content = await file.text();
          const jsonData = JSON.parse(content) as GltfData;

          return new Promise((resolve, reject) => {
            worker.onmessage = async (e) => {
              try {
                if (e.data.type === 'progress') {
                  const fileProgress = e.data.progress;
                  const overallProgress = (completedFiles + fileProgress) / totalFiles * 100;
                  setProgress(overallProgress);
                } else if (e.data.type === 'complete') {
                  completedFiles++;
                  if (processingMode === 'update') {
                    await saveFileWithFallback(file.name, e.data.result, outputDirectory);
                    setLatestProcessedFile(file.name);
                  } else {
                    for (const variant of e.data.result.exportedVariants) {
                      await saveFileWithFallback(variant.fileName, variant.content, outputDirectory);
                      setLatestProcessedFile(variant.fileName);
                    }
                  }
                  setCurrentlyProcessingFiles(prev => prev.filter(f => f !== file.name));
                  resolve(null);
                } else if (e.data.type === 'error') {
                  reject(new Error(e.data.error));
                }
              } catch (error) {
                reject(error);
              }
            };

            worker.postMessage({
              referenceData,
              targetData: jsonData,
              model: selectedModel,
              reorderTextures,
              materialData,
              processingMode,
              fileName: file.name,
              refFileName: referenceFileName,
              targetFileName: file.name
            });
          });
        } catch (error) {
          setCurrentlyProcessingFiles(prev => prev.filter(f => f !== file.name));
          throw error;
        }
      };

      const chunks = [];
      for (let i = 0; i < targetFiles.length; i += concurrentProcesses) {
        chunks.push(targetFiles.slice(i, i + concurrentProcesses));
      }
      setTotalChunks(chunks.length);

      for (let i = 0; i < chunks.length; i++) {
        setCurrentChunk(i + 1);
        await Promise.all(chunks[i].map((file, index) => processFile(file, workerPool[index])));
      }

      workerPool.forEach(worker => worker.terminate());
      setFeedback('All files processed successfully.');
    } catch (error) {
      console.error('Error processing files:', error);
      setErrorMessage(`Error processing files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsErrorDialogOpen(true);
    } finally {
      setProgress(100);
      setIsProcessing(false);
      setCurrentlyProcessingFiles([]);
      setLatestProcessedFile(null);
      directoryHandleRef.current = null;
    }
  }, [
    referenceFile,
    targetFiles,
    materialData,
    outputDirectory,
    processingMode,
    selectedModel,
    reorderTextures,
    concurrentProcesses,
    referenceFileName,
    setFeedback
  ]);

  const buttonDisabled = !referenceFile && !isReferenceFileStored || 
    targetFiles.length === 0 || 
    !materialData || 
    isProcessing || 
    !outputDirectory;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-lg font-semibold">Reference File</Label>
          {isReferenceFileStored && referenceFileName && (
            <div className="flex gap-2">
              <Button 
                onClick={openReferenceMaterialsModal} 
                variant="outline" 
                size="sm"
                className="text-blue-600 hover:text-blue-700"
              >
                View Materials
              </Button>
              <Button 
                onClick={openReferenceMeshesModal} 
                variant="outline" 
                size="sm"
                className="text-blue-600 hover:text-blue-700"
              >
                View Meshes
              </Button>
            </div>
          )}
        </div>
        <FileUpload
        onFileSelect={handleReferenceFileSelect}
        accept=".gltf,.glb"
        label="Drop reference GLTF file here"
        selectedFileName={referenceFileName}
        onClearFile={clearReferenceFile}
        error={Object.values(fileErrors)[0]}
        multiple={false}
      />
      </section>

      <Separator />

      {/* Target Files Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-lg font-semibold">Target Files</Label>
          {targetFiles.length > 0 && materialData && (
            <Button
              onClick={() => setIsInspectDialogOpen(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <Eye className="h-4 w-4" />
              Inspect
            </Button>
          )}
        </div>
        
        <FileUpload
          onFileSelect={handleTargetFilesSelect}
          accept=".gltf,.glb"
          label="Drop target GLTF files here"
          multiple={true}
          hasFiles={targetFiles.length > 0}
        />

        <FileList
          files={targetFiles}
          onRemoveFile={(index) => {
            setTargetFiles(prev => prev.filter((_, i) => i !== index));
            setFileErrors(prev => {
              const newErrors = {...prev};
              delete newErrors[targetFiles[index].name];
              return newErrors;
            });
          }}
          errors={fileErrors}
          className="max-h-[300px]"
          onFileSelect={handleTargetFilesSelect}
          accept=".gltf,.glb"
        />

        {targetFiles.length > 0 && (
          <Button 
            onClick={handleClearFiles} 
            variant="outline" 
            className="w-full"
          >
            Clear All Files
          </Button>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <Label className="text-lg font-semibold">
          Output Directory <span className="text-red-500">*</span>
        </Label>
        
        <Card className="bg-gray-50 dark:bg-gray-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {outputDirectoryName ? outputDirectoryName : 'No directory selected'}
                </span>
              </div>
              <Button 
                onClick={handleOutputDirectorySelect}
                variant="outline"
                className="shrink-0"
              >
                Select Directory
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <Label className="text-lg font-semibold flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Processing Options
        </Label>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="reorderTextures" 
              checked={reorderTextures} 
              onCheckedChange={(checked) => setReorderTextures(checked as boolean)}
            />
            <Label htmlFor="reorderTextures">Reorder Textures and Images by Alphabet</Label>
          </div>

          {materialData && materialData.models && (
            <div className="space-y-2">
              <Label htmlFor="modelSelect">Model Type</Label>
              <Select onValueChange={setSelectedModel} value={selectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(materialData.models).map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Processing Mode</Label>
            <Select value={processingMode} onValueChange={(value: 'update' | 'export') => setProcessingMode(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select processing mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="update">Update GLTF Files</SelectItem>
                <SelectItem value="export">Export Individual Variants</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetFiles.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="concurrentProcesses">Concurrent Processes</Label>
              <Select 
                value={concurrentProcesses.toString()} 
                onValueChange={(value) => setConcurrentProcesses(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select number of concurrent processes" />
                </SelectTrigger>
                <SelectContent>
                  {processingMode === 'update' ? (
                    Array.from({length: 9}, (_, i) => Math.pow(2, i)).map(value => (
                      <SelectItem key={value} value={value.toString()}>
                        {value}
                      </SelectItem>
                    ))
                  ) : (
                    [1, 2, 3, 5, 8, 12].map(value => (
                      <SelectItem key={value} value={value.toString()}>
                        {value}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>

      {isProcessing && (
        <ProgressDisplay
          progress={progress}
          currentChunk={currentChunk}
          totalChunks={totalChunks}
          currentlyProcessingFiles={currentlyProcessingFiles}
          latestProcessedFile={latestProcessedFile}
          isProcessing={isProcessing}
        />
      )}

      <Button 
        onClick={processFiles} 
        disabled={buttonDisabled}
        className={`w-full ${isProcessing ? 'bg-blue-500' : ''}`}
      >
        {isProcessing 
          ? 'Processing...' 
          : processingMode === 'update' 
            ? 'Update GLTF Files' 
            : 'Export Individual Variants'
        }
      </Button>

      <PermissionDialog
        isOpen={isPermissionDialogOpen}
        onClose={() => setIsPermissionDialogOpen(false)}
        onConfirm={requestFileSystemPermission}
      />

      <WarningDialog 
        isOpen={isWarningDialogOpen}
        onClose={() => setIsWarningDialogOpen(false)}
        message={warningMessage}
      />

      <ErrorDialog
        isOpen={isErrorDialogOpen}
        onClose={() => setIsErrorDialogOpen(false)}
        message={errorMessage}
      />

      {materialData && (
        <InspectTargetFilesDialog
          isOpen={isInspectDialogOpen}
          onClose={() => setIsInspectDialogOpen(false)}
          targetFiles={targetFiles}
          materialData={materialData}
          onAddMaterial={handleAddMaterialFromInspect}
          onAddMesh={handleAddMeshFromInspect}
        />
      )}
    </div>
  );
};

export default GltfUpdater;