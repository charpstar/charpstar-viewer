// src/components/FileUpload/FileList.tsx

import React from 'react';
import { useDropzone } from 'react-dropzone';
import { File, X, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatFileSize } from '@/lib/utils';
import { cn } from "@/lib/utils";

interface FileListProps {
  files: File[];
  onRemoveFile?: (index: number) => void;
  errors?: { [key: string]: string };
  className?: string;
  processing?: boolean;
  processedFiles?: string[];
  onFileSelect?: (files: File[]) => void;
  accept?: string;
}

export default function FileList({ 
  files, 
  onRemoveFile,
  errors = {},
  className,
  processing = false,
  processedFiles = [],
  onFileSelect,
  accept
}: FileListProps) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: onFileSelect ? (acceptedFiles) => onFileSelect(acceptedFiles) : undefined,
    accept: {
      'application/json': ['.gltf'],
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf']
    },
    noClick: true,
    multiple: true,
  });

  if (files.length === 0) return null;

  return (
    <div 
      {...getRootProps()}
      className={cn(
        "relative border rounded-lg",
        "bg-white dark:bg-gray-800",
        "shadow-sm overflow-hidden",
        isDragActive && !isDragReject && "border-blue-500",
        isDragReject && "border-red-500",
        className
      )}
    >
      <input {...getInputProps()} />
  
      {/* Table content */}
      <div className={cn(
        "transition-opacity duration-200",
        isDragActive && "opacity-30"
      )}>
        <ScrollArea className="h-[300px]">
          <Table>
          <TableHeader className="sticky top-0 bg-white dark:bg-gray-800">
            <TableRow>
              <TableHead className="w-[50%]">Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file, index) => {
              const hasError = errors[file.name];
              const isProcessed = processedFiles.includes(file.name);

              return (
                <TableRow 
                  key={`${file.name}-${index}`}
                  className={cn(
                    "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                    "transition-colors",
                    hasError && "bg-red-50/50 dark:bg-red-900/20",
                    isProcessed && "bg-green-50/50 dark:bg-green-900/20"
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <File className={cn(
                        "h-4 w-4",
                        hasError ? "text-red-500" : 
                        isProcessed ? "text-green-500" : 
                        "text-blue-500"
                      )} />
                      <span className="truncate max-w-[200px] font-medium">
                        {file.name}
                      </span>
                    </div>
                    {hasError && (
                      <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                        <AlertCircle className="h-3 w-3" />
                        <span>{hasError}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-500">
                      {formatFileSize(file.size)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {hasError ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Error
                      </span>
                    ) : isProcessed ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Processed
                      </span>
                    ) : processing ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        Processing...
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        Ready
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {onRemoveFile && !processing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveFile(index)}
                        className="hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            )}
          </TableBody>
          </Table>
        </ScrollArea>
      </div>

  {/* Drag overlay */}
  {isDragActive && (
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-4">
          <Upload 
            className={cn(
              "h-12 w-12 animate-bounce",
              isDragReject ? "text-red-500" : "text-blue-500"
            )} 
          />
          <p className={cn(
            "text-lg font-medium",
            isDragReject ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
          )}>
            {isDragReject 
              ? "This file type is not supported" 
              : "Drop files here to add"
            }
          </p>
        </div>
      </div>
    )}
  </div>
);
}