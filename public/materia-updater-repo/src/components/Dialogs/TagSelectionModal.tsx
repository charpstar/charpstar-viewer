// src/components/Dialogs/TagSelectionModal.tsx

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tag } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tag: string) => void;
  tags: string[];
  title?: string;
  description?: string;
}

export default function TagSelectionModal({
  isOpen,
  onClose,
  onSelectTag,
  tags,
  title = "Select Tag",
  description = "Select a tag to apply"
}: TagSelectionModalProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);

  const filteredTags = tags.filter(tag =>
    tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirm = () => {
    if (selectedTag) {
      onSelectTag(selectedTag);
      onClose();
    }
  };

  React.useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedTag(null);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />

          <ScrollArea className="h-[300px] w-full rounded-md border p-4">
            <div className="grid grid-cols-2 gap-2">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={cn(
                      "cursor-pointer transition-all p-2",
                      selectedTag === tag 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "hover:bg-accent"
                    )}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))
              ) : (
                <div className="col-span-2 text-center text-sm text-muted-foreground">
                  No tags found
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedTag}
          >
            Apply Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}