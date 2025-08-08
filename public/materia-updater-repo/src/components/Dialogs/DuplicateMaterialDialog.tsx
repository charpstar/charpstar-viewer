// src/components/Dialogs/DuplicateMaterialDialog.tsx

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';

interface DuplicateMaterialDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (keepBoth: boolean) => void; // Updated to match the expected signature
    duplicateMaterials: Array<{ name: string; existingTags: string[]; newTags: string[] }>;
  }

const DuplicateMaterialDialog: React.FC<DuplicateMaterialDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  duplicateMaterials,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Duplicate Materials Found
          </DialogTitle>
          <DialogDescription>
            The following materials already exist in your current configuration:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          {duplicateMaterials.map((material, index) => (
            <Alert key={index}>
              <AlertDescription>
                <div className="flex flex-col space-y-2">
                  <span className="font-semibold">{material.name}</span>
                  <div className="text-sm">
                    <div>
                      Existing tags: {material.existingTags.join(', ') || 'None'}
                    </div>
                    <div>
                      New tags: {material.newTags.join(', ') || 'None'}
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={() => onConfirm(false)} variant="destructive">
            Replace Existing Materials
          </Button>
          <Button onClick={() => onConfirm(true)}>
            Keep Both Versions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateMaterialDialog;