// src/components/ProgressDisplay/ProgressDisplay.tsx

import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, File } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressDisplayProps {
  progress: number;
  currentChunk: number;
  totalChunks: number;
  currentlyProcessingFiles: string[];
  latestProcessedFile: string | null;
  isProcessing: boolean;
}

const ProgressDisplay: React.FC<ProgressDisplayProps> = ({
  progress,
  currentChunk,
  totalChunks,
  currentlyProcessingFiles,
  latestProcessedFile,
  isProcessing
}) => {
  if (!isProcessing) return null;

  return (
    <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/50">
      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Progress Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              <span className="font-medium text-blue-700 dark:text-blue-300">
                Processing Files
              </span>
            </div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress 
              value={progress} 
              className="h-2 bg-blue-100 dark:bg-blue-900"
            />
            <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
              <span>Chunk {currentChunk} of {totalChunks}</span>
              <span>{progress.toFixed(1)}% Complete</span>
            </div>
          </div>

          {/* Currently Processing Files */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Currently Processing:
            </h4>
            <ScrollArea className="h-[100px] rounded-md border border-blue-100 dark:border-blue-900 bg-white/50 dark:bg-gray-900/50">
              <div className="p-4 space-y-2">
                <AnimatePresence mode="popLayout">
                  {currentlyProcessingFiles.map((file) => (
                    <motion.div
                      key={file}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="flex items-center gap-2 text-sm"
                    >
                      <File className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-600 dark:text-gray-400">{file}</span>
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin ml-auto" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>

          {/* Latest Processed File */}
          {latestProcessedFile && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-md bg-green-100 dark:bg-green-900/30"
            >
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Latest Processed:
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 truncate">
                  {latestProcessedFile}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProgressDisplay;