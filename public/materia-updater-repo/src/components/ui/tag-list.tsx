// src/components/ui/tag-list.tsx

import React from 'react';
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';
import { cn } from "@/lib/utils";

interface TagListProps {
  tags: string[];
  onRemoveTag?: (tag: string) => void;
  className?: string;
  readOnly?: boolean;
}

const TagList = React.forwardRef<HTMLDivElement, TagListProps>(
  ({ tags, onRemoveTag, className, readOnly = false }, ref) => {
    return (
      <div ref={ref} className={cn("flex flex-wrap gap-1", className)}>
        {tags.map(tag => (
          <Badge 
            key={tag} 
            variant="secondary" 
            className={cn(
              "text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-100",
              !readOnly && "pr-1 group"
            )}
          >
            <span className="truncate">{tag}</span>
            {!readOnly && onRemoveTag && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(tag);
                }}
                className="ml-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-800 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
    );
  }
);

TagList.displayName = 'TagList';

export default TagList;