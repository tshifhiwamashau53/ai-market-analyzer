(() => {
  const input = document.getElementById('chartInput');
  const button = document.getElementById('analyzeBtn');
  const preview = document.getElementById('chartPreview');
  if (!input || !button || !preview) return;

  let lastFile = '';
  const analyzeUploadedChart = () => {
    const file = input.files && input.files[0];
    if (!file || file.name === lastFile) return;
    lastFile = file.name;
    const waitForImage = () => {
      if (preview.complete && preview.naturalWidth > 0) {
        setTimeout(() => {
          if (!button.disabled) button.click();
        }, 250);
      } else {
        setTimeout(waitForImage, 100);
      }
    };
    waitForImage();
  };

  input.addEventListener('change', analyzeUploadedChart);
})();
