import {useEffect,useRef,useState} from 'react'
import {AlertTriangle,CalendarClock,Car,CheckCircle2,CircleDollarSign,ClipboardCheck,FileText,LockKeyhole,ShieldCheck,ShoppingBag,UserRound,X} from 'lucide-react'
import {canSeeFinance,canWriteCustomers,canWriteGarage} from '../lib/api'
import {canWriteContracts} from '../lib/salesApi'
import {money} from '../lib/format'
import {buildSale360} from '../domain/sale360'
import {buildDeliveryGate} from '../domain/deliveryGate'
import {SaleCancellationPanel} from './SaleCancellationPanel'
import {ReservationDeadlinePanel} from './ReservationDeadlinePanel'
import {ReservationHistoryPanel} from './ReservationHistoryPanel'
import {ReservationFollowupPanel} from './ReservationFollowupPanel'
import type {Contract,SessionPayload,TenantData} from '../types'
import type {ReservationFollowupWindow} from '../domain/reservationFollowup'

const NEXT_STAGE:Record<string,string>={OPEN:'AGREED',AGREED:'DEPOSIT',DEPOSIT:'BALANCE_PENDING',BALANCE_PENDING:'READY'}
const GUIDED_HINTS:Record<string,string>={stage:'Porta la vendita avanti fino allo stato Pronta consegna, solo dopo le verifiche necessarie.',contract:'Verifica che la firma sia stata registrata dal processo contrattuale autorizzato. Questa guida non modifica la firma.',identity:'Controlla e correggi targa e VIN nella scheda del veicolo.',photo:'Carica almeno una fotografia del veicolo dalla sua scheda.',checklist:'Controlla le attività di consegna e segna come completate soltanto quelle effettivamente svolte.'}
const stageLabel=(value?:string|null)=>({OPEN:'Aperta',AGREED:'Accordo',DEPOSIT:'Caparra',BALANCE_PENDING:'Saldo da chiudere',READY:'Pronta consegna',DELIVERED:'Consegnata',CANCELLED:'Annullata'}[String(value||'')]||String(value||'Non aperta').replaceAll('_',' '))
const dateTime=(value?:string|null)=>{if(!value)return 'Da definire';const d=new Date(value);return Number.isNaN(d.getTime())?'Da definire':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
const person=(c?:TenantData['customers'][number])=>c?[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente':'Cliente non disponibile'
const vehicle=(v?:TenantData['vehicles'][number])=>v?[v.brand,v.model,v.version].filter(Boolean).join(' ')||'Auto':'Auto non disponibile'

export function Sale360Drawer({contract,data,session,onClose,onOpenCustomer,onOpenVehicle,onOpenDeliveryAppointment,onOpenInvoices,onOpenDeadlines,onPrepareChecklist,onDeliver,onCancel,onExtendReservation,onRecordReservationContact,onScheduleReservationCallback,onCompleteReservationCallback,focusCheckId=null,onAdvanceStage,deliveryBusy=false}:{contract:Contract;data:TenantData;session:SessionPayload;onClose:()=>void;onOpenCustomer:(id:string)=>void;onOpenVehicle:(id:string)=>void;onOpenDeliveryAppointment:(customerId:string,vehicleId:string)=>void;onOpenInvoices:(invoiceId?:string)=>void;onOpenDeadlines:()=>void;onPrepareChecklist:()=>void;onAdvanceStage:(stage:string)=>Promise<void>;focusCheckId?:string|null;onDeliver:()=>Promise<void>;onCancel:(reason:string)=>Promise<void>;onExtendReservation:(iso:string,reason:string)=>Promise<void>;onRecordReservationContact:(channel:string,title:string)=>Promise<void>;onScheduleReservationCallback:(nextStep:string,iso:string)=>Promise<void>;onCompleteReservationCallback:(window:ReservationFollowupWindow,note:string)=>Promise<void>;deliveryBusy?:boolean}){
 const summary=buildSale360(data,contract,new Date().toISOString())
 const financeVisible=canSeeFinance(session)
 const deliveryWritable=canWriteContracts(session)
 const checklistWritable=canWriteGarage(session)
 const gate=buildDeliveryGate(data,contract,financeVisible)
 const guidedCheck=focusCheckId&&Object.prototype.hasOwnProperty.call(GUIDED_HINTS,focusCheckId)?gate.checks.find(check=>check.id===focusCheckId&&check.state==='BLOCK'):undefined
 const drawerRef=useRef<HTMLElement>(null)
 useEffect(()=>{
  if(!guidedCheck)return
  const frame=window.requestAnimationFrame(()=>{
   const row=drawerRef.current?.querySelector<HTMLElement>('[data-gate-check="'+guidedCheck.id+'"]')
   row?.scrollIntoView({block:'center'})
   row?.focus({preventScroll:true})
  })
  return()=>window.cancelAnimationFrame(frame)
 },[guidedCheck?.id,contract.id])
 const nextStage=NEXT_STAGE[String(contract.sale_stage||'').toUpperCase()]
 const [confirming,setConfirming]=useState(false)
 const [deliveryError,setDeliveryError]=useState('')
 const terminal=['DELIVERED','CANCELLED'].includes(String(contract.sale_stage||'').toUpperCase())
 const deliver=async()=>{setDeliveryError('');try{await onDeliver()}catch(err){setDeliveryError(err instanceof Error?err.message:'Impossibile completare la consegna');setConfirming(false)}}
 return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside ref={drawerRef} className="drawer sale360-drawer" data-testid="sale-360">
   <header><div><p className="eyebrow">SCHEDA VENDITA 360°</p><h2>{contract.contract_number}</h2><span>{vehicle(summary.vehicle)} · {person(summary.customer)}</span></div><button className="icon-btn" onClick={onClose} aria-label="Chiudi vendita 360"><X/></button></header>

   <section className="sale360-hero">
     <div><span>STATO VENDITA</span><b>{stageLabel(contract.sale_stage)}</b></div>
     <div><span>CONTRATTO</span><b>{contract.status||'DRAFT'}</b></div>
     <div><span>CONSEGNA</span><b>{dateTime(contract.planned_delivery_at)}</b></div>
     <div><span>CHECKLIST</span><b>{summary.checklist.done}/{summary.checklist.total}</b></div>
   </section>

   <section className="sale360-actions">
     {summary.customer&&<button onClick={()=>onOpenCustomer(summary.customer!.id)}><UserRound/><span><b>Cliente</b><small>{person(summary.customer)}</small></span></button>}
     {summary.vehicle&&<button onClick={()=>onOpenVehicle(summary.vehicle!.id)}><Car/><span><b>Auto</b><small>{vehicle(summary.vehicle)}</small></span></button>}
     {!terminal&&<button data-testid="sale360-delivery-appointment" onClick={()=>onOpenDeliveryAppointment(contract.customer_id,contract.vehicle_id)}><CalendarClock/><span><b>Appuntamento consegna</b><small>Cliente e auto già selezionati</small></span></button>}
     <button onClick={onOpenDeadlines}><FileText/><span><b>Pratiche</b><small>{summary.practices.length} aperte</small></span></button>
   </section>

   <ReservationDeadlinePanel contract={contract} session={session} busy={deliveryBusy} onExtend={onExtendReservation}/>
   <ReservationFollowupPanel contract={contract} customer={summary.customer} interactions={data.customerInteractions} writable={canWriteCustomers(session)} onLog={onRecordReservationContact} onPlan={onScheduleReservationCallback} onComplete={onCompleteReservationCallback}/>
   <ReservationHistoryPanel contract={contract}/>
   <SaleCancellationPanel contract={contract} session={session} busy={deliveryBusy} onCancel={onCancel}/>

   {!terminal&&<section className={'sale360-gate '+(gate.canDeliver?'ready':'blocked')} data-testid="delivery-gate">
     <div className="sale360-gate-head"><div><p className="eyebrow">GATE CONSEGNA</p><h3><ShieldCheck/> {gate.canDeliver?'Pronta per la consegna':'Consegna bloccata'}</h3></div><b>{gate.canDeliver?'TUTTO VERDE':gate.blockerCount+' VERIFICHE'}</b></div>
     <div className="sale360-gate-checks">{gate.checks.map(check=><div key={check.id}
    className={'gate-check '+check.state.toLowerCase()+(guidedCheck?.id===check.id?' guided':'')}
    data-gate-check={check.id} data-testid={guidedCheck?.id===check.id?'sale360-guided-check':undefined}
    tabIndex={guidedCheck?.id===check.id?-1:undefined}>
    {check.state==='PASS'?<CheckCircle2/>:check.state==='PRIVATE'?<LockKeyhole/>:<AlertTriangle/>}
    <span><b>{check.label}</b><small>{check.detail}</small>
     {guidedCheck?.id===check.id&&<div className="sale360-guide-actions" data-testid="sale360-guide-actions">
       <p>{GUIDED_HINTS[check.id]}</p>
       {check.id==='stage'&&nextStage&&deliveryWritable&&<button disabled={deliveryBusy} onClick={()=>void onAdvanceStage(nextStage)}>Avanza a {stageLabel(nextStage)}</button>}
       {(check.id==='identity'||check.id==='photo'||check.id==='checklist')&&summary.vehicle?.dealer_id===contract.dealer_id&&<button onClick={()=>onOpenVehicle(summary.vehicle!.id)}>Apri scheda auto</button>}
       {check.id==='checklist'&&checklistWritable&&<button disabled={deliveryBusy} onClick={onPrepareChecklist}>Prepara checklist</button>}
     </div>}
    </span>
  </div>)}</div>
     {deliveryError&&<div className="sale360-gate-error" role="alert">{deliveryError}</div>}
     {String(contract.sale_stage||'').toUpperCase()==='READY'&&<div className="sale360-gate-action">{!deliveryWritable?<button disabled><LockKeyhole/> Permesso consegna non disponibile</button>:!financeVisible?<button disabled><LockKeyhole/> Conferma finale · Admin/Amministrazione</button>:gate.canDeliver&&!confirming?<button className="deliver" disabled={deliveryBusy} onClick={()=>setConfirming(true)}><Car/> Consegna veicolo</button>:gate.canDeliver&&confirming?<div className="sale360-confirm"><p>Confermi la consegna definitiva? Dopo non potrai riaprire la vendita.</p><button className="deliver" disabled={deliveryBusy} onClick={()=>void deliver()}><CheckCircle2/> {deliveryBusy?'Consegna…':'Conferma definitivamente'}</button><button disabled={deliveryBusy} onClick={()=>setConfirming(false)}>Annulla</button></div>:<button disabled><AlertTriangle/> Consegna bloccata · completa le verifiche</button>}</div>}
   </section>}

   <section className="sale360-section">
     <div className="sale360-head"><h3><CalendarClock/> Consegna e appuntamenti</h3></div>
     {summary.nextEvent?<button className="sale360-row" onClick={()=>onOpenDeliveryAppointment(contract.customer_id,contract.vehicle_id)}><span><b>{summary.nextEvent.title||'Appuntamento'}</b><small>{dateTime(summary.nextEvent.starts_at)} · {summary.nextEvent.event_type||'APPOINTMENT'}</small></span><strong>APRI</strong></button>:<div className="sale360-empty">Nessun appuntamento futuro collegato a questa vendita.</div>}
   </section>

   <section className="sale360-section">
     <div className="sale360-head"><h3><FileText/> Pratiche e documenti operativi</h3><button onClick={onOpenDeadlines}>Centro scadenze</button></div>
     <div className="sale360-list">{summary.practices.slice(0,5).map(item=><button className="sale360-row" key={item.id} onClick={onOpenDeadlines}><span><b>{item.title||item.category||'Pratica'}</b><small>{[item.due_date?'Scadenza '+item.due_date:null,item.note].filter(Boolean).join(' · ')}</small></span><strong>APRI</strong></button>)}{!summary.practices.length&&<div className="sale360-empty">Nessuna pratica documentale aperta.</div>}</div>
   </section>

   <section className="sale360-section">
     <div className="sale360-head"><h3><ClipboardCheck/> Checklist consegna</h3>{!terminal&&<button onClick={onPrepareChecklist}>Completa checklist</button>}</div>
     <div className="sale360-checklist">{summary.checklist.items.map(item=><div className={item.done?'done':''} key={item.title}>{item.done?<CheckCircle2/>:<span className="sale360-dot"/>}<b>{item.title}</b></div>)}</div>
   </section>

   <section className="sale360-contract">
     <div><ShoppingBag/><span><small>PREZZO VENDITA</small><b>{money(contract.price)}</b></span></div>
     <div><span><small>CAPARRA CONTRATTO</small><b>{money(contract.deposit)}</b></span></div>
     <div><span><small>FINANZIAMENTO</small><b>{financeVisible?(contract.financing_status||'NON RICHIESTO').replaceAll('_',' '):'Riservato'}</b></span></div>
   </section>

   {financeVisible&&<section className="sale360-finance" data-testid="sale-360-finance">
     <div className="sale360-head"><h3><CircleDollarSign/> Pagamento protetto</h3></div>
     <div className="sale360-finance-grid">
       <div><span>TOTALE FATTURA</span><b>{summary.invoice?money(summary.invoiceTotal):'—'}</b></div>
       <div><span>INCASSATO</span><b>{summary.invoice?money(summary.invoicePaid):'—'}</b></div>
       <div><span>SALDO</span><b>{summary.invoice?money(summary.invoiceDue):'—'}</b></div>
       <div><span>SCADENZA</span><b>{summary.invoice?.due_date||'—'}</b></div>
     </div>
     <button onClick={()=>onOpenInvoices(summary.invoice?.id)}>{summary.invoice?'Apri fattura e incassi':'Fatture e incassi'}</button>
   </section>}
 </aside></div>
}