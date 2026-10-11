const PRIMARY=['today','garage','clients','calendar'];
const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const MOBILE_PRIMARY_VIEWS=Object.freeze([...PRIMARY,'more']);
let scheduled=false;

function ensureStyle(){if($('#m23MobileShellStyle'))return;const s=document.createElement('style');s.id='m23MobileShellStyle';s.textContent=`
@media(max-width:820px){
 body .mobile-nav{display:grid!important;grid-template-columns:repeat(5,1fr)!important;overflow:visible!important;gap:0!important;padding-left:2px!important;padding-right:2px!important}
 body .mobile-nav .navbtn{min-width:0!important;flex:1 1 auto!important;min-height:56px!important;font-size:18px!important}
 body .mobile-nav .m23-mobile-extra{display:none!important}
 body .mobile-nav .m23-more-btn{display:grid!important;border:0;background:transparent;color:#788291;place-items:center;gap:1px;font-size:18px;min-height:56px}
 body .mobile-nav .m23-more-btn.active{color:#111827}
 .m23-more-overlay{position:fixed;inset:0;z-index:85;background:rgba(6,10,18,.44);display:flex;align-items:flex-end}
 .m23-more-sheet{width:100%;background:#fff;border-radius:22px 22px 0 0;padding:14px 14px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.18)}
 .m23-more-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.m23-more-head b{font-size:16px}.m23-more-close{border:0;background:#eef1f4;border-radius:10px;width:38px;height:38px;font-size:18px}
 .m23-more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.m23-more-grid button{min-height:54px;text-align:left;border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 12px;font-weight:850;color:#172033}.m23-more-grid button small{display:block;color:var(--muted);margin-top:2px;font-size:10px}
}
@media(min-width:821px){.m23-more-btn,.m23-more-overlay{display:none!important}}
`;document.head.appendChild(s)}
function label(button){const small=button.querySelector('small')?.textContent?.trim();const txt=button.textContent?.replace(small||'','').trim();return {title:small||button.dataset.view?.toUpperCase()||'ALTRO',icon:txt||'•'}}
function close(){const o=$('#m23MoreOverlay');if(o&&!o.hidden)o.hidden=true}
function open(){const o=$('#m23MoreOverlay');if(!o)return;const grid=$('#m23MoreGrid'),extras=$$('.mobile-nav .navbtn.m23-mobile-extra'),sig=extras.map(b=>`${b.dataset.view}:${label(b).title}`).join('|');if(grid.dataset.extraSig!==sig){grid.dataset.extraSig=sig;grid.innerHTML='';for(const original of extras){const meta=label(original),b=document.createElement('button');b.type='button';b.innerHTML=`${meta.icon} <b>${meta.title}</b><small>Apri sezione</small>`;b.onclick=()=>{original.click();close();syncActive()};grid.appendChild(b)}}o.hidden=false}
function syncActive(){const more=$('.mobile-nav .m23-more-btn');if(!more)return;const active=$$('.mobile-nav .navbtn.m23-mobile-extra').some(b=>b.classList.contains('active'));if(more.classList.contains('active')!==active)more.classList.toggle('active',active)}
function organize(){const nav=$('.mobile-nav');if(!nav)return;ensureStyle();for(const b of $$('.navbtn[data-view]',nav)){const extra=!PRIMARY.includes(b.dataset.view);if(b.classList.contains('m23-mobile-extra')!==extra)b.classList.toggle('m23-mobile-extra',extra)}
  let more=nav.querySelector('.m23-more-btn');if(!more){more=document.createElement('button');more.type='button';more.className='m23-more-btn';more.innerHTML='•••<small>ALTRO</small>';more.onclick=open;nav.appendChild(more)}
  if(!$('#m23MoreOverlay')){const o=document.createElement('div');o.id='m23MoreOverlay';o.className='m23-more-overlay';o.hidden=true;o.innerHTML='<div class="m23-more-sheet"><div class="m23-more-head"><b>Altre sezioni</b><button class="m23-more-close" type="button">×</button></div><div class="m23-more-grid" id="m23MoreGrid"></div></div>';document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)close()});o.querySelector('.m23-more-close').onclick=close}
  syncActive();
}
function scheduleOrganize(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;organize()})}
document.addEventListener('click',e=>{const b=e.target.closest?.('.mobile-nav .navbtn[data-view]');if(b)setTimeout(syncActive,0)});new MutationObserver(scheduleOrganize).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('resize',()=>{if(innerWidth>820)close();scheduleOrganize()});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleOrganize,{once:true});else scheduleOrganize();
