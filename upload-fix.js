/* Reliable upload/preview bridge for desktop and mobile browsers. */
(() => {
  const start = () => {
    const input = document.getElementById('chartInput');
    const preview = document.getElementById('chartPreview');
    const previewWrap = document.getElementById('previewWrap');
    const dropzone = document.getElementById('dropzone');
    const analyze = document.getElementById('analyzeBtn');
    if (!input || !preview || !previewWrap || !dropzone) return;

    let objectUrl = null;

    const showStoredPreview = () => {
      if (preview.src && preview.complete && preview.naturalWidth > 0) {
        previewWrap.hidden = false;
        dropzone.hidden = true;
        if (analyze) analyze.disabled = false;
        return true;
      }
      return false;
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);

      // Make the preview visible immediately, independently of FileReader timing.
      preview.onload = () => {
        previewWrap.hidden = false;
        dropzone.hidden = true;
        if (analyze) analyze.disabled = false;
        previewWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      preview.onerror = () => {
        previewWrap.hidden = true;
        dropzone.hidden = false;
        if (analyze) analyze.disabled = true;
      };
      preview.src = objectUrl;
      previewWrap.hidden = false;
      dropzone.hidden = true;
    }, { passive: true });

    // Restore a saved chart after persistence.js finishes loading it.
    const restoreTimer = setInterval(() => {
      if (showStoredPreview()) clearInterval(restoreTimer);
    }, 250);
    setTimeout(() => clearInterval(restoreTimer), 15000);

    document.getElementById('removeImage')?.addEventListener('click', () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      preview.removeAttribute('src');
      previewWrap.hidden = true;
      dropzone.hidden = false;
      if (analyze) analyze.disabled = true;
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
