  // Initialize Lenis
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,
  });

  // Update Lenis on each animation frame
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Force scroll bounds update once after page load
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 1000);

  // MutationObserver to watch for changes height
  const observer = new MutationObserver(() => {
    lenis.resize();
  });

  // Narrow to a specific container if preferred
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
  });