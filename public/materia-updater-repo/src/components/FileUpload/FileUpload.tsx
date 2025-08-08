// src/components/FileUpload/FileUpload.tsx

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from "@/components/ui/button";
import { Upload, File, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion"; // Add framer-motion import

interface FileUploadProps {
  onFileSelect: (files: File | File[]) => void;
  accept: string;
  label?: string;
  selectedFileName?: string | null;
  multiple?: boolean;
  error?: string;
  onClearFile?: () => void;
  variant?: 'default' | 'compact';
  hasFiles?: boolean;
  className?: string;
}

export default function FileUpload({ 
  onFileSelect, 
  accept, 
  label, 
  selectedFileName,
  multiple = false,
  error,
  onClearFile,
  variant = 'default',
  hasFiles = false,
  className
}: FileUploadProps) {
  const getAcceptMapping = (acceptString: string) => {
    const mapping: { [key: string]: string[] } = {
      '.gltf': ['model/gltf+json', 'application/json'],
      '.glb': ['model/gltf-binary'],
      '.json': ['application/json']
    };

    return acceptString.split(',').reduce((acc: { [key: string]: string[] }, type) => {
      const trimmedType = type.trim();
      if (mapping[trimmedType]) {
        acc[trimmedType] = mapping[trimmedType];
      }
      return acc;
    }, {});
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      if (multiple) {
        onFileSelect(acceptedFiles);
      } else {
        onFileSelect(acceptedFiles[0]);
      }
    }
  }, [onFileSelect, multiple]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({ 
    onDrop,
    accept: getAcceptMapping(accept),
    noClick: false,
    multiple,
  });

  // If we have files and it's a multiple file upload, don't render the drop zone
  if (hasFiles && multiple) {
    return <input {...getInputProps()} className="hidden" />;
  }

  const renderNormalContent = () => {
    if (selectedFileName) {
      return (
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <File className="h-6 w-6 text-green-500" />
          <div className="flex-1 truncate">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
              {selectedFileName}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Ready to process
            </p>
          </div>
          {onClearFile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              className="hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        </div>
      );
    }

    return variant === 'default' ? (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="p-4 rounded-full bg-gray-50 dark:bg-gray-800">
          <Upload className="h-10 w-10 text-gray-400" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label || "Drop your file here, or click to select"}
          </p>
          <p className="text-xs text-gray-500">
            Supports {accept.split(',').join(', ')}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm">
          Select File
        </Button>
      </div>
    ) : (
      <div className="flex items-center justify-center gap-2 py-4">
        <Upload className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-600">
          {label || "Drop files or click to select"}
        </span>
      </div>
    );
  };

  return (
    <div className="relative">
      <div 
        {...getRootProps()}
        className={cn(
          "relative rounded-lg transition-all duration-150",
          "border-2 border-dashed",
          hasFiles ? "py-2 px-4" : "p-6",
          isDragActive && !isDragReject && "border-blue-500",
          isDragReject && "border-red-500",
          selectedFileName && "border-green-500",
          !isDragActive && !selectedFileName && "border-gray-300 dark:border-gray-700",
          "hover:border-gray-400 dark:hover:border-gray-600",
          error && "border-red-500",
          className
        )}
      >
        <input {...getInputProps()} />
        
        {/* Normal content with conditional opacity */}
        <div className={cn(
          "transition-opacity duration-200",
          isDragActive && "opacity-30"
        )}>
          {renderNormalContent()}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm mt-2 px-4 pb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay with AnimatePresence */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute inset-0 z-50",
              "flex items-center justify-center",
              "rounded-lg",
              "bg-white dark:bg-gray-800",
              "bg-opacity-90 dark:bg-opacity-90",
              "pointer-events-none",
              isDragReject ? "border-2 border-dashed border-red-500" : "border-2 border-dashed border-blue-500"
            )}
          >
            <div className="flex flex-col items-center gap-4">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <Upload 
                  className={cn(
                    "h-12 w-12",
                    isDragReject ? "text-red-500" : "text-blue-500"
                  )} 
                />
              </motion.div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}