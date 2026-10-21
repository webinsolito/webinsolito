import {CalendarClock,CheckCircle2,ChevronDown,ChevronRight,ClipboardCheck,Euro,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react'
import {reservationAlert} from '../domain/reservationDeadlines'
import {reservesVehicle} from '../domain/saleReservation'
import type {Contract,Customer,Vehicle} from '../types'

const STAGES=['OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY','DELIVERED'] as const
const stageName:Record<string,string>={OPEN:'Aperta',AGREED:'Accordo',DEPOSIT:'Caparra',BALANCE_PENDING:'Saldo da chiudere',READY:'Pronta consegna',DELIVERED:'Consegnata',CANCELLED:'Annullata'}
const NEXT_STAGE:Record<string,string>={OPEN:'AGREED',AGREED:'DEPOSIT',DEPOSIT:'BALANCE_PENDING',BALANCE_PENDING:'READY'}
const money=(value?:number|null)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value||0))
const name=(...parts:Array<string|null|undefined>)=>parts.filter(Boolean).join(' ').trim()
const readableDate=(value?:string|null)=>{
 if(!value)return 'Da definire'
 const d=new Date(value)
 return Number.isNaN(d.getTime())?'Da definire':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
}

export function SalesCompactCard({contract,customer,vehicle,checklistDone,checklistTotal,focused,writable,checklistWritable,busy,nowIso,onOpen,onChecklist,onAdvance,onDelivery}:{
 contract:Contract;customer?:Customer;vehicle?:Vehicle;checklistDone:number;checklistTotal:number
 focused:boolean;writable:boolean;checklistWritable:boolean;busy:boolean;nowIso:string
 onOpen:()=>void;onChecklist:()=>void;onAdvance:(next:string)=>void;onDelivery:()=>void
}){
 const stage=String(contract.sale_stage||'OPEN').toUpperCase()
 const next=NEXT_STAGE[stage]
 const terminal=stage==='DELIVERED'||stage==='CANCELLED'
 const reserved=reservesVehicle(contract)
 const alert=reserved?reservationAlert(contract,nowIso):'NONE'
 const progressIndex=STAGES.indexOf(stage as typeof STAGES[number])
 const customerName=name(customer?.first_name,customer?.last_name)||'Cliente non disponibile'
 const vehicleName=name(vehicle?.brand,vehicle?.model,vehicle?.version)||'Auto non disponibile'
 const hasActions=writable&&!terminal&&(Boolean(next)||checklistWritable||stage==='READY')
 return <article className={'sale-card sale-card-compact'+(terminal?' is-terminal':'')+(focused?' vehicle-focus':'')} data-testid="sale-card" data-vehicle-id={contract.vehicle_id} data-sale-id={contract.id}>
  <div className="sale-compact-header">
   <div className="sale-compact-main">
    <div className="sale-compact-overline"><span className="sale-number">{contract.contract_number}</span><span className={'sale-stage stage-'+stage.toLowerCase()}>{stageName[stage]||stage}</span></div>
    <h3>{vehicleName}</h3>
    <div className="sale-compact-identities">
     <span><UserRound size={15}/>{customerName}</span>
     {vehicle?.plate&&<span className="sale-compact-plate">{vehicle.plate}</span>}
    </div>
   </div>
   <button type="button" className="sale360-open sale-compact-open" data-testid="open-sale-360"
    aria-label={'Apri Scheda Vendita 360° '+contract.contract_number} onClick={onOpen}>Apri 360° <ChevronRight size={16}/></button>
  </div>
  <div className="sale-compact-facts">
   <span><ClipboardCheck size={15}/> Checklist <b>{checklistDone}/{checklistTotal}</b></span>
   <span><CalendarClock size={15}/> Consegna <b>{readableDate(contract.planned_delivery_at)}</b></span>
   <span><ShieldCheck size={15}/> Contratto <b>{contract.status||'DRAFT'}</b></span>
  </div>
  {reserved&&<p className={'sale-reservation-owner sale-compact-reservation'+(alert==='OVERDUE'?' is-overdue':alert==='SOON'?' is-soon':'')} data-testid="sale-reservation-owner">
   <LockKeyhole size={15}/> Auto prenotata per {customerName} · vendita {contract.contract_number}
   {alert==='OVERDUE'?' · SCADUTA':alert==='SOON'?' · IN SCADENZA':''}
  </p>}
  <details className="sale-compact-expand" data-testid="sale-card-details">
   <summary aria-label={'Mostra dettagli e azioni '+contract.contract_number}><span>Dettagli{hasActions?' e azioni rapide':''}</span><ChevronDown size={17}/></summary>
   <div className="sale-compact-expanded">
    <div className="sale-kpis">
     <div><Euro/><span>Prezzo</span><b>{money(contract.price)}</b></div>
     <div><Euro/><span>Caparra</span><b>{money(contract.deposit)}</b></div>
     <div><CalendarClock/><span>Consegna</span><b>{readableDate(contract.planned_delivery_at)}</b></div>
     <div><ClipboardCheck/><span>Checklist</span><b>{checklistDone}/{checklistTotal}</b></div>
    </div>
    <div className="sale-progress" aria-label="Avanzamento vendita">{STAGES.map((item,i)=><span key={item} className={progressIndex>=i?'done':''}>{stageName[item]}</span>)}</div>
    {stage==='READY'&&<p className="sale-compact-signature">{contract.status==='SIGNED'?'Contratto firmato':'Firma contratto ancora necessaria'}</p>}
    {hasActions&&<div className="sale-actions">
     {checklistWritable&&<button type="button" className="soft-action" disabled={busy} onClick={onChecklist}><ClipboardCheck/> Prepara checklist</button>}
     {next&&<button type="button" disabled={busy} onClick={()=>onAdvance(next)}><CheckCircle2/> Avanza a {stageName[next]}</button>}
     {stage==='READY'&&<button type="button" className="delivery-action" disabled={busy} onClick={onDelivery}><ShieldCheck/> Verifica consegna</button>}
    </div>}
    <button type="button" className="sale-compact-detail-link" onClick={onOpen}>Apri tutta la Vendita 360° <ChevronRight size={16}/></button>
   </div>
  </details>
 </article>
}
