// Filename Input Performance Tester - Run in browser console

(function() {
  console.log('🚀 Filename Input Performance Tester Started');
  
  let keystrokes = [];
  let startTime = 0;
  
  function trackFilenameInputs() {
    document.querySelectorAll('input').forEach((input, index) => {
      // Identify filename inputs by their classes
      const isFilenameInput = input.className.includes('px-2') && input.className.includes('py-1');
      
      if (isFilenameInput) {
        console.log(`🎯 Tracking Filename Input #${index}:`, input);
        
        input.addEventListener('input', function(e) {
          startTime = performance.now();
          
          console.log(`%c🎯 FILENAME INPUT - Keystroke Start`, 'color: blue; font-weight: bold', {
            value: e.target.value,
            time: startTime
          });
          
          // Track how long it takes for the input to become responsive again
          let checkCount = 0;
          
          function checkResponsiveness() {
            checkCount++;
            const currentTime = performance.now();
            const elapsed = currentTime - startTime;
            
            if (elapsed > 100 || checkCount > 20) {
              const status = elapsed > 100 ? '❌ SLOW' : '✅ FAST';
              const color = elapsed > 100 ? 'red' : 'green';
              
              console.log(`%c${status} Filename Input Response: ${elapsed.toFixed(2)}ms`, 
                `color: ${color}; font-weight: bold; font-size: 14px`);
              
              keystrokes.push(elapsed);
              
              // Calculate running average
              const avg = keystrokes.reduce((a, b) => a + b, 0) / keystrokes.length;
              console.log(`📊 Average response time: ${avg.toFixed(2)}ms (${keystrokes.length} keystrokes)`);
              
              if (elapsed > 100) {
                console.error(`🚨 Still slow! Expected <50ms, got ${elapsed.toFixed(2)}ms`);
              }
              
              return;
            }
            
            requestAnimationFrame(checkResponsiveness);
          }
          
          requestAnimationFrame(checkResponsiveness);
        });
      }
    });
  }
  
  // Track existing inputs
  trackFilenameInputs();
  
  // Track new inputs that get added
  const observer = new MutationObserver(() => {
    trackFilenameInputs();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('✅ Filename input performance tracking active');
  console.log('📝 Type in the filename input to see performance measurements');
  console.log('🎯 Target: <50ms per keystroke');
  
  // Add summary function
  window.getFilenameInputSummary = () => {
    if (keystrokes.length === 0) {
      console.log('📊 No keystrokes recorded yet. Type in a filename input first!');
      return;
    }
    
    const avg = keystrokes.reduce((a, b) => a + b, 0) / keystrokes.length;
    const max = Math.max(...keystrokes);
    const min = Math.min(...keystrokes);
    const slowCount = keystrokes.filter(k => k > 100).length;
    
    console.group('📊 Filename Input Performance Summary');
    console.log(`Total keystrokes: ${keystrokes.length}`);
    console.log(`Average response: ${avg.toFixed(2)}ms`);
    console.log(`Fastest: ${min.toFixed(2)}ms`);
    console.log(`Slowest: ${max.toFixed(2)}ms`);
    console.log(`Slow responses (>100ms): ${slowCount}`);
    console.log(`Success rate: ${((keystrokes.length - slowCount) / keystrokes.length * 100).toFixed(1)}%`);
    console.groupEnd();
    
    if (avg < 50) {
      console.log('🎉 EXCELLENT! Filename input is now fast and responsive!');
    } else if (avg < 100) {
      console.log('⚡ GOOD! Significant improvement, but could be faster.');
    } else {
      console.log('🚨 STILL SLOW! More optimization needed.');
    }
  };
  
  window.stopFilenameInputTesting = () => {
    observer.disconnect();
    window.getFilenameInputSummary();
    console.log('🛑 Filename input testing stopped');
  };
})();
