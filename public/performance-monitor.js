// Browser Performance Monitor
// Run this in the browser console to monitor performance issues

(function() {
  console.log('🚀 Performance Monitor Started');
  
  let frameCount = 0;
  let lastTime = performance.now();
  let worstFrame = 0;
  
  // Monitor frame rate
  function measureFrameRate() {
    frameCount++;
    const currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    
    if (deltaTime > worstFrame) {
      worstFrame = deltaTime;
    }
    
    if (frameCount % 60 === 0) { // Every 60 frames
      const avgFrameTime = deltaTime / 60;
      const fps = 1000 / avgFrameTime;
      
      console.log(`📊 FPS: ${fps.toFixed(1)} | Avg Frame: ${avgFrameTime.toFixed(2)}ms | Worst: ${worstFrame.toFixed(2)}ms`);
      
      if (worstFrame > 50) {
        console.warn('⚠️ Frame drops detected! Worst frame:', worstFrame.toFixed(2) + 'ms');
      }
      
      worstFrame = 0;
    }
    
    lastTime = currentTime;
    requestAnimationFrame(measureFrameRate);
  }
  
  // Monitor memory (Chrome only)
  function logMemory() {
    if (performance.memory) {
      const memory = performance.memory;
      const used = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      const limit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      
      console.log(`🧠 Memory: ${used}MB / ${total}MB (Limit: ${limit}MB)`);
      
      if (used > limit * 0.8) {
        console.warn('⚠️ High memory usage detected!');
      }
    }
    
    setTimeout(logMemory, 5000); // Every 5 seconds
  }
  
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          console.warn(`🐌 Long task detected: ${entry.duration.toFixed(2)}ms`);
        }
      }
    });
    
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      console.log('Long task monitoring not available');
    }
  }
  
  // Monitor DOM mutations
  let mutationCount = 0;
  const mutationObserver = new MutationObserver((mutations) => {
    mutationCount += mutations.length;
    
    if (mutationCount > 100) {
      console.warn(`🔄 High DOM mutation rate: ${mutationCount} mutations`);
      mutationCount = 0;
    }
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });
  
  // Monitor input lag
  let lastInputTime = 0;
  document.addEventListener('input', (e) => {
    const now = performance.now();
    if (lastInputTime) {
      const inputDelay = now - lastInputTime;
      if (inputDelay > 100) {
        console.warn(`⌨️ Input lag detected: ${inputDelay.toFixed(2)}ms between inputs`);
      }
    }
    lastInputTime = now;
  });
  
  // Start monitoring
  requestAnimationFrame(measureFrameRate);
  setTimeout(logMemory, 1000);
  
  console.log('📈 To stop monitoring, call: window.stopPerformanceMonitor()');
  
  window.stopPerformanceMonitor = () => {
    mutationObserver.disconnect();
    console.log('🛑 Performance Monitor Stopped');
  };
})();
