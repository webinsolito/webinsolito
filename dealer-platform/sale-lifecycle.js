export const DELIVERY_CHECKLIST_TITLES=Object.freeze([
  'Contratto firmato',
  'Saldo verificato',
  'Passaggio / documenti completati',
  'Libretto e documenti pronti',
  'Preparazione auto completata',
  'Doppie chiavi presenti',
  'Garanzia / documentazione consegnata'
]);

const active=rows=>(rows||[]).filter(row=>row&&!row.deleted_at&&row.status!=='CANCELLED');
const cents=value=>Math.round(Number(value||0)*100);
const LOCKED_SALE_TERMS=Object.freeze(['contract_number','contract_date','customer_id','vehicle_id','price','deposit','template_code','template_version','notes']);

function sameTerm(field,a,b){
  if(field==='price'||field==='deposit')return cents(a)===cents(b);
  return String(a??'')===String(b??'');
}

export function saleContractStatusTransition(previousStatus,nextStatus){
  const from=String(previousStatus||'DRAFT'),to=String(nextStatus||'DRAFT');
  if(from==='SIGNED'&&to!=='SIGNED')return {ok:false,code:'sale_contract_signed_terminal'};
  if(from==='FROZEN'&&!['FROZEN','SIGNED'].includes(to))return {ok:false,code:'sale_contract_finalized_terminal'};
  if(from==='CANCELLED'&&to!=='CANCELLED')return {ok:false,code:'sale_contract_cancelled_terminal'};
  return {ok:true,code:'ok'};
}

export function saleContractTermsChanged(previous,next){
  if(!previous)return false;
  if(!saleContractStatusTransition(previous.status,next?.status).ok)return true;
  const delivered=previous.template_code==='VENDITA'&&previous.sale_stage==='DELIVERED';
  if(delivered&&String(previous.status||'')!==String(next?.status||''))return true;
  if(previous.status==='DRAFT'&&!delivered)return false;
  return LOCKED_SALE_TERMS.some(field=>!sameTerm(field,previous?.[field],next?.[field]));
}

export function saleStageTransition(previousStage,nextStage){
  const from=String(previousStage||'OPEN'),to=String(nextStage||'OPEN');
  if(from==='DELIVERED'&&to!=='DELIVERED')return {ok:false,code:'sale_delivered_terminal'};
  if(from==='CANCELLED'&&to!=='CANCELLED')return {ok:false,code:'sale_cancelled_terminal'};
  return {ok:true,code:'ok'};
}

export function vehicleDeliveryTransition(previousStatus,nextStatus){
  if(String(previousStatus||'')==='CONSEGNATA'&&String(nextStatus||'')!=='CONSEGNATA')return {ok:false,code:'vehicle_delivered_terminal'};
  return {ok:true,code:'ok'};
}

export function normalizedPaymentStatus(totalAmount,paidAmount){
  const total=Math.max(0,cents(totalAmount));
  const paid=Math.min(total,Math.max(0,cents(paidAmount)));
  if(total<=0||paid<=0)return 'UNPAID';
  if(paid>=total)return 'PAID';
  return 'PARTIAL';
}

export function normalizeInvoicePayment(invoice={}){
  const total=Math.max(0,Number(invoice.total_amount||0));
  const paid=Math.min(total,Math.max(0,Number(invoice.paid_amount||0)));
  const payment_status=normalizedPaymentStatus(total,paid);
  return {...invoice,total_amount:total,paid_amount:paid,payment_status,paid_at:paid>0?invoice.paid_at||null:null};
}

export function selectSaleInvoice(contract,invoices=[]){
  if(!contract)return null;
  const sales=active(invoices).filter(i=>i.invoice_type==='SALE');
  const linked=contract.sale_invoice_id?sales.find(i=>i.id===contract.sale_invoice_id):null;
  if(linked)return linked;
  return sales.filter(i=>i.vehicle_id===contract.vehicle_id&&i.customer_id===contract.customer_id)
    .sort((a,b)=>String(b.issue_date||b.updated_at||b.created_at||'').localeCompare(String(a.issue_date||a.updated_at||a.created_at||'')))[0]||null;
}

export function saleInvoiceIntegrity(contract,invoice,{requirePaid=false}={}){
  if(!contract)return {ok:false,code:'sale_contract_missing'};
  if(!invoice)return {ok:false,code:'sale_invoice_missing'};
  if(invoice.invoice_type!=='SALE')return {ok:false,code:'sale_invoice_wrong_type'};
  if(invoice.vehicle_id!==contract.vehicle_id)return {ok:false,code:'sale_invoice_vehicle_mismatch'};
  if(invoice.customer_id!==contract.customer_id)return {ok:false,code:'sale_invoice_customer_mismatch'};
  if(Math.abs(cents(invoice.total_amount)-cents(contract.price))>1)return {ok:false,code:'sale_invoice_amount_mismatch'};
  const normalized=normalizeInvoicePayment(invoice);
  if(requirePaid&&normalized.payment_status!=='PAID')return {ok:false,code:'sale_balance_open',amount:Math.max(0,normalized.total_amount-normalized.paid_amount)};
  return {ok:true,code:'ok',invoice:normalized};
}

export function saleDeliveryGate({contract,invoice,invoices=[],workItems=[]}={}){
  if(!contract||contract.template_code!=='VENDITA')return {ready:false,code:'sale_contract_missing'};
  if(contract.status!=='SIGNED')return {ready:false,code:'sale_contract_not_signed'};
  const selected=invoice||selectSaleInvoice(contract,invoices);
  const invoiceCheck=saleInvoiceIntegrity(contract,selected,{requirePaid:true});
  if(!invoiceCheck.ok)return {ready:false,...invoiceCheck,invoice:selected||null};
  if(Number(contract.financing_amount||0)>0&&contract.financing_status!=='PAID')return {ready:false,code:'sale_financing_not_paid',invoice:selected};

  const items=active(workItems).filter(w=>w.vehicle_id===contract.vehicle_id&&w.category==='CONSEGNA');
  const byTitle=new Map(items.map(w=>[String(w.title||'').trim(),w]));
  const missing=DELIVERY_CHECKLIST_TITLES.filter(title=>!byTitle.has(title));
  if(missing.length)return {ready:false,code:'sale_checklist_missing',missing,invoice:selected,items};
  const pending=DELIVERY_CHECKLIST_TITLES.map(title=>byTitle.get(title)).find(w=>w?.status!=='DONE')||null;
  if(pending)return {ready:false,code:'sale_checklist_pending',workItem:pending,invoice:selected,items};
  return {ready:true,code:'ready',invoice:selected,items};
}

export function saleDeliveryMessage(code){
  return ({
    sale_contract_missing:'Collega prima un contratto di vendita.',
    sale_contract_not_signed:'Il contratto di vendita deve essere congelato e segnato come firmato.',
    sale_contract_terms_locked:'Cliente, auto, prezzo e condizioni del contratto congelato non possono più cambiare.',
    sale_contract_finalized_terminal:'Un contratto congelato non può tornare in bozza.',
    sale_contract_signed_terminal:'Un contratto firmato è definitivo e non può essere declassato.',
    sale_contract_cancelled_terminal:'Un contratto annullato non può essere riaperto modificando direttamente lo stato.',
    sale_delivered_terminal:'Una vendita già consegnata è definitiva e non può tornare a una fase precedente.',
    sale_cancelled_terminal:'Una vendita annullata non può essere riaperta modificando direttamente la fase.',
    sale_delivery_timestamp_locked:'La data di consegna registrata è definitiva.',
    sale_invoice_missing:'Serve una fattura di vendita collegata alla stessa auto e allo stesso cliente.',
    sale_invoice_wrong_type:'La fattura collegata non è una fattura di vendita.',
    sale_invoice_vehicle_mismatch:'La fattura collegata appartiene a un altro veicolo.',
    sale_invoice_customer_mismatch:'La fattura collegata appartiene a un altro cliente.',
    sale_invoice_amount_mismatch:'Totale fattura e prezzo del contratto non coincidono.',
    sale_balance_open:'Il saldo della fattura di vendita non risulta completamente incassato.',
    sale_financing_not_paid:'Il finanziamento deve risultare liquidato prima della consegna.',
    sale_checklist_missing:'Manca almeno un controllo obbligatorio della checklist consegna.',
    sale_checklist_pending:'Completa tutti i controlli obbligatori prima della consegna.',
    vehicle_delivery_contract_required:'Prima segna come consegnata la vendita collegata a questo veicolo.',
    vehicle_delivered_terminal:'Un veicolo già consegnato non può tornare in uno stato precedente.'
  })[code]||'Operazione bloccata da una regola di coerenza della vendita.';
}