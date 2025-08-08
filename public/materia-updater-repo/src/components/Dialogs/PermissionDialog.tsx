// src/components/Dialogs/PermissionDialog.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PermissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const PermissionDialog: React.FC<PermissionDialogProps> = ({ isOpen, onClose, onConfirm }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>File System Permission</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <p className="text-sm text-gray-500">
            This website needs permission to write files to the selected directory. 
            Would you like to grant permission?
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">Cancel</Button>
          <Button onClick={onConfirm}>Grant Permission</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionDialog;