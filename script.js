const $ = id => document.getElementById(id);
const input=$('chartInput'),dropzone=$('dropzone'),previewWrap=$('previewWrap'),preview=$('chartPreview'),analyzeBtn=$('analyzeBtn');
let imageReady=false,localVisual=null;
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v??'—';};
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const status=t=>setText('analysisMeta',t);

function showPreview(file){
  if(!file)return;
  const type=(file.type||'').toLowerCase();
  if(!type.startsWith('image/')){
    alert('Please select an image from your gallery.');
    return;
  }
  if(file.size>25*1024*1024){
    alert('Please choose an image smaller than 25 MB.');
    return;
  }

  imageReady=false;
  localVisual=null;
  status('Loading selected picture…');

  // Show the selected image immediately. Do not wait for analysis or OCR.
  previewWrap.hidden=false;
  previewWrap.style.display='block';
  dropzone.hidden=true;
  preview.style.display='block';
  preview.style.visibility='visible';
  preview.removeAttribute('hidden');

  const reader=new FileReader();
  reader.onload=function(){
    preview.src=String(reader.result||'');
  };
  reader.onerror=function(){
    imageReady=false;
    previewWrap.hidden=true;
    previewWrap.style.display='none';
    dropzone.hidden=false;
    status('Could not read that picture. Please choose it again.');
    alert('The picture could not be read. Please choose it again.');
  };
  preview.onload=function(){
    imageReady=true;
    status(file.name+' · picture loaded');
    try{
      localVisual=analyzeChartImage(preview);
    }catch(e){
      console.error('Chart image analysis error:',e);
      localVisual={available:false};
    }
    setTimeout(()=>{
      if(imageReady && localVisual)runScreenshotAnalysis();
    },150);
  };
  preview.onerror=function(){
    imageReady=false;
    status('Picture selected, but the browser could not display it.');
    console.error('Preview image failed to render');
  };
  reader.readAsDataURL(file);
}

