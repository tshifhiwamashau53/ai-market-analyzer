/* Persistent chart storage: keeps the last uploaded screenshot available for analysis after refresh. */
(() => {
  const DB_NAME = 'ai-market-analyzer-storage';
  const DB_VERSION = 1;
  const STORE = 'charts';
  const KEY = 'last-chart';

  const openDB = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open chart storage'));
  });

  async function saveChart(file) {
    if (!file) return;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ blob: file, name: file.name || 'chart.png', type: file.type || 'image/png', savedAt: Date.now() }, KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn('Chart persistence unavailable:', err);
    }
  }

  async function loadChart() {
    try {
      const db = await openDB();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!record?.blob) return;

      const input = document.getElementById('chartInput');
      const preview = document.getElementById('chartPreview');
      if (!input || !preview || preview.src) return;

      const file = new File([record.blob], record.name || 'saved-chart.png', {
        type: record.type || record.blob.type || 'image/png',
        lastModified: record.savedAt || Date.now()
      });

      if (typeof window.showPreview === 'function') {
        window.showPreview(file);
      }
    } catch (err) {
      console.warn('Could not restore saved chart:', err);
    }
  }

  async function clearChart() {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn('Could not clear saved chart:', err);
    }
  }

  function start() {
    const input = document.getElementById('chartInput');
    const remove = document.getElementById('removeImage');
    if (!input) return;

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file?.type?.startsWith('image/')) saveChart(file);
    });

    remove?.addEventListener('click', clearChart);
    loadChart();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
