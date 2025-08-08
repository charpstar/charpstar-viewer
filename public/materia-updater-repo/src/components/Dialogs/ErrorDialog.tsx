// src/components/Dialogs/ErrorDialog.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertOctagon } from 'lucide-react';
import { motion } from "framer-motion";

interface ErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

const ErrorDialog: React.FC<ErrorDialogProps> = ({ isOpen, onClose, message }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <AlertOctagon className="h-5 w-5" />
            Error Occurred
          </DialogTitle>
        </DialogHeader>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30"
        >
          <p className="text-sm text-red-700 dark:text-red-300">
            {message}
          </p>
        </motion.div>
        <DialogFooter className="mt-6">
          <Button 
            onClick={onClose}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ErrorDialog;