import {OfflineDB} from './offline.js';
import {Session} from './api.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

let snapshot={vehicles:[],financials:[]};
let scheduled=false;
let running=false;

function dealerId(){return Session.get()?.dealer?.id||null}
function financial(vehicleId){return snapshot.financials.find(f=>f.vehicle_id===vehicleId)||null}
function purchaseKnown(vehicleId){
  const f=financial(vehicleId);
  return !!f&&f.purchase_price!==null&&f.purchase_price!==undefined&&String(f.purchase_price).trim()!=='';
}
function isSold(v){return ['VENDUTA','DA_CONSEGNARE','CONSEGNATA'].includes(v?.status)}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function vehicleByRow(row){
  const text=row?.querySelector('small')?.textContent||row?.textContent||'';
  return snapshot.vehicles.find(v=>(v.plate&&text.includes(v.plate))||(v.vin&&text.includes(v.vin)))||null;
}
function markCell(el,text){
  if(!el)return;
  const target=el.querySelector('strong')||el.querySelector('b')||el;
  setText(target,text);
  target.classList?.remove('margin-positive','margin-negative','fin-pos','fin-neg','rep-pos','rep-neg');
}

function patchGarage(){
  const missing=snapshot.vehicles.filter(v=>!v.deleted_at&&!purchaseKnown(v.id));
  for(const card of $$('[data-open-vehicle].vehicle-card')){
    if(purchaseKnown(card.dataset.openVehicle))continue;
    const metrics=card.querySelector('.metrics');
    if(!metrics)continue;
    const cells=[...metrics.children];
    if(cells[0]?.querySelector('span')?.textContent?.trim()==='COSTO TOTALE'){
      markCell(cells[0],'DA INSERIRE');
      markCell(cells[2],'N/D');
    }
  }
  const kpis=$('#garageKpis');
  if(kpis&&missing.length){
    const last=kpis.lastElementChild;
    if(last?.querySelector('span')?.textContent?.includes('CAPITALE / MARGINE')){
      setText(last.querySelector('b'),`INCOMPLETO · ${missing.length} PREZZI`);
    }
  }
  const form=$('#gdVehicleForm');
  const vin=form?.querySelector('[name="vin"]')?.value?.trim();
  const plate=form?.querySelector('[name="plate"]')?.value?.trim();
  const v=snapshot.vehicles.find(x=>(vin&&x.vin===vin)||(plate&&x.plate===plate));
  if(!v||purchaseKnown(v.id))return;
  const fin=$('.gd-fin');
  if(fin){
    const cells=[...fin.children];
    markCell(cells[0],'DA INSERIRE');
    markCell(cells[2],'DA INSERIRE');
    markCell(cells[3],'N/D');
  }
  const purchase=$('#gdFinancialForm [name="purchase_price"]');
  if(purchase){
    if(purchase.value==='0'||purchase.value==='0.00')purchase.value='';
    purchase.placeholder='Da inserire';
    purchase.required=true;
  }
}

function warning(root,count){
  if(!root)return;
  let box=root.querySelector('.data-quality-warning');
  if(!count){box?.remove();return}
  if(!box){
    box=document.createElement('div');
    box.className='data-quality-warning';
    box.style.cssText='margin:0 0 10px;padding:10px 12px;border-radius:12px;background:#fff8e8;border:1px solid #f0dfb2;font-size:9px;font-weight:800;color:#6f581c;line-height:1.45';
    root.prepend(box);
  }
  box.textContent=`⚠ ${count} veicoli senza prezzo d’acquisto: capitale e margini restano incompleti finché non inserisci il costo reale.`;
}

function patchFinance(){
  const root=$('#financeApp');if(!root)return;
  const missing=snapshot.vehicles.filter(v=>!v.deleted_at&&!purchaseKnown(v.id));
  warning(root,missing.length);
  for(const row of $$('.fin-row',root)){
    const v=vehicleByRow(row);if(!v||purchaseKnown(v.id))continue;
    const c=[...row.children];
    markCell(c[1],'DA INSERIRE');markCell(c[3],'N/D');markCell(c[5],'N/D');
  }
  const stockMissing=missing.filter(v=>!isSold(v)).length;
  const soldMissing=missing.filter(isSold).length;
  const kpis=$$('.fin-kpis>div',root);
  if(stockMissing)markCell(kpis[0],`INCOMPLETO · ${stockMissing}`);
  if(soldMissing)markCell(kpis[2],`INCOMPLETO · ${soldMissing}`);
}

function patchReports(){
  const root=$('#reportsApp');if(!root)return;
  const missing=snapshot.vehicles.filter(v=>!v.deleted_at&&!purchaseKnown(v.id));
  warning(root,missing.length);
  for(const row of $$('.rep-row',root)){
    const v=vehicleByRow(row);if(!v||purchaseKnown(v.id))continue;
    const c=[...row.children];
    markCell(c[2],'DA INSERIRE');markCell(c[4],'N/D');markCell(c[6],'N/D');
  }
  const stockMissing=missing.filter(v=>!isSold(v)).length;
  const soldMissing=missing.filter(isSold).length;
  const kpis=$$('.rep-kpis>div',root);
  if(stockMissing)markCell(kpis[1],`INCOMPLETO · ${stockMissing}`);
  if(soldMissing)markCell(kpis[5],`INCOMPLETO · ${soldMissing}`);
  const csv=$('#repCsv');
  if(csv&&missing.length){csv.disabled=true;csv.title='Completa prima i prezzi di acquisto mancanti';}
}

async function apply(){
  if(running)return;running=true;
  try{
    const id=dealerId();if(!id)return;
    const [vehicles,financials]=await Promise.all([OfflineDB.list('vehicles',id),OfflineDB.list('vehicle_financials',id)]);
    snapshot={vehicles,financials};
    patchGarage();patchFinance();patchReports();
  }catch(err){console.warn('Controllo prezzi mancanti non disponibile',err)}finally{running=false}
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;apply()},80)}

window.addEventListener('dealer:data-updated',schedule);
window.addEventListener('online',schedule);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
