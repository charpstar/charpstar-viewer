// src/components/Dialogs/WarningDialog.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";

interface WarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  message: string[];
}

const WarningDialog: React.FC<WarningDialogProps> = ({ isOpen, onClose, message }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            Warning
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="mt-4 max-h-[60vh]">
          <div className="pr-4 space-y-2">
            <AnimatePresence mode="popLayout">
              {message.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30"
                >
                  <XCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    {item}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
        <DialogFooter className="mt-6">
          <Button 
            onClick={onClose}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WarningDialog;