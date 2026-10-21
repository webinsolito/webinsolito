import type {Contract,TenantData} from '../types'
import {DELIVERY_CHECKLIST} from './sale360'

export type DeliveryGateState='PASS'|'BLOCK'|'PRIVATE'
export interface DeliveryGateCheck{id:string;label:string;state:DeliveryGateState;detail:string}

export function buildDeliveryGate(data:TenantData,contract:Contract,financeVisible:boolean){
 const done=new Set(data.workItems.filter(w=>w.dealer_id===contract.dealer_id&&w.vehicle_id===contract.vehicle_id&&String(w.category||'').toUpperCase()==='CONSEGNA'&&String(w.status||'').toUpperCase()==='DONE').map(w=>String(w.title||'').trim()))
 const missingChecklist=DELIVERY_CHECKLIST.filter(title=>!done.has(title))
 const stageReady=String(contract.sale_stage||'').toUpperCase()==='READY'
 const signed=String(contract.status||'').toUpperCase()==='SIGNED'
 const vehicle=data.vehicles.find(v=>v.id===contract.vehicle_id)
 const plate=String(vehicle?.plate||'').replace(/\s+/g,'').toUpperCase()
 const vin=String(vehicle?.vin||'').replace(/\s+/g,'').toUpperCase()
 const identityOk=Boolean(plate&&vin.length===17&&!/[IOQ]/.test(vin))
 const photoOk=data.media.some(m=>m.vehicle_id===contract.vehicle_id&&String(m.kind||'PHOTO').toUpperCase()==='PHOTO'&&String(m.object_key||'').trim())
 const operationalChecks:DeliveryGateCheck[]=[
  {id:'stage',label:'Vendita pronta consegna',state:stageReady?'PASS':'BLOCK',detail:stageReady?'Stato READY confermato.':'Porta prima la vendita allo stato Pronta consegna.'},
  {id:'contract',label:'Contratto firmato',state:signed?'PASS':'BLOCK',detail:signed?'Contratto SIGNED.':'Il contratto deve risultare firmato.'},
  {id:'identity',label:'Identità veicolo completa',state:identityOk?'PASS':'BLOCK',detail:identityOk?('Targa '+plate+' · VIN verificato.'):!plate?'Manca la targa del veicolo.':!vin?'Manca il VIN del veicolo.':'VIN non valido: deve avere 17 caratteri e non contenere I, O o Q.'},
  {id:'photo',label:'Foto veicolo presente',state:photoOk?'PASS':'BLOCK',detail:photoOk?'Almeno una foto veicolo è disponibile.':'Aggiungi almeno una foto del veicolo prima della consegna.'},
  {id:'checklist',label:'Checklist consegna',state:missingChecklist.length?'BLOCK':'PASS',detail:missingChecklist.length?(missingChecklist.length+' controlli mancanti: '+missingChecklist.join(', ')):'Tutti i 7 controlli operativi sono completati.'}
 ]
 if(!financeVisible){
  const checks=[...operationalChecks,{id:'finance',label:'Verifica amministrativa finale',state:'PRIVATE' as const,detail:'Fattura, saldo e finanziamento sono riservati ad Admin/Amministrazione.'}]
  return {checks,missingChecklist,financeVisible:false,canDeliver:false,blockerCount:operationalChecks.filter(x=>x.state==='BLOCK').length+1}
 }
 const invoice=contract.sale_invoice_id?data.invoices.find(i=>i.id===contract.sale_invoice_id&&!i.deleted_at):data.invoices.filter(i=>!i.deleted_at&&String(i.invoice_type||'').toUpperCase()==='SALE'&&i.vehicle_id===contract.vehicle_id&&i.customer_id===contract.customer_id).sort((a,b)=>String(b.issue_date||'').localeCompare(String(a.issue_date||'')))[0]
 const total=Number(invoice?.total_amount??0),paid=Number(invoice?.paid_amount||0),price=Number(contract.price||0)
 const invoiceOk=Boolean(invoice&&String(invoice.invoice_type||'').toUpperCase()==='SALE'&&invoice.vehicle_id===contract.vehicle_id&&invoice.customer_id===contract.customer_id&&Math.abs(total-price)<=0.01)
 const balanceOk=Boolean(invoiceOk&&String(invoice?.payment_status||'').toUpperCase()==='PAID'&&paid>=total-0.01)
 const financingRequired=Number(contract.financing_amount||0)>0
 const financingOk=!financingRequired||String(contract.financing_status||'').toUpperCase()==='PAID'
 const financeChecks:DeliveryGateCheck[]=[
  {id:'invoice',label:'Fattura vendita coerente',state:invoiceOk?'PASS':'BLOCK',detail:invoiceOk?'Fattura SALE collegata e importo coerente.':'Manca una fattura SALE valida e coerente con cliente, auto e prezzo.'},
  {id:'balance',label:'Saldo completamente incassato',state:balanceOk?'PASS':'BLOCK',detail:balanceOk?'Pagamento completato.':invoiceOk?('Saldo ancora aperto: '+Math.max(0,total-paid).toLocaleString('it-IT')+' €.'):'Verifica prima la fattura vendita.'},
  {id:'financing',label:'Finanziamento liquidato',state:financingOk?'PASS':'BLOCK',detail:financingRequired?(financingOk?'Finanziamento liquidato.':'Il finanziamento non risulta ancora liquidato.'):'Nessun finanziamento da liquidare.'}
 ]
 const checks=[...operationalChecks,...financeChecks]
 const blockerCount=checks.filter(x=>x.state==='BLOCK').length
 return {checks,missingChecklist,financeVisible:true,invoice,canDeliver:blockerCount===0,blockerCount}
}