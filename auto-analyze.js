(() => {
  const startAutomaticResearch = () => {
    const button = document.getElementById('analyzeBtn');
    if (!button) return;

    const run = () => {
      if (!button.disabled) {
        button.click();
      } else {
        setTimeout(run, 500);
      }
    };

    setTimeout(run, 1200);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAutomaticResearch, { once: true });
  } else {
    startAutomaticResearch();
  }
})();
