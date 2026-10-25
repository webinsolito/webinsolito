/* DesignBox 1.4 — device-aware controls. Uses existing core; no external APIs. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const touchLayout=()=>matchMedia('(max-width: 700px)').matches;
const library=document.createElement('button');
library.type='button';library.id='projectLibraryTop';library.className='icon-btn';library.title='I tuoi progetti e backup';library.setAttribute('aria-label','Apri progetti e backup');
library.innerHTML='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/></svg>';
const ready=()=>{
 const top=$('installBtn');if(top)top.before(library);
 const zoomControls=document.createElement('div');zoomControls.id='db-mobile-zoom';zoomControls.setAttribute('role','group');zoomControls.setAttribute('aria-label','Zoom del foglio');zoomControls.innerHTML='<button type="button" aria-label="Riduci zoom" title="Riduci zoom">−</button><button type="button" aria-label="Aumenta zoom" title="Aumenta zoom">+</button>';$('stage')?.appendChild(zoomControls);const z=zoomControls.querySelectorAll('button');z[0].onclick=()=>{ $('zoomOut')?.click() };z[1].onclick=()=>{ $('zoomIn')?.click() };
 library.addEventListener('click',()=>document.querySelector('[data-section="projects"]')?.click());
 const nav=$('propertiesTab');if(nav){nav.setAttribute('aria-label','Modifica elemento selezionato');}
 const selected=$('editSelectionBtn');if(selected)selected.setAttribute('aria-label','Modifica elemento selezionato');
 const saved=$('saveStatus');if(saved) saved.setAttribute('aria-live','polite');
 const buttons={'mobileUndoBtn':'Annulla','mobileRedoBtn':'Ripristina','fitBtn':'Adatta il foglio','backgroundBtn':'Cambia colore dello sfondo','sizeBtn':'Cambia formato del foglio'};
 for(const [id,name] of Object.entries(buttons)){let b=$(id);if(b)b.setAttribute('aria-label',name)}
 const barObserver=new MutationObserver(()=>{
   const q=$('db-quickbar');if(q){q.querySelector('[data-db="edit"]')?.setAttribute('aria-label','Modifica elemento');q.querySelector('[data-db="duplicate"]')?.setAttribute('aria-label','Duplica elemento');}
 });barObserver.observe(document.body,{childList:true});
 // Keyboard-induced resize on Safari standalone and Chrome Android, while avoiding false orientation zoom.
 let resizeTask;
 function syncViewport(){
   const viewport=window.visualViewport;
   const isKeyboardOpen=!!viewport && viewport.height < window.innerHeight-135;
   document.documentElement.style.setProperty('--db-viewport-height',isKeyboardOpen?Math.round(viewport.height)+'px':'100dvh');
   clearTimeout(resizeTask);resizeTask=setTimeout(()=>{$('fitBtn')?.click()},150);
 }
 let lastWidth=innerWidth,lastHeight=innerHeight;
 function onResize(){
   if(Math.abs(innerWidth-lastWidth)>8||Math.abs(innerHeight-lastHeight)>120){lastWidth=innerWidth;lastHeight=innerHeight;syncViewport()}
 }
 window.addEventListener('orientationchange',()=>setTimeout(syncViewport,250),{passive:true});
 window.addEventListener('resize',onResize,{passive:true});
 window.visualViewport?.addEventListener('resize',onResize,{passive:true});
 // Do not intercept the canvas drag engine: the zoom controls remain reliable on mobile.
 // Prevent rapid double taps on navigation controls from enlarging the whole browser viewport.
 document.querySelectorAll('.mobile-tab,.canvas-toolbar button,.top-actions button').forEach(b=>b.addEventListener('dblclick',e=>e.preventDefault()));
 // When a mobile keyboard hides, restore available canvas space.
 document.addEventListener('focusout',()=>setTimeout(syncViewport,250));
 // Help users with PWA installation: the existing install flow remains available in the menu on desktop.
 const header=$('projectTitle');if(header)header.setAttribute('aria-label','Titolo del progetto');
 // Make the selected editor tools discoverable without requiring precision taps.
 const start=Date.now();function status(){
  if(window.__designboxDebug && $('netStatus')){
    const offline=window.__designboxDebug.offlineReady?.();
    const footer=$('footerStatus');if(offline&&footer)footer.title='L’editor funziona senza Internet; esporta un backup per proteggere i progetti.';
    return;
  }if(Date.now()-start<12000)setTimeout(status,120);
 }status();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
