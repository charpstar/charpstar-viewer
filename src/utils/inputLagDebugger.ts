// Input Lag Debugger - tracks exactly what happens during input events

export const InputLagDebugger = {
  // Track all input events with detailed timing
  trackInput: (element: HTMLElement, label: string) => {
    let inputStartTime = 0;
    let renderStartTime = 0;
    
    element.addEventListener('input', (e) => {
      inputStartTime = performance.now();
      console.log(`🔴 INPUT START: ${label} at ${inputStartTime.toFixed(2)}ms`);
      
      // Track what happens during the input event
      const target = e.target as HTMLInputElement;
      console.log(`📝 Input value: "${target.value}"`);
      console.log(`📊 Input event phase: ${e.eventPhase}`);
      
      // Use MessageChannel to track when the input handler completes
      const channel = new MessageChannel();
      channel.port2.onmessage = () => {
        const inputEndTime = performance.now();
        const inputDuration = inputEndTime - inputStartTime;
        console.log(`🟡 INPUT HANDLER COMPLETE: ${label} took ${inputDuration.toFixed(2)}ms`);
        
        if (inputDuration > 50) {
          console.error(`🚨 SLOW INPUT HANDLER: ${label} blocked for ${inputDuration.toFixed(2)}ms`);
          
          // Take a performance snapshot
          if ((performance as any).mark) {
            (performance as any).mark(`slow-input-${label}-${Date.now()}`);
          }
        }
      };
      channel.port1.postMessage(null);
      
      // Track when the DOM update actually happens
      renderStartTime = performance.now();
      requestAnimationFrame(() => {
        const renderEndTime = performance.now();
        const renderDuration = renderEndTime - renderStartTime;
        const totalDuration = renderEndTime - inputStartTime;
        
        console.log(`🟢 RENDER COMPLETE: ${label} render took ${renderDuration.toFixed(2)}ms`);
        console.log(`⭐ TOTAL INPUT LAG: ${label} = ${totalDuration.toFixed(2)}ms`);
        
        if (totalDuration > 100) {
          console.error(`🚨 CATASTROPHIC LAG: ${label} total lag = ${totalDuration.toFixed(2)}ms`);
          InputLagDebugger.diagnoseSlowInput(target, totalDuration);
        }
      });
    });
    
    // Track focus/blur events
    element.addEventListener('focus', () => {
      console.log(`🎯 FOCUS: ${label}`);
    });
    
    element.addEventListener('blur', () => {
      console.log(`👋 BLUR: ${label}`);
    });
  },
  
  // Diagnose what might be causing slow input
  diagnoseSlowInput: (element: HTMLElement, lagTime: number) => {
    console.group(`🔍 DIAGNOSING SLOW INPUT (${lagTime.toFixed(2)}ms)`);
    
    // Check React Fiber
    const reactFiber = (element as any)._reactInternalFiber || (element as any).__reactInternalInstance;
    if (reactFiber) {
      console.log(`⚛️ React Fiber found:`, reactFiber);
    }
    
    // Check event listeners
    const listeners = (window as any).getEventListeners?.(element);
    if (listeners) {
      console.log(`👂 Event listeners:`, listeners);
      
      Object.keys(listeners).forEach(eventType => {
        const eventListeners = listeners[eventType];
        if (eventListeners.length > 3) {
          console.warn(`⚠️ Many ${eventType} listeners: ${eventListeners.length}`);
        }
      });
    }
    
    // Check parent component tree
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 10) {
      const reactKey = Object.keys(parent).find(key => key.startsWith('__react'));
      if (reactKey) {
        console.log(`🌳 Parent ${depth}:`, parent.className, reactKey);
      }
      parent = parent.parentElement;
      depth++;
    }
    
    // Check for heavy computations in the call stack
    console.trace('📚 Call stack at time of slow input');
    
    console.groupEnd();
  },
  
  // Monitor React re-renders during input
  monitorReactRenders: () => {
    let renderCount = 0;
    const originalRender = console.log;
    
    // Hook into React DevTools if available
    if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      
      hook.onCommitFiberRoot = (id: any, root: any, priorityLevel: any) => {
        renderCount++;
        console.log(`⚛️ React render #${renderCount}`, { id, priorityLevel });
        
        if (renderCount > 10) {
          console.warn(`🚨 Excessive React renders: ${renderCount}`);
        }
      };
    }
    
    // Reset render count periodically
    setInterval(() => {
      if (renderCount > 0) {
        console.log(`📊 React renders in last 5s: ${renderCount}`);
        renderCount = 0;
      }
    }, 5000);
  },
  
  // Start comprehensive input monitoring
  startMonitoring: () => {
    console.log('🚀 Input Lag Debugger Started');
    
    // Monitor all input elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const element = node as HTMLElement;
            
            // Track input elements
            if (element.tagName === 'INPUT') {
              const label = element.className.includes('filename') ? 'Filename Input' :
                           element.className.includes('search') ? 'Search Input' :
                           'Generic Input';
              
              console.log(`🎯 Tracking new input: ${label}`);
              InputLagDebugger.trackInput(element, label);
            }
            
            // Track inputs within added elements
            const inputs = element.querySelectorAll('input');
            inputs.forEach((input, index) => {
              const label = input.className.includes('filename') ? `Filename Input #${index}` :
                           input.className.includes('search') ? `Search Input #${index}` :
                           `Input #${index}`;
              
              console.log(`🎯 Tracking nested input: ${label}`);
              InputLagDebugger.trackInput(input, label);
            });
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Monitor existing inputs
    document.querySelectorAll('input').forEach((input, index) => {
      const label = input.className.includes('filename') ? `Filename Input #${index}` :
                   input.className.includes('search') ? `Search Input #${index}` :
                   `Existing Input #${index}`;
      
      console.log(`🎯 Tracking existing input: ${label}`);
      InputLagDebugger.trackInput(input, label);
    });
    
    // Monitor React renders
    InputLagDebugger.monitorReactRenders();
    
    console.log('✅ Input monitoring active - type in any input to see detailed timing');
  }
};

// Auto-start if in browser
if (typeof window !== 'undefined') {
  (window as any).InputLagDebugger = InputLagDebugger;
}
