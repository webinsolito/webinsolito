import {Session} from './api.js';
import {mutationCount,mutationIssues,retryFailedMutations,resolveConflictKeepLocal,resolveConflictUseServer} from './offline.js';
import {syncIssueLabel} from './sync-conflict.js?v=1.9.5';

const $=(s,r=document)=>r.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false,scheduled=false;
function dealerId(){return Session.get()?.dealer?.id||null}
function entityLabel(v){return ({vehicles:'Auto',customers:'Cliente',customer_interactions:'Contatto',calendar_events:'Calendario',contracts:'Contratto',documents:'Documento',vehicle_work_items:'Lavoro',vehicle_media:'Foto',vehicle_events:'Evento',vehicle_financials:'Dati economici',vehicle_costs:'Spesa',invoices:'Fattura'})[v]||v}
function kickSync(){setTimeout(()=>$('#syncBtn')?.click(),0)}
function ensureStyle(){if($('#m23SyncRecoveryStyle'))return;const s=document.createElement('style');s.id='m23SyncRecoveryStyle';s.textContent=`
.sync-recovery{margin:-4px 0 13px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:grid;gap:8px}.sync-recovery[hidden]{display:none!important}.sync-recovery-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sync-recovery-head b{font-size:10px}.sync-recovery-head span{font-size:9px;color:var(--muted)}.sync-recovery-list{display:grid;gap:7px}.sync-issue{border-radius:11px;background:#fff6e8;border:1px solid #f0d6aa;padding:9px;display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center}.sync-issue.conflict{background:#fff0f1;border-color:#efc0c3}.sync-issue b{display:block;font-size:9px}.sync-issue small{display:block;font-size:8px;color:#6b7280;margin-top:3px}.sync-issue-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sync-issue-actions button,.sync-retry-all{border:0;border-radius:9px;padding:8px 9px;font-size:8px;font-weight:900}.sync-issue-actions button{background:#fff;border:1px solid rgba(0,0,0,.1)}.sync-issue-actions .keep{background:#111827;color:#fff}.sync-retry-all{background:#111827;color:#fff}@media(max-width:720px){.sync-recovery-head,.sync-issue{grid-template-columns:1fr;display:grid}.sync-issue-actions{justify-content:stretch}.sync-issue-actions button,.sync-retry-all{min-height:42px;flex:1}.sync-recovery{padding:10px}}
`;document.head.appendChild(s)}
function issueSignature(pending,issues){return JSON.stringify([pending,...issues.map(m=>[m.id,m.status,m.entity,m.last_error||'',m.conflict_code||'',m.conflict_server_updated_at||''])])}
async function refresh(){
  const id=dealerId(),bar=$('.syncbar');if(!id||!bar)return;ensureStyle();let root=$('#syncRecovery');if(!root){root=document.createElement('section');root.id='syncRecovery';root.className='sync-recovery';bar.after(root)}
  const [pending,issues]=await Promise.all([mutationCount(id),mutationIssues(id)]),conflicts=issues.filter(x=>x.status==='CONFLICT'),failed=issues.filter(x=>x.status==='FAILED');
  if(!issues.length){if(!root.hidden)root.hidden=true;root.dataset.syncSig='';return}
  const sig=issueSignature(pending,issues);if(root.dataset.syncSig===sig){if(root.hidden)root.hidden=false;return}root.dataset.syncSig=sig;if(root.hidden)root.hidden=false;
  root.innerHTML=`<div class="sync-recovery-head"><div><b>${conflicts.length?'Conflitti da scegliere':'Sincronizzazione da riprovare'}</b><span> · ${pending} in coda${conflicts.length?` · ${conflicts.length} conflitt${conflicts.length===1?'o':'i'}`:''}</span></div>${failed.length?'<button class="sync-retry-all" id="syncRetryAll">Riprova errori</button>':''}</div><div class="sync-recovery-list">${issues.map(m=>`<div class="sync-issue ${m.status==='CONFLICT'?'conflict':''}" data-sync-id="${esc(m.id)}"><div><b>${esc(entityLabel(m.entity))}</b><small>${m.status==='CONFLICT'?esc(syncIssueLabel(m.conflict_code)):esc(m.last_error||'Operazione non sincronizzata')}</small></div><div class="sync-issue-actions">${m.status==='CONFLICT'?'<button data-use-server>Usa server</button><button class="keep" data-keep-local>Mantieni locale</button>':'<button class="keep" data-retry-one>Riprova</button>'}</div></div>`).join('')}</div>`;
  $('#syncRetryAll',root)?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await retryFailedMutations(id);kickSync()}finally{busy=false;root.dataset.syncSig='';refresh()}});
  root.querySelectorAll('[data-sync-id]').forEach(row=>{
    const mid=row.dataset.syncId;
    row.querySelector('[data-use-server]')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await resolveConflictUseServer(mid)}finally{busy=false;root.dataset.syncSig='';refresh()}});
    row.querySelector('[data-keep-local]')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await resolveConflictKeepLocal(mid);kickSync()}finally{busy=false;root.dataset.syncSig='';refresh()}});
    row.querySelector('[data-retry-one]')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{const issues=await mutationIssues(id),m=issues.find(x=>x.id===mid);if(m?.status==='FAILED')await retryFailedMutations(id);kickSync()}finally{busy=false;root.dataset.syncSig='';refresh()}});
  });
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;refresh().catch(console.warn)},80)}
window.addEventListener('dealer:queue-changed',schedule);window.addEventListener('dealer:session',schedule);window.addEventListener('online',schedule);window.addEventListener('offline',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
