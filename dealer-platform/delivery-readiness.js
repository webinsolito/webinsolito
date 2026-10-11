import {DELIVERY_CHECKLIST_TITLES as REQUIRED_DELIVERY_CHECKLIST,saleDeliveryGate,selectSaleInvoice} from './sale-lifecycle.js';

export const DELIVERY_CHECKLIST_TITLES=REQUIRED_DELIVERY_CHECKLIST;

const active=rows=>(rows||[]).filter(row=>row&&!row.deleted_at&&row.status!=='CANCELLED');
const residual=invoice=>Math.max(0,Number(invoice?.total_amount||0)-Number(invoice?.paid_amount||0));

export function deliveryReadiness({vehicle,contracts=[],invoices=[],workItems=[]}={}){
  if(!vehicle)return null;
  const saleContracts=active(contracts).filter(c=>c.template_code==='VENDITA'&&c.vehicle_id===vehicle.id);
  const contract=saleContracts.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0]||null;
  const invoice=selectSaleInvoice(contract,invoices);
  const items=active(workItems).filter(w=>w.vehicle_id===vehicle.id&&w.category==='CONSEGNA');
  const requiredItems=DELIVERY_CHECKLIST_TITLES.map(title=>items.find(w=>String(w.title||'').trim()===title)).filter(Boolean);
  const done=requiredItems.filter(w=>w.status==='DONE').length,total=DELIVERY_CHECKLIST_TITLES.length;
  const base={contract,invoice,items,done,total,progress:Math.round(done/total*100)};

  if(vehicle.status==='CONSEGNATA'||contract?.sale_stage==='DELIVERED')return {...base,tone:'complete',title:'Consegna completata',detail:'Auto consegnata e pratica chiusa.',action:'none',actionLabel:''};

  const gate=saleDeliveryGate({contract,invoice,invoices,workItems:items});
  if(gate.code==='sale_contract_missing')return {...base,tone:'blocked',title:'Vendita non collegata',detail:'Prima della consegna serve un contratto di vendita collegato a questa auto.',action:'none',actionLabel:''};
  if(gate.code==='sale_contract_not_signed')return {...base,tone:'blocked',title:'Contratto da firmare',detail:'Congela il contratto e segnalo come firmato prima di procedere con la consegna.',action:'none',actionLabel:''};
  if(['sale_invoice_missing','sale_invoice_wrong_type','sale_invoice_vehicle_mismatch','sale_invoice_customer_mismatch','sale_invoice_amount_mismatch'].includes(gate.code))return {...base,tone:'blocked',title:'Fattura vendita da verificare',detail:'La fattura deve essere di vendita, riferita allo stesso cliente e veicolo e avere lo stesso totale del contratto.',action:'open_invoices',actionLabel:'Apri fatture'};
  if(gate.code==='sale_balance_open')return {...base,tone:'blocked',title:'Saldo da verificare',detail:'Prima della consegna deve risultare incassato tutto il residuo della fattura di vendita.',amount:gate.amount??residual(invoice),action:'open_invoices',actionLabel:'Apri fatture'};
  if(gate.code==='sale_financing_not_paid')return {...base,tone:'blocked',title:'Finanziamento da liquidare',detail:'Il finanziamento collegato alla vendita deve risultare liquidato prima della consegna.',action:'open_invoices',actionLabel:'Apri fatture'};
  if(gate.code==='sale_checklist_missing')return {...base,tone:'todo',title:'Prepara la consegna',detail:'Creo o completo automaticamente i 7 controlli obbligatori per questa auto.',action:'seed',actionLabel:'Crea checklist'};
  if(gate.code==='sale_checklist_pending')return {...base,tone:'todo',title:gate.workItem.title,detail:`${done} di ${total} controlli obbligatori completati. Procedi senza saltare passaggi.`,workItem:gate.workItem,action:'complete_next',actionLabel:'Segna fatto'};

  return {...base,tone:'ready',title:'Pronta per la consegna',detail:'Contratto firmato, fattura saldata e checklist completa. Puoi chiudere la pratica.',action:'mark_delivered',actionLabel:'Segna consegnata'};
}
