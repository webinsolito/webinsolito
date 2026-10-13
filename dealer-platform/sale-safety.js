import {OfflineDB} from './offline.js';

const LOCKED_TERM_FIELDS=['contract_number','contract_date','customer_id','vehicle_id','price','deposit','notes'];
let scheduled=false;

function lockSelect(select){
  if(!select||select.dataset.m23Locked)return;
  select.dataset.m23Locked='1';
  const value=select.value;
  select.setAttribute('aria-disabled','true');
  select.style.pointerEvents='none';
  select.style.background='#f3f4f6';
  select.addEventListener('keydown',event=>event.preventDefault());
  select.addEventListener('change',()=>{select.value=value});
}
function lockField(field){
  if(!field)return;
  if(field.tagName==='SELECT'){lockSelect(field);return}
  field.readOnly=true;
  field.setAttribute('aria-readonly','true');
  field.style.background='#f3f4f6';
}
function note(form,id,text){
  if(form.querySelector(`#${id}`))return;
  const p=document.createElement('p');p.id=id;p.className='sale-safety-note';p.textContent=text;
  p.style.cssText='grid-column:1/-1;margin:2px 0 4px;padding:9px 10px;border-radius:10px;background:#f3f4f6;color:#5b6472;font-size:10px;line-height:1.45;font-weight:700';
  form.prepend(p);
}
function terminalLock(form,text){
  note(form,'saleTerminalNote',text);
  for(const field of form.elements){
    if(field?.name==='id')continue;
    field.disabled=true;
  }
  const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
}
async function patchDrawer(){
  const form=document.getElementById('saleForm');
  if(!form||form.dataset.m23Safety==='1'||form.dataset.m23Safety==='pending')return;
  const stage=form.elements.sale_stage;
  stage?.querySelector('option[value="DELIVERED"]')?.remove();
  const id=String(form.elements.id?.value||'');
  if(!id){
    note(form,'saleDeliveryGuideNote','La fase CONSEGNATA non si imposta dal menu: si chiude dalla checklist guidata in Garage.');
    form.dataset.m23Safety='1';return;
  }
  form.dataset.m23Safety='pending';
  try{
    const contract=await OfflineDB.get('contracts',id);if(!contract){delete form.dataset.m23Safety;return}
    if(contract.sale_stage==='DELIVERED'){
      terminalLock(form,'Vendita consegnata: pratica definitiva. Per correggere dati storici serve un intervento amministrativo tracciato.');
      form.dataset.m23Safety='1';return;
    }
    if(contract.sale_stage==='CANCELLED'){
      terminalLock(form,'Vendita annullata: non può essere riaperta modificando direttamente la fase.');
      form.dataset.m23Safety='1';return;
    }
    if(contract.status!=='DRAFT'){
      for(const name of LOCKED_TERM_FIELDS)lockField(form.elements[name]);
      note(form,'saleTermsLockedNote','Contratto congelato/firmato: cliente, auto, prezzo, caparra e note contrattuali restano bloccati. La consegna si chiude dalla checklist guidata in Garage.');
    }else{
      note(form,'saleDeliveryGuideNote','La fase CONSEGNATA non si imposta dal menu: si chiude dalla checklist guidata in Garage.');
    }
    form.dataset.m23Safety='1';
  }catch(err){delete form.dataset.m23Safety;console.warn('Sicurezza vendita non applicata',err)}
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;patchDrawer()})}

const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('dealer:session',schedule);
window.addEventListener('dealer:online',schedule);
schedule();
