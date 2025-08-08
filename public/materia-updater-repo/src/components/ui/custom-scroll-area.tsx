// src/components/ui/custom-scroll-area.tsx

import React from 'react';
import { ScrollArea as BaseScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CustomScrollAreaProps extends React.ComponentProps<typeof BaseScrollArea> {
  hideScrollbar?: boolean;
}

export function CustomScrollArea({ 
  children, 
  className, 
  hideScrollbar = false, 
  ...props 
}: CustomScrollAreaProps) {
  return (
    <BaseScrollArea
      className={cn(
        "relative",
        hideScrollbar && "no-scrollbar",
        className
      )}
      {...props}
    >
      {children}
    </BaseScrollArea>
  );
}