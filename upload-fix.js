/* Reliable upload/preview bridge. */
(() => {
  const start = () => {
    const input = document.getElementById('chartInput');
    const preview = document.getElementById('chartPreview');
    const wrap = document.getElementById('previewWrap');
    const zone = document.getElementById('dropzone');
    const button = document.getElementById('analyzeBtn');
    if (!input || !preview || !wrap || !zone) return;
    let objectUrl = null;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file?.type?.startsWith('image/')) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      preview.onload = () => { wrap.hidden=false; zone.hidden=true; if(button) button.disabled=false; };
      preview.onerror = () => { wrap.hidden=true; zone.hidden=false; if(button) button.disabled=true; };
      preview.src = objectUrl;
      wrap.hidden=false; zone.hidden=true;
    });
    const timer=setInterval(() => {
      if(preview.src && preview.complete && preview.naturalWidth>0){ wrap.hidden=false; zone.hidden=true; if(button) button.disabled=false; clearInterval(timer); }
    },250);
    setTimeout(()=>clearInterval(timer),15000);
    document.getElementById('removeImage')?.addEventListener('click',()=>{
      if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
      preview.removeAttribute('src'); wrap.hidden=true; zone.hidden=false; if(button) button.disabled=true;
    });
    const s=document.createElement('script'); s.src='analysis-fix.js?v=20260914-16'; document.body.appendChild(s);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
