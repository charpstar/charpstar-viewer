// src/components/Providers.tsx

import React from 'react';
import { TooltipProvider } from "@/components/ui/tooltip";

interface ProvidersProps {
  children: React.ReactNode;
}

const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <TooltipProvider>
      {children}
    </TooltipProvider>
  );
};

export default Providers;