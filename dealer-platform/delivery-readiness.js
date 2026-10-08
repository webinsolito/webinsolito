export const DELIVERY_CHECKLIST_TITLES=[
  'Contratto firmato',
  'Saldo verificato',
  'Passaggio / documenti completati',
  'Libretto e documenti pronti',
  'Preparazione auto completata',
  'Doppie chiavi presenti',
  'Garanzia / documentazione consegnata'
];

const active=rows=>(rows||[]).filter(row=>row&&!row.deleted_at&&row.status!=='CANCELLED');
const residual=invoice=>Math.max(0,Number(invoice?.total_amount||0)-Number(invoice?.paid_amount||0));

export function deliveryReadiness({vehicle,contracts=[],invoices=[],workItems=[]}={}){
  if(!vehicle)return null;
  const saleContracts=active(contracts).filter(c=>c.template_code==='VENDITA'&&c.vehicle_id===vehicle.id);
  const contract=saleContracts.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0]||null;
  const salesInvoices=active(invoices).filter(i=>i.invoice_type==='SALE'&&i.vehicle_id===vehicle.id);
  const invoice=(contract?.sale_invoice_id&&salesInvoices.find(i=>i.id===contract.sale_invoice_id))||salesInvoices[0]||null;
  const items=active(workItems).filter(w=>w.vehicle_id===vehicle.id&&w.category==='CONSEGNA');
  const done=items.filter(w=>w.status==='DONE').length,total=items.length||DELIVERY_CHECKLIST_TITLES.length;
  const base={contract,invoice,items,done,total,progress:Math.round(done/total*100)};

  if(vehicle.status==='CONSEGNATA'||contract?.sale_stage==='DELIVERED')return {...base,tone:'complete',title:'Consegna completata',detail:'Auto consegnata e pratica chiusa.',action:'none',actionLabel:''};

  const amount=invoice?residual(invoice):contract?Math.max(0,Number(contract.price||0)-Number(contract.deposit||0)):0;
  if(amount>0)return {...base,tone:'blocked',title:'Saldo da verificare',detail:'Prima della consegna deve risultare incassato tutto il residuo.',amount,action:'open_invoices',actionLabel:'Apri fatture'};

  if(!items.length)return {...base,tone:'todo',title:'Prepara la consegna',detail:'Creo automaticamente i 7 controlli essenziali per questa auto.',action:'seed',actionLabel:'Crea checklist'};

  const pending=items.filter(w=>w.status!=='DONE').sort((a,b)=>{
    const ai=DELIVERY_CHECKLIST_TITLES.indexOf(a.title),bi=DELIVERY_CHECKLIST_TITLES.indexOf(b.title);
    return (ai<0?99:ai)-(bi<0?99:bi)||String(a.created_at||'').localeCompare(String(b.created_at||''));
  })[0];
  if(pending)return {...base,tone:'todo',title:pending.title,detail:`${done} di ${items.length} controlli completati. Procedi senza saltare passaggi.`,workItem:pending,action:'complete_next',actionLabel:'Segna fatto'};

  return {...base,tone:'ready',title:'Pronta per la consegna',detail:'Saldo e checklist sono completi. Puoi chiudere la pratica.',action:'mark_delivered',actionLabel:'Segna consegnata'};
}

