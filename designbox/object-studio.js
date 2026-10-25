/* DesignBox Object Studio v1.5 — mockups locali, nessuna API o telemetria. */
(()=>{'use strict';
const kinds=[
 {id:'sticker',label:'Adesivo',hint:'Fustellato, pronto da vedere',size:'Logo quadrato',glyph:'✦'},
 {id:'label',label:'Etichetta',hint:'Su flaconi e prodotti',size:'Etichetta',glyph:'▤'},
 {id:'box',label:'Confezione',hint:'Scatole e packaging',size:'Etichetta',glyph:'⬡'},
 {id:'card',label:'Biglietto',hint:'Stampa e presentazione',size:'Biglietto da visita',glyph:'▣'},
 {id:'bag',label:'Shopper',hint:'Borse e merchandising',size:'Logo quadrato',glyph:'◡'}
];
let chosen='sticker',open=false,updateTimer=null,enhancing=false,loadedImages=new Map(),lastRendering=false;
try{const previous=localStorage.getItem('designbox-object-type');if(kinds.some(k=>k.id===previous))chosen=previous}catch{}
const byId=id=>document.getElementById(id);
const bySel=s=>document.querySelector(s);
const make=(tag,cls,html='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(html)node.innerHTML=html;return node};
const htmlEscape=str=>String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rect=(ctx,x,y,w,h,r=0)=>{ctx.beginPath();const rr=Math.max(0,Math.min(r,Math.min(w,h)/2));ctx.roundRect(x,y,w,h,rr)};
const current=()=>kinds.find(k=>k.id===chosen)||kinds[0];
const waitCore=()=>window.__designboxDebug?.getDoc;
function selected(id){chosen=id;try{localStorage.setItem('designbox-object-type',id)}catch{};
 document.querySelectorAll('[data-db-object]').forEach(el=>{const on=el.dataset.dbObject===id;el.classList.toggle('is-selected',on);if(el.getAttribute('role')==='radio')el.setAttribute('aria-checked',String(on))});
 const label=byId('db-object-type');if(label)label.textContent=current().label;
 if(open)render();
}
function buildModal(){const node=make('div','db-object-overlay');node.id='db-object-overlay';node.hidden=true;
 node.innerHTML=`<div class="db-object-dialog" role="dialog" aria-modal="true" aria-labelledby="db-object-title">
 <div class="db-object-top"><div><small>DESIGNBOX / PRODUCT STUDIO</small><h2 id="db-object-title">Dalla grafica all'oggetto</h2><p>Guarda il tuo progetto applicato a un prodotto, direttamente sul dispositivo.</p></div><button type="button" id="db-object-close" aria-label="Chiudi anteprima" class="db-object-close">✕</button></div>
 <div class="db-object-body"><div class="db-object-catalog" role="radiogroup" aria-label="Tipo di oggetto">${kinds.map(k=>`<button type="button" data-db-object="${k.id}" role="radio" aria-checked="false"><span class="db-object-symbol">${k.glyph}</span><span><strong>${k.label}</strong><small>${k.hint}</small></span></button>`).join('')}</div>
 <div class="db-object-visual"><div class="db-object-preview-head"><span class="db-live-dot"></span> ANTEPRIMA SUL PRODOTTO <span id="db-object-type"></span></div><canvas id="db-product-canvas" width="720" height="560" role="img" aria-label="Simulazione grafica del prodotto con il tuo design"></canvas><p>Simulazione grafica orientativa, non modello 3D o tracciato di taglio per la stampa.</p></div></div>
 <div class="db-object-actions"><button type="button" id="db-object-resize">Adatta il formato</button><button type="button" id="db-object-download">Salva anteprima PNG</button><button type="button" id="db-object-return">Continua a modificare</button></div>
 </div>`;
 document.body.appendChild(node);
 node.addEventListener('click',e=>{if(e.target===node)closeModal()});
 byId('db-object-close').onclick=closeModal;byId('db-object-return').onclick=closeModal;
 byId('db-object-download').onclick=()=>{render();const canvas=byId('db-product-canvas');try{canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.download='DesignBox-'+chosen+'-anteprima.png';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)},'image/png')}catch(e){console.warn(e);alert('Esportazione anteprima non disponibile su questo dispositivo.')}};
 byId('db-object-resize').onclick=()=>{closeModal();const sizeBtn=byId('sizeBtn');sizeBtn?.click();setTimeout(()=>{const opt=[...document.querySelectorAll('[data-popup-action]')].find(x=>x.dataset.popupAction==='size:'+current().size);if(opt)opt.click();else sizeBtn?.click()},80)};
 node.querySelectorAll('[data-db-object]').forEach(b=>b.addEventListener('click',()=>selected(b.dataset.dbObject)));
 selected(chosen);
}
function showModal(){const node=byId('db-object-overlay');if(!node)return;open=true;node.hidden=false;document.body.classList.add('db-object-open');selected(chosen);render();clearInterval(updateTimer);updateTimer=setInterval(()=>{if(open&&!document.hidden)render()},1800);byId('db-object-close').focus()}
function closeModal(){open=false;clearInterval(updateTimer);byId('db-object-overlay').hidden=true;document.body.classList.remove('db-object-open')}
function gradient(ctx,c1,c2,y0=60,y1=540){let g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,c1);g.addColorStop(1,c2);return g}
function fitImage(ctx,img,x,y,w,h,mode='cover'){if(!img)return;const r=mode==='cover'?Math.max(w/img.width,h/img.height):Math.min(w/img.width,h/img.height);let iw=img.width*r,ih=img.height*r;ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih)}
function getImage(src){if(!src)return null;let obj=loadedImages.get(src);if(obj)return obj.complete&&obj.naturalWidth?obj:null;obj=new Image();obj.onload=()=>{if(open)render()};obj.src=src;loadedImages.set(src,obj);return obj.complete&&obj.naturalWidth?obj:null}
function texture(){const data=waitCore()?window.__designboxDebug.getDoc():null;
 const canvas=document.createElement('canvas');canvas.width=620;canvas.height=Math.max(220,Math.min(800,Math.round(620*((data?.height||700)/(data?.width||1000)))));const c=canvas.getContext('2d');c.fillStyle=data?.bg||'#f8fafc';c.fillRect(0,0,canvas.width,canvas.height);if(!data)return canvas;
 c.save();c.scale(canvas.width/data.width,canvas.height/data.height);
 for(const el of data.layers||[]){try{c.save();c.globalAlpha=Number(el.opacity??1);c.translate(el.x+el.w/2,el.y+el.h/2);c.rotate((Number(el.rotation)||0)*Math.PI/180);c.translate(-el.w/2,-el.h/2);
 if(el.kind==='rect'){rect(c,0,0,el.w,el.h,Number(el.radius)||0);c.fillStyle=el.color;c.fill()}
 if(el.kind==='circle'){c.beginPath();c.ellipse(el.w/2,el.h/2,el.w/2,el.h/2,0,0,Math.PI*2);c.fillStyle=el.color;c.fill()}
 if(el.kind==='image'){const img=getImage(el.src);if(img){c.save();rect(c,0,0,el.w,el.h,Number(el.radius)||0);c.clip();fitImage(c,img,0,0,el.w,el.h);c.restore()}}
 if(el.kind==='text'){const fontSize=Number(el.size)||30;c.font=`${Number(el.weight)||700} ${fontSize}px "${String(el.font||'Arial').replace(/["\\]/g,'')}", sans-serif`;c.fillStyle=el.color||'#222';c.textBaseline='top';c.textAlign=el.align||'left';const x=el.align==='center'?el.w/2:el.align==='right'?el.w:0;let y=0;for(const paragraph of String(el.text||'').split('\n')){const words=paragraph.split(/\s+/);let line='';for(const word of words){const test=line?line+' '+word:word;if(c.measureText(test).width>el.w&&line){c.fillText(line,x,y);y+=fontSize*1.1;line=word}else line=test}c.fillText(line,x,y);y+=fontSize*1.1}}
 c.restore()}catch(e){c.restore();console.warn('Livello anteprima:',e)}}c.restore();return canvas}
