// Simple performance profiler for debugging

export const ProfilerAPI = {
  // Start profiling a section
  start: (label: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      console.time(`⏱️ ${label}`);
      performance.mark(`${label}-start`);
    }
  },

  // End profiling a section
  end: (label: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      console.timeEnd(`⏱️ ${label}`);
      performance.mark(`${label}-end`);
      try {
        performance.measure(label, `${label}-start`, `${label}-end`);
      } catch (e) {
        // Ignore errors if marks don't exist
      }
    }
  },

  // Log memory usage
  memory: (label: string) => {
    if (typeof window !== 'undefined' && (window.performance as any).memory) {
      const memory = (window.performance as any).memory;
      console.log(`🧠 ${label} Memory:`, {
        used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
        total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
        limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`
      });
    }
  },

  // Log component render count
  renderCount: (() => {
    const counts: Record<string, number> = {};
    return (componentName: string) => {
      counts[componentName] = (counts[componentName] || 0) + 1;
      console.log(`🔄 ${componentName} render #${counts[componentName]}`);
    };
  })(),

  // Monitor main thread blocking
  blockingCheck: (label: string) => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      if (duration > 16) { // More than one frame (16ms)
        console.warn(`🚫 ${label} blocked main thread for ${duration.toFixed(2)}ms`);
      }
    };
  }
};

// Helper to wrap functions with performance monitoring
export const withProfiler = <T extends (...args: any[]) => any>(
  fn: T, 
  label: string
): T => {
  return ((...args: any[]) => {
    ProfilerAPI.start(label);
    const endBlockingCheck = ProfilerAPI.blockingCheck(label);
    
    try {
      const result = fn(...args);
      return result;
    } finally {
      ProfilerAPI.end(label);
      endBlockingCheck();
    }
  }) as T;
};

// React hook for component performance monitoring
export const useComponentProfiler = (componentName: string) => {
  ProfilerAPI.renderCount(componentName);
  ProfilerAPI.memory(componentName);
};
