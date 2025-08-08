// src/components/Dialogs/InputDialog.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';

interface InputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  type?: 'text' | 'tags';
}

const InputDialog: React.FC<InputDialogProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  title, 
  description,
  initialValue = '',
  placeholder = 'Enter value',
  type = 'text'
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue(initialValue);
      if (type === 'tags') {
        setTags(initialValue.split(',').map(t => t.trim()).filter(t => t));
        setCurrentTag('');
      }
    }
  }, [initialValue, isOpen, type]);

  const handleSubmit = () => {
    if (type === 'tags') {
      onSubmit(tags.join(', '));
    } else {
      if (inputValue.trim()) {
        onSubmit(inputValue);
      }
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (type === 'tags') {
      if (e.key === 'Enter' && currentTag.trim()) {
        e.preventDefault();
        if (!tags.includes(currentTag.trim())) {
          setTags([...tags, currentTag.trim()]);
        }
        setCurrentTag('');
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {type === 'tags' ? (
          <div className="space-y-4">
            <Input
              value={currentTag}
              onChange={(e) => setCurrentTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a tag and press Enter"
            />
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="px-2 py-1 flex items-center gap-1"
                >
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-red-500"
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
          />
        )}

        <DialogFooter>
          <Button onClick={onClose} variant="outline">Cancel</Button>
          <Button onClick={handleSubmit}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InputDialog;