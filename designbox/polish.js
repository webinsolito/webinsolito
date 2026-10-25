/* DesignBox 1.3: mobile shortcuts and template discovery, entirely offline. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const started=Date.now();
function start(){
 if(!window.__designboxDebug){if(Date.now()-started<12000)setTimeout(start,90);return}
 const sidebar=$('sidebarContent'),inspector=$('inspectorContent'),stage=$('stage');
 if(!sidebar||!inspector||!stage)return;
 const bar=document.createElement('div');bar.className='db-quickbar';bar.id='db-quickbar';bar.hidden=true;
 bar.setAttribute('aria-label','Azioni rapide per elemento selezionato');
 bar.innerHTML='<button type="button" class="primary" data-db="edit">✎ Modifica</button><button type="button" data-db="duplicate">▢ Copia</button><button type="button" data-db="front">⇧ Sopra</button><button type="button" class="danger" data-db="delete">✕ Elimina</button>';
 document.body.appendChild(bar);
 function refreshBar(){
  const hasSelection=!$('editSelectionBtn')?.hidden&&!!$('duplicateLayer');
  const overlay=$('inspector')?.classList.contains('open')||$('sidebar')?.classList.contains('open')||!$('modalBackdrop')?.hidden;
  bar.hidden=!hasSelection||overlay;
 }
 bar.addEventListener('click',e=>{
  const command=e.target.closest('[data-db]')?.dataset.db;
  if(!command)return;
  if(command==='edit'){
   $('sidebar')?.classList.remove('open');$('inspector')?.classList.add('open');$('scrim').hidden=false;
   const text=$('propText');if(text)requestAnimationFrame(()=>text.focus());
  }else{
   const target={duplicate:'duplicateLayer',front:'bringFront',delete:'removeLayer'}[command];
   $(target)?.click();
  }
  refreshBar();
 });
 new MutationObserver(()=>queueMicrotask(refreshBar)).observe(inspector,{childList:true,subtree:false});
 const panelsObserver=new MutationObserver(refreshBar);
 for(const el of [$('sidebar'),$('inspector'),$('modalBackdrop')])if(el)panelsObserver.observe(el,{attributes:true,attributeFilter:['class','hidden']});
 stage.addEventListener('pointerup',()=>setTimeout(refreshBar,10));
 $('scrim')?.addEventListener('click',()=>setTimeout(refreshBar,10));
 let active='Tutti',query='';
 function upgradeTemplates(){
  if($('db-template-search')||!sidebar.querySelector('.template-grid'))return;
  const grid=sidebar.querySelector('.template-grid');
  const cards=[...grid.querySelectorAll('[data-template]')];
  const categories=['Tutti',...new Set(cards.map(c=>c.querySelector('small')?.textContent?.trim()).filter(Boolean))];
  const ui=document.createElement('div');ui.className='db-template-controls';
  ui.innerHTML='<div class="db-search-wrap"><input id="db-template-search" class="db-search" type="search" placeholder="Cerca un modello…" aria-label="Cerca un modello" autocomplete="off"></div><div class="db-categories" role="group" aria-label="Filtra per categoria"></div>';
  const chips=ui.querySelector('.db-categories');
  for(const category of categories){const button=document.createElement('button');button.type='button';button.className='db-chip';button.textContent=category;button.dataset.category=category;chips.appendChild(button)}
  const empty=document.createElement('div');empty.className='db-empty';empty.textContent='Nessun modello trovato. Prova un’altra parola.';empty.hidden=true;
  grid.before(ui);grid.after(empty);
  function apply(){
   let n=0;
   for(const c of cards){
    const label=(c.textContent||'').toLocaleLowerCase('it');
    const cat=c.querySelector('small')?.textContent?.trim();
    const visible=(active==='Tutti'||cat===active)&&label.includes(query);
    c.hidden=!visible;if(visible)n++;
   }
   empty.hidden=n>0;
   chips.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.category===active);b.setAttribute('aria-pressed',String(b.dataset.category===active))});
  }
  ui.querySelector('input').value=query;
  ui.querySelector('input').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase('it');apply()});
  chips.addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){active=b.dataset.category;apply()}});
  apply();
 }
 new MutationObserver(()=>{if(!$('db-template-search')&&sidebar.querySelector('.template-grid'))upgradeTemplates()}).observe(sidebar,{childList:true});
 upgradeTemplates();
 const footer=sidebar.querySelector('.sidebar-footer');if(footer)footer.title='I progetti sono locali. Esporta un backup dalla sezione Progetti.';
 const saveLabel=$('saveStatus');
 if(saveLabel)new MutationObserver(()=>{saveLabel.dataset.state=(saveLabel.textContent||'').includes('Salvato')?'saved':'pending'}).observe(saveLabel,{childList:true,characterData:true,subtree:true});
 refreshBar();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();