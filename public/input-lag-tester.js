// Quick Input Lag Tester - Run this in browser console

(function() {
  console.log('🔍 Input Lag Tester Started - This will show EXACTLY what causes the 2+ second lag');
  
  let inputEvents = [];
  
  function trackAllInputs() {
    document.querySelectorAll('input').forEach((input, index) => {
      const isFilename = input.className.includes('px-2') && input.className.includes('text-sm');
      const isSearch = input.className.includes('pl-10') && input.className.includes('pr-10');
      
      const label = isFilename ? '🎯 FILENAME INPUT' : 
                   isSearch ? '🔍 SEARCH INPUT' : 
                   `📝 INPUT #${index}`;
      
      console.log(`Tracking: ${label}`, input);
      
      input.addEventListener('input', function(e) {
        const startTime = performance.now();
        const value = e.target.value;
        
        console.log(`%c${label} - KEYSTROKE START`, 'color: red; font-weight: bold', {
          value: value,
          time: startTime,
          element: e.target
        });
        
        // Track everything that happens during this input
        let checkCount = 0;
        
        function checkForCompletion() {
          checkCount++;
          const currentTime = performance.now();
          const elapsed = currentTime - startTime;
          
          console.log(`${label} - Check #${checkCount} at ${elapsed.toFixed(2)}ms`);
          
          if (elapsed > 2000 || checkCount > 100) {
            console.error(`%c${label} - TAKING TOO LONG!`, 'color: red; font-size: 16px; font-weight: bold', {
              elapsed: elapsed.toFixed(2) + 'ms',
              checks: checkCount,
              stillProcessing: elapsed < 2000
            });
            
            // Dump everything we can about the current state
            console.group(`🚨 DEBUGGING ${label} DELAY`);
            console.log('Input element:', e.target);
            console.log('Parent elements:', e.target.parentElement, e.target.parentElement?.parentElement);
            console.log('React fiber:', e.target._reactInternalFiber || e.target.__reactInternalInstance);
            console.log('Event listeners:', window.getEventListeners ? window.getEventListeners(e.target) : 'Not available');
            console.trace('Call stack');
            console.groupEnd();
            
            return;
          }
          
          // Check again on next frame
          requestAnimationFrame(checkForCompletion);
        }
        
        requestAnimationFrame(checkForCompletion);
        
        // Also set up a timeout to catch if it never completes
        setTimeout(() => {
          const endTime = performance.now();
          const totalTime = endTime - startTime;
          
          if (totalTime > 100) {
            console.error(`%c${label} - FINAL LAG MEASUREMENT: ${totalTime.toFixed(2)}ms`, 
              'color: orange; font-size: 14px; font-weight: bold');
          } else {
            console.log(`%c${label} - Completed in ${totalTime.toFixed(2)}ms`, 
              'color: green; font-weight: bold');
          }
        }, 3000);
      });
    });
  }
  
  // Track existing inputs
  trackAllInputs();
  
  // Track new inputs that get added
  const observer = new MutationObserver(() => {
    trackAllInputs();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('✅ Now type in the filename input in the upload dialog to see detailed lag analysis');
  
  window.stopInputTesting = () => {
    observer.disconnect();
    console.log('🛑 Input lag testing stopped');
  };
})();
