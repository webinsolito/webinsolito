import {OfflineDB} from './offline.js';
import {Session} from './api.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

const ICONS={
  today:'<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M9.5 20v-6h5v6"/>',
  garage:'<path d="M5 10.5 7 6h10l2 4.5"/><path d="M3.5 12.5h17v5h-17z"/><path d="M6.5 17.5v2M17.5 17.5v2"/><circle cx="7" cy="14.8" r="1"/><circle cx="17" cy="14.8" r="1"/>',
  clients:'<path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M18 9.5a3 3 0 0 1 0 5.8M20.5 20v-1a3.5 3.5 0 0 0-2.5-3.3"/>',
  calendar:'<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/><path d="M8 13h3M13 13h3M8 16.5h3"/>',
  documenti:'<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4M10 12h5M10 15.5h5"/>',
  vendite:'<path d="M4 19V9l8-5 8 5v10"/><path d="M8 19v-5h8v5M9 9h6"/>',
  fatture:'<path d="M7 3.5h10v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3z"/><path d="M10 8h4M9.5 12h5M10 16h4"/>',
  finanze:'<path d="M4 19.5h16M6.5 17V11M10.2 17V7.5M13.8 17V12.5M17.5 17V5"/>',
  autoscout:'<path d="M5 10.5 7 6h10l2 4.5"/><path d="M3.5 12.5h17v5h-17z"/><circle cx="7" cy="14.8" r="1"/><circle cx="17" cy="14.8" r="1"/><path d="M12 3v2"/>',
  instagram:'<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.3" cy="6.8" r=".8"/>',
  inbox:'<path d="M4 5h16v13H4z"/><path d="M4 13h4l1.5 2h5L16 13h4"/>',
  reports:'<path d="M5 20V9M10 20V4M15 20v-7M20 20H3"/>',
  admin:'<path d="M12 3.5 19 6v5.5c0 4.2-2.7 7-7 9-4.3-2-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  car:'<path d="M5 10.5 7 6h10l2 4.5"/><path d="M3.5 12.5h17v5h-17z"/><circle cx="7" cy="14.8" r="1"/><circle cx="17" cy="14.8" r="1"/>',
  person:'<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  sync:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.5A7 7 0 0 1 18.6 7L20 12M4 12l1.4 5A7 7 0 0 0 17.9 15.5"/>'
};
const LABELS={today:'OGGI',garage:'GARAGE',clients:'CLIENTI',calendar:'CALENDARIO',documenti:'DOCUMENTI',vendite:'VENDITE',fatture:'FATTURE',finanze:'FINANZE',autoscout:'AUTOSCOUT',instagram:'INSTAGRAM',inbox:'INBOX',reports:'REPORT',admin:'ADMIN'};
const svg=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.more}</svg>`;

let searchData={vehicles:[],customers:[]};
let createMenu=null;
let decorateQueued=false;

function roleName(){const r=Session.get()?.profile?.role;return ({ADMIN:'Amministratore',AMMINISTRAZIONE:'Amministrazione',VENDITORE:'Venditore',OPERATORE:'Operatore'})[r]||r||'Utente'}
function dealerId(){return Session.get()?.dealer?.id||null}

function ensurePremiumCss(){
  if(document.querySelector('link[data-m23-premium]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='./premium-ui.css?v=1.0.0';link.dataset.m23Premium='1';document.head.appendChild(link);
}

function decorateButton(button){
  if(!button||button.dataset.m23Decorated==='1')return;
  const mobile=Boolean(button.closest('.mobile-nav'));
  const view=button.dataset.view||'more';
  const label=LABELS[view]||button.querySelector('small')?.textContent?.trim()||view.toUpperCase();
  button.dataset.m23Decorated='1';
  button.innerHTML=`<span class="m23-nav-icon">${svg(view)}</span>${mobile?`<small>${esc(label)}</small>`:`<span class="m23-nav-label">${esc(label)}</span>`}`;
}
function decorateNav(){
  $$('.side .navbtn[data-view],.mobile-nav .navbtn[data-view]').forEach(decorateButton);
  const more=$('.mobile-nav .m23-more-btn');
  if(more&&more.dataset.m23Decorated!=='1'){
    more.dataset.m23Decorated='1';more.innerHTML=`<span class="m23-nav-icon">${svg('more')}</span><small>ALTRO</small>`;
  }
}
function scheduleDecorate(){if(decorateQueued)return;decorateQueued=true;requestAnimationFrame(()=>{decorateQueued=false;decorateNav()})}

function addHeaderTools(){
  const topRight=$('.topright');if(!topRight||$('#m23GlobalSearchBtn'))return;
  const search=document.createElement('button');search.type='button';search.id='m23GlobalSearchBtn';search.className='m23-top-search';search.innerHTML=`${svg('search')}<span>Cerca auto, targa o cliente…</span><kbd>⌘ K</kbd>`;search.onclick=openCommand;
  const create=document.createElement('button');create.type='button';create.id='m23CreateBtn';create.className='m23-create';create.innerHTML=`${svg('plus')}<span>Nuovo</span>`;create.onclick=e=>toggleCreateMenu(e.currentTarget);
  topRight.prepend(create);topRight.prepend(search);
  const dealerMeta=$('.dealer span');if(dealerMeta)dealerMeta.textContent=`${roleName()} · sessione attiva`;

  if(!$('#m23MobileFab')){const fab=document.createElement('button');fab.type='button';fab.id='m23MobileFab';fab.className='m23-mobile-fab';fab.setAttribute('aria-label','Nuova operazione');fab.textContent='+';fab.onclick=e=>toggleCreateMenu(e.currentTarget);document.body.appendChild(fab)}
}

function createCommand(){
  if($('#m23Command'))return;
  const root=document.createElement('div');root.id='m23Command';root.className='m23-command';root.hidden=true;
  root.innerHTML=`<section class="m23-command-panel" role="dialog" aria-modal="true" aria-label="Ricerca globale"><div class="m23-command-input">${svg('search')}<input id="m23CommandInput" autocomplete="off" placeholder="Cerca auto, targa, telaio, cliente, telefono…"><button type="button" id="m23CommandClose" aria-label="Chiudi">×</button></div><div class="m23-command-results" id="m23CommandResults"></div></section>`;
  document.body.appendChild(root);
  root.addEventListener('click',e=>{if(e.target===root)closeCommand()});
  $('#m23CommandClose').onclick=closeCommand;
  $('#m23CommandInput').addEventListener('input',renderSearch);
  $('#m23CommandResults').addEventListener('click',handleResultClick);
}

async function loadSearchData(){
  const id=dealerId();if(!id){searchData={vehicles:[],customers:[]};return}
  const [vehicles,customers]=await Promise.all([OfflineDB.list('vehicles',id),OfflineDB.list('customers',id)]);
  searchData={vehicles:vehicles.filter(x=>!x.deleted_at),customers:customers.filter(x=>!x.deleted_at)};
}
async function openCommand(){
  createCommand();closeCreateMenu();const root=$('#m23Command');root.hidden=false;document.documentElement.style.overflow='hidden';
  const input=$('#m23CommandInput');input.value='';$('#m23CommandResults').innerHTML='<div class="m23-command-empty">Caricamento…</div>';input.focus();
  try{await loadSearchData();renderSearch()}catch(err){console.warn('Ricerca globale non disponibile',err);$('#m23CommandResults').innerHTML='<div class="m23-command-empty">Ricerca locale non disponibile.</div>'}
}
function closeCommand(){const root=$('#m23Command');if(root)root.hidden=true;document.documentElement.style.overflow=''}
function quickActions(){return `<div class="m23-result-group">AZIONI RAPIDE</div>
  <button class="m23-result" data-action="vehicle"><span class="m23-result-icon">${svg('car')}</span><span class="m23-result-copy"><b>Nuova auto</b><small>Aggiungi un veicolo al Garage</small></span><span class="m23-result-arrow">→</span></button>
  <button class="m23-result" data-action="customer"><span class="m23-result-icon">${svg('person')}</span><span class="m23-result-copy"><b>Nuovo cliente</b><small>Crea subito una nuova scheda cliente</small></span><span class="m23-result-arrow">→</span></button>
  <button class="m23-result" data-action="sync"><span class="m23-result-icon">${svg('sync')}</span><span class="m23-result-copy"><b>Sincronizza</b><small>Invia le modifiche locali adesso</small></span><span class="m23-result-arrow">→</span></button>`}
function renderSearch(){
  const input=$('#m23CommandInput'),out=$('#m23CommandResults');if(!input||!out)return;
  const q=normalize(input.value);if(q.length<2){out.innerHTML=quickActions();return}
  const vehicles=searchData.vehicles.filter(v=>normalize(`${v.brand} ${v.model} ${v.plate||''} ${v.vin||''} ${v.year||''}`).includes(q)).slice(0,7);
  const customers=searchData.customers.filter(c=>normalize(`${c.first_name||''} ${c.last_name||''} ${c.phone||''} ${c.email||''} ${c.fiscal_code||''}`).includes(q)).slice(0,7);
  let html='';
  if(vehicles.length){html+='<div class="m23-result-group">AUTO</div>'+vehicles.map(v=>`<button class="m23-result" data-kind="vehicle" data-id="${esc(v.id)}"><span class="m23-result-icon">${svg('car')}</span><span class="m23-result-copy"><b>${esc(`${v.brand||''} ${v.model||''}`.trim()||'Veicolo')}</b><small>${esc([v.plate,v.year,v.status].filter(Boolean).join(' · ')||'Apri scheda veicolo')}</small></span><span class="m23-result-arrow">→</span></button>`).join('')}
  if(customers.length){html+='<div class="m23-result-group">CLIENTI</div>'+customers.map(c=>`<button class="m23-result" data-kind="customer" data-id="${esc(c.id)}"><span class="m23-result-icon">${svg('person')}</span><span class="m23-result-copy"><b>${esc(`${c.first_name||''} ${c.last_name||''}`.trim()||'Cliente')}</b><small>${esc([c.phone,c.email,c.status].filter(Boolean).join(' · ')||'Apri scheda cliente')}</small></span><span class="m23-result-arrow">→</span></button>`).join('')}
  out.innerHTML=html||'<div class="m23-command-empty">Nessun risultato. Prova con targa, modello, nome o telefono.</div>';
}
function triggerAction(action){
  closeCommand();closeCreateMenu();
  if(action==='vehicle')$('#addVehicleBtn')?.click();
  if(action==='customer')$('#addCustomerBtn')?.click();
  if(action==='sync')$('#syncBtn')?.click();
}
function openClient(id,attempt=0){
  const nav=$('.navbtn[data-view="clients"]');nav?.click();
  requestAnimationFrame(()=>{const safe=window.CSS?.escape?CSS.escape(id):String(id).replace(/["\\]/g,'');const card=$(`[data-client-id="${safe}"]`);if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.click()}else if(attempt<24)setTimeout(()=>openClient(id,attempt+1),80)})
}
function handleResultClick(e){
  const b=e.target.closest('.m23-result');if(!b)return;
  if(b.dataset.action){triggerAction(b.dataset.action);return}
  const {kind,id}=b.dataset;closeCommand();if(kind==='vehicle')window.dispatchEvent(new CustomEvent('dealer:open-vehicle',{detail:{id}}));if(kind==='customer')openClient(id)
}

function makeCreateMenu(){
  if(createMenu)return createMenu;
  createMenu=document.createElement('div');createMenu.className='m23-create-menu';createMenu.hidden=true;
  createMenu.innerHTML=`<button data-action="vehicle"><span class="m23-menu-ico">🚗</span><span>Nuova auto<small>Inserisci nel Garage</small></span></button><button data-action="customer"><span class="m23-menu-ico">👤</span><span>Nuovo cliente<small>Crea scheda CRM</small></span></button><button data-action="sync"><span class="m23-menu-ico">↻</span><span>Sincronizza<small>Invia modifiche locali</small></span></button>`;
  createMenu.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)triggerAction(b.dataset.action)});document.body.appendChild(createMenu);return createMenu
}
function toggleCreateMenu(anchor){
  const menu=makeCreateMenu();if(!menu.hidden){closeCreateMenu();return}closeCommand();menu.hidden=false;const r=anchor.getBoundingClientRect();const width=220;let left=Math.min(innerWidth-width-10,Math.max(10,r.right-width));let top=r.bottom+8;if(top+160>innerHeight)top=Math.max(10,r.top-168);menu.style.left=`${left}px`;menu.style.top=`${top}px`;
}
function closeCreateMenu(){if(createMenu)createMenu.hidden=true}

function bindKeyboard(){document.addEventListener('keydown',e=>{const tag=e.target?.tagName;if((e.key==='k'&&(e.metaKey||e.ctrlKey))||(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(tag))){e.preventDefault();openCommand()}else if(e.key==='Escape'){closeCommand();closeCreateMenu()}})}
function bindDismiss(){document.addEventListener('click',e=>{if(createMenu&&!createMenu.hidden&&!e.target.closest('.m23-create-menu,#m23CreateBtn,#m23MobileFab'))closeCreateMenu()});window.addEventListener('resize',closeCreateMenu)}

function bootPremium(){ensurePremiumCss();createCommand();addHeaderTools();decorateNav();bindKeyboard();bindDismiss();new MutationObserver(scheduleDecorate).observe(document.body,{childList:true,subtree:true});document.body.classList.add('m23-premium-ready')}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootPremium,{once:true});else bootPremium();
