import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DifferencePromptProps {
  differences: string[];
  onContinue: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export default function DifferencePrompt({ differences, onContinue, onCancel, isOpen }: DifferencePromptProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Differences Detected</DialogTitle>
          <DialogDescription>
            The following differences were found between the reference file and the JSON data:
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[200px] w-full rounded-md border p-4">
          <ul className="list-disc pl-4">
            {differences.map((diff, index) => (
              <li key={index} className="mb-2">{diff}</li>
            ))}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">Cancel</Button>
          <Button onClick={onContinue}>Continue Anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}