// src/components/Dialogs/SetFilenamesModal.tsx

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, FileText } from 'lucide-react';

interface SetFilenamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (filenames: string[]) => void;
  initialFilenames?: string[];
  groupName: string;
}

export default function SetFilenamesModal({
  isOpen,
  onClose,
  onSubmit,
  initialFilenames = [],
  groupName
}: SetFilenamesModalProps) {
  const [filenamesText, setFilenamesText] = useState('');
  const [parsedFilenames, setParsedFilenames] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const text = initialFilenames.join('\n');
      setFilenamesText(text);
      setParsedFilenames(initialFilenames);
    }
  }, [isOpen, initialFilenames]);

  const handleTextChange = (value: string) => {
    setFilenamesText(value);
    
    // Parse filenames from text
    const filenames = value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter((filename, index, array) => array.indexOf(filename) === index); // Remove duplicates
    
    setParsedFilenames(filenames);
  };

  const handleRemoveFilename = (filenameToRemove: string) => {
    const updatedFilenames = parsedFilenames.filter(f => f !== filenameToRemove);
    setParsedFilenames(updatedFilenames);
    setFilenamesText(updatedFilenames.join('\n'));
  };

  const handleSubmit = () => {
    onSubmit(parsedFilenames);
    onClose();
  };

  const handleCancel = () => {
    onClose();
    setFilenamesText(initialFilenames.join('\n'));
    setParsedFilenames(initialFilenames);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Set Filenames for &ldquo;{groupName}&rdquo;
          </DialogTitle>
          <DialogDescription>
            Enter filenames that should use this group&apos;s mesh assignments. 
            One filename per line. File extensions are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Filenames ({parsedFilenames.length} files)
            </label>
            <Textarea
              value={filenamesText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={`Enter filenames, one per line:\n\nchair_01.gltf\nchair_02.gltf\ntable_wood.gltf`}
              className="min-h-[120px] font-mono text-sm"
            />
          </div>

          {parsedFilenames.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview ({parsedFilenames.length} files)</label>
              <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                <div className="space-y-2">
                  {parsedFilenames.map((filename, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-800"
                    >
                      <span className="text-sm font-mono">{filename}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFilename(filename)}
                        className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {parsedFilenames.length === 0 && filenamesText.trim() && (
            <div className="text-sm text-amber-600 dark:text-amber-400">
              No valid filenames found. Please enter at least one filename.
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {parsedFilenames.length} files
            </Badge>
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={parsedFilenames.length === 0}
            >
              Apply Filenames
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}