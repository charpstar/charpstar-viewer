// src/components/ApplyJobNotification.tsx
'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ApplyProgress {
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

interface ApplySummary {
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

interface ApplyJobNotificationProps {
  isVisible: boolean;
  isApplying: boolean;
  progress: ApplyProgress | null;
  summary: ApplySummary | null;
  clientName: string;
  onDismiss: () => void;
  stackIndex?: number; // For stacking multiple notifications
}

const ApplyJobNotification: React.FC<ApplyJobNotificationProps> = ({
  isVisible,
  isApplying,
  progress,
  summary,
  clientName,
  onDismiss,
  stackIndex = 0
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (!isVisible) return null;

  const isComplete = summary || (!isApplying && progress);
  const totalFiles = progress?.total || summary?.total || 0;
  const completedFiles = progress?.done || summary?.done || 0;
  const failedFiles = progress?.failed || summary?.failed || 0;
  const successFiles = completedFiles - failedFiles;
  const progressPercentage = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;

  const getStatusIcon = () => {
    if (isComplete) {
      return failedFiles > 0 ? (
        <XCircle className="w-4 h-4 text-orange-500" />
      ) : (
        <CheckCircle className="w-4 h-4 text-green-500" />
      );
    }
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  };

  const getStatusText = () => {
    if (isComplete) {
      if (failedFiles > 0) {
        return `Complete with ${failedFiles} failure${failedFiles !== 1 ? 's' : ''}`;
      }
      return 'Materials applied successfully';
    }
    return 'Applying materials...';
  };

  const topOffset = 16 + (stackIndex * 80); // 16px base + 80px per notification

  return (
    <div 
      className="fixed left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4 transition-all duration-300"
      style={{ top: `${topOffset}px` }}
    >
      <Card className="shadow-lg border-l-4 border-l-blue-500 bg-white/95 backdrop-blur-sm">
        <CardContent className="p-4">
          {/* Main Status Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              {getStatusIcon()}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {getStatusText()}
                </div>
                <div className="text-xs text-gray-600">
                  {clientName} • {completedFiles}/{totalFiles} files
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {!isComplete && totalFiles > 0 && (
                <div className="text-xs text-gray-500 font-medium">
                  {progressPercentage}%
                </div>
              )}
              
              {(progress?.processedFiles?.length || 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-6 w-6 p-0"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </Button>
              )}
              
              {isComplete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {!isComplete && totalFiles > 0 && (
            <div className="mt-3">
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}

          {/* Current File Indicator */}
          {!isComplete && progress?.currentFile && (
            <div className="mt-2 text-xs text-gray-500 truncate">
              Processing: {progress.currentFile}
            </div>
          )}

          {/* Stats Row - Only when complete */}
          {isComplete && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <div className="flex space-x-4">
                <span className="text-green-600">
                  ✓ {successFiles} success
                </span>
                {failedFiles > 0 && (
                  <span className="text-red-600">
                    ✗ {failedFiles} failed
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onDismiss}
                className="h-6 px-2 text-xs"
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Expanded File List */}
          {isExpanded && (progress?.processedFiles?.length || 0) > 0 && (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-medium text-gray-700 mb-2">
                Recent Files ({(progress?.processedFiles || []).length})
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {(progress?.processedFiles || [])
                  .slice(-5) // Show last 5 files
                  .reverse()
                  .map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 text-xs">
                      {file.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                      ) : file.status === 'failed' ? (
                        <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      ) : (
                        <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
                      )}
                      <span className="truncate text-gray-700">
                        {file.filename}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplyJobNotification;