function shadow(c,blur=30,color='rgba(29,32,48,.18)',off=18){c.shadowColor=color;c.shadowBlur=blur;c.shadowOffsetY=off}
function objectRender(c,img,id){const cw=720,ch=560;c.clearRect(0,0,cw,ch);c.fillStyle=gradient(c,'#f7f9fc','#e8edf1');c.fillRect(0,0,cw,ch);
 // surface and shadow
 c.fillStyle='rgba(85,97,110,.08)';c.beginPath();c.ellipse(360,493,246,26,0,0,Math.PI*2);c.fill();
 if(id==='sticker'){
 c.save();shadow(c,33,'rgba(42,45,67,.22)',16);rect(c,190,75,344,362,46);c.fillStyle='#fff';c.fill();c.restore();c.save();rect(c,199,84,326,344,36);c.clip();fitImage(c,img,199,84,326,344);c.restore();c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=9;rect(c,195,80,334,352,41);c.stroke();
 }else if(id==='label'){
 c.save();shadow(c,33,'rgba(41,48,69,.17)',13);rect(c,260,126,200,315,49);c.fillStyle=gradient(c,'#f1f3e8','#d0d9cb');c.fill();c.restore();c.save();rect(c,275,73,170,91,23);c.fillStyle='#e4e8e7';c.fill();c.fillStyle='#c0c8c7';c.fillRect(279,78,162,17);c.restore();
 c.save();rect(c,255,199,210,170,10);c.clip();fitImage(c,img,255,199,210,170);c.restore();c.fillStyle='rgba(0,0,0,.05)';c.fillRect(253,199,12,170);c.fillRect(450,199,13,170);
 }else if(id==='box'){
 c.save();shadow(c,26);c.fillStyle='#cbbba6';c.beginPath();c.moveTo(490,145);c.lineTo(565,112);c.lineTo(565,392);c.lineTo(490,437);c.closePath();c.fill();c.beginPath();c.moveTo(170,145);c.lineTo(244,112);c.lineTo(565,112);c.lineTo(490,145);c.closePath();c.fillStyle='#e7d9c5';c.fill();c.fillStyle='#fffdf7';c.fillRect(170,145,320,292);c.restore();c.save();c.beginPath();c.rect(170,145,320,292);c.clip();fitImage(c,img,170,145,320,292);c.restore();c.strokeStyle='rgba(80,60,45,.11)';c.strokeRect(170,145,320,292);
 }else if(id==='card'){
 c.save();c.translate(356,291);c.rotate(-.11);shadow(c,30);rect(c,-209,-118,436,258,18);c.fillStyle='#fff';c.fill();c.restore();c.save();c.translate(356,291);c.rotate(-.11);rect(c,-206,-115,430,252,15);c.clip();fitImage(c,img,-206,-115,430,252);c.restore();
 }else if(id==='bag'){
 c.save();c.strokeStyle='#b7ac96';c.lineWidth=22;c.lineCap='round';c.beginPath();c.moveTo(278,176);c.bezierCurveTo(276,32,445,34,443,176);c.stroke();shadow(c,23);c.beginPath();c.moveTo(212,161);c.lineTo(503,161);c.lineTo(529,460);c.lineTo(184,460);c.closePath();c.fillStyle=gradient(c,'#efe5d3','#d5c6ad',160,465);c.fill();c.restore();c.save();rect(c,254,239,211,183,5);c.clip();fitImage(c,img,254,239,211,183);c.restore();
 }
}
let lastDrawId=0;function render(){if(lastRendering||!open)return;lastRendering=true;try{const c=byId('db-product-canvas')?.getContext('2d');if(c)objectRender(c,texture(),chosen)}catch(e){console.error('Anteprima oggetto:',e)}finally{lastRendering=false;lastDrawId++}}
function templateEnhance(){const root=byId('sidebarContent'),heading=byId('sectionTitle');if(!root||!heading||!root.querySelector('.template-grid')||root.dataset.objectEnhanced==='yes'||enhancing)return;
 enhancing=true;root.dataset.objectEnhanced='yes';heading.textContent='Cosa vuoi creare?';const existing=document.createElement('div');existing.className='db-existing-templates';while(root.firstChild)existing.appendChild(root.firstChild);
 const lead=make('section','db-start-guide');lead.innerHTML=`<p class="db-guide-label">INIZIA DALL'OGGETTO</p><h3>Scegli il risultato.</h3><p>Non serve imparare un editor: scegli dove finirà la tua grafica.</p><div class="db-guide-grid">${kinds.map(k=>`<button type="button" data-db-object="${k.id}"><b>${k.glyph}</b><strong>${k.label}</strong><small>${k.hint}</small></button>`).join('')}</div><p class="db-guide-hint">Il progetto rimane modificabile. Le anteprime sono simulazioni locali.</p>`;
 const details=make('details','db-advanced-templates');details.innerHTML='<summary>Usa una grafica già pronta <span>opzionale</span></summary>';details.appendChild(existing);root.append(lead,details);
 lead.querySelectorAll('[data-db-object]').forEach(b=>b.addEventListener('click',()=>{selected(b.dataset.dbObject);showModal()}));enhancing=false;
}
function buildHome(){
 if(byId('db-product-home'))return;
 const app=byId('app'),work=app?.querySelector('.workspace');if(!app||!work)return;
 const home=make('section','db-product-home');home.id='db-product-home';home.setAttribute('aria-label','DesignBox Product Studio');
 home.innerHTML=`<div class="db-home-inner"><div class="db-product-topline"><span class="db-product-tag">DESIGNBOX PRODUCT STUDIO / OFFLINE</span><span>Dal concept al prodotto, senza cloud</span></div><div class="db-home-main"><div class="db-home-left"><p class="db-home-eyebrow">Scegli • Personalizza • Guarda il risultato</p><h1>Non solo una grafica.<br/><em>Un oggetto vero.</em></h1><p class="db-home-intro">Adesivi, etichette, confezioni e piccoli prodotti personalizzati. Scegli dove applicare il tuo design: l’anteprima è immediata, anche senza Internet.</p><p class="db-object-subhead">01 / Scegli il prodotto</p><div class="db-home-catalog" role="group" aria-label="Oggetti disponibili">${kinds.map(k=>`<button type="button" class="db-home-object" data-db-home-kind="${k.id}" aria-pressed="false"><span class="db-home-symbol" aria-hidden="true">${k.glyph}</span><strong>${k.label}</strong></button>`).join('')}</div><div class="db-home-ctas"><button type="button" class="db-home-primary" id="db-home-personalize">Personalizza grafica ↗</button><button type="button" class="db-home-secondary" id="db-home-projects">I miei progetti</button></div><div class="db-home-assurance"><span>Senza account</span><span>Salvataggio locale</span><span>Nessun credito</span></div></div><div class="db-home-visual"><div class="db-home-visual-head"><span>02 / ANTEPRIMA SUL PRODOTTO</span><b id="db-home-kind-title">ADESIVO</b></div><canvas id="db-home-canvas" width="720" height="560" role="img" aria-label="Anteprima del progetto applicato al prodotto scelto"></canvas><div class="db-home-visual-foot"><div><strong id="db-home-caption">Il tuo adesivo</strong><small>Simulazione locale · Non è un file di stampa</small></div><button type="button" id="db-home-download">Salva PNG ↓</button></div></div></div><div class="db-home-steps"><div class="db-home-step"><b>1</b><div><strong>Scegli l’oggetto</strong><small>Adesivo, packaging, etichetta, shopper o biglietto</small></div></div><div class="db-home-step"><b>2</b><div><strong>Personalizza</strong><small>Modifica colori, testi, logo e immagini</small></div></div><div class="db-home-step"><b>3</b><div><strong>Guarda e salva</strong><small>Scarica l’anteprima oppure il file grafico</small></div></div></div></div>`;
 app.insertBefore(home,work);
 const btn=make('button','','← Oggetti');btn.type='button';btn.id='db-return-home';btn.setAttribute('aria-label','Torna ai prodotti');const title=byId('projectTitle')?.closest('.project-name');title?.parentElement?.insertBefore(btn,title);btn.onclick=goHome;
 home.querySelectorAll('[data-db-home-kind]').forEach(el=>{el.onclick=()=>{selected(el.dataset.dbHomeKind);renderHome()}});
 byId('db-home-personalize').onclick=()=>enterEditor();
 byId('db-home-projects').onclick=()=>enterEditor('projects');
 byId('db-home-download').onclick=()=>downloadHome();
 document.body.classList.add('db-home-mode');renderHome();
 let tries=0;let updater=setInterval(()=>{if(++tries>32||waitCore()){clearInterval(updater);renderHome()}},200);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('db-home-mode'))renderHome()});
}
function renderHome(){
 document.querySelectorAll('[data-db-home-kind]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.dbHomeKind===chosen)));
 const title=byId('db-home-kind-title');if(title)title.textContent=current().label.toUpperCase();
 const caption=byId('db-home-caption');if(caption)caption.textContent='Il tuo '+current().label.toLowerCase();
 const canvas=byId('db-home-canvas');if(!canvas)return;
 try{objectRender(canvas.getContext('2d'),texture(),chosen)}catch(error){console.warn('Anteprima iniziale:',error)}
}
function enterEditor(section){document.body.classList.remove('db-home-mode');if(section){document.querySelector('.rail [data-section="'+section+'"]')?.click()}requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));setTimeout(()=>byId('fitBtn')?.click(),160)});}
function goHome(){document.body.classList.add('db-home-mode');byId('scrim')?.click();renderHome()}
function downloadHome(){let canvas=byId('db-home-canvas');if(!canvas)return;renderHome();try{canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='DesignBox-'+chosen+'-anteprima.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)},'image/png')}catch(e){alert('Download non disponibile: apri l’editor e usa Esporta.')}}
function bootstrap(){if(byId('db-object-overlay'))return;
 document.querySelectorAll('[data-section="templates"]').forEach(b=>{const t=b.querySelector('span:last-child');if(t)t.textContent='Oggetti'});
 const description=document.querySelector('meta[name="description"]');if(description)description.content='DesignBox: progetta adesivi, etichette, packaging e oggetti con anteprime locali, anche offline.';
 const header=byId('exportBtn');const preview=make('button','db-object-trigger','<span aria-hidden="true">⬡</span><span>Anteprima oggetto</span>');preview.id='db-preview-trigger';preview.type='button';preview.onclick=showModal;header?.parentElement?.insertBefore(preview,header);
 buildModal();buildHome();
 const observer=new MutationObserver(()=>{if(!enhancing)templateEnhance()});const root=byId('sidebarContent');if(root)observer.observe(root,{childList:true});templateEnhance();
 try { if(matchMedia('(max-width:700px)').matches && !localStorage.getItem('designbox-product-intro-v15')){localStorage.setItem('designbox-product-intro-v15','1');setTimeout(()=>document.querySelector('.mobile-tab[data-section="templates"]')?.click(),650)} } catch(e) {}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){e.stopPropagation();closeModal()}},true);
 // Reconcile offline status with the actual cache used by this release.
 const syncOffline=async()=>{try{const cache=await caches.open('designbox-static-v1.5.1');let good=!!(await cache.match('./index.html'))&&!!(await cache.match('./loader.js'));if(good){const el=byId('netStatus'),txt=el?.querySelector('span:last-child');if(el&&txt){txt.textContent=navigator.onLine?'Offline pronto':'Offline attivo';el.dataset.ready='yes';}const footer=byId('footerStatus');if(footer)footer.textContent=navigator.onLine?'Offline pronto · dati sul dispositivo':'Offline · i dati restano sul dispositivo';}}catch(e){console.warn(e)}};
 window.addEventListener('online',syncOffline);window.addEventListener('offline',syncOffline);navigator.serviceWorker?.ready.then(()=>setTimeout(syncOffline,400)).catch(()=>{});setTimeout(syncOffline,1700);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
})();

/* Snapshot v1.5.1 */