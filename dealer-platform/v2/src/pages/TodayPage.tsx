import {useEffect,useMemo,useState} from 'react'
import {CalendarClock,Camera,CarFront,ChevronRight,Euro,PackageCheck,PhoneCall,Users,Wrench} from 'lucide-react'
import {buildPriorities,type PriorityItem} from '../domain/priorities'
import {buildInvoiceSummary} from '../domain/invoices'
import {buildCollectionSchedule} from '../domain/collections'
import {buildDeadlineSummary} from '../domain/deadlines'
import {activeReservationAlerts} from '../domain/reservationDeadlines'
import {buildTodayReservationCallbacks,overdueCallbackCounts,overdueCallbackLabel} from '../domain/todayReservationCallbacks'
import {fetchCollectionFollowups,type InvoiceCollectionFollowup} from '../lib/collectionsApi'
import type {InvoiceDetail} from '../lib/invoiceApi'
import {money} from '../lib/format'
import type {TenantData,View} from '../types'

const icon={PRICE:Euro,PHOTO:Camera,WORK:Wrench,AGE:CarFront,CALENDAR:CalendarClock,CUSTOMER:PhoneCall,DELIVERY:PackageCheck,COLLECTION:Euro}
const localDay=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')

export function TodayPage({data,financeVisible=false,onVehicle,onSale,onView,onCollections,onDeadlines}:{data:TenantData;financeVisible?:boolean;onVehicle:(id:string)=>void;onSale:(id:string)=>void;onView:(view:View)=>void;onCollections:()=>void;onDeadlines:()=>void}){
 const [followups,setFollowups]=useState<InvoiceCollectionFollowup[]|null>(financeVisible?null:[])
 const [collectionsError,setCollectionsError]=useState(false)
 const [showAllBookingCallbacks,setShowAllBookingCallbacks]=useState(false)
 useEffect(()=>{
  let active=true
  if(!financeVisible){setFollowups([]);setCollectionsError(false);return()=>{active=false}}
  setFollowups(null);setCollectionsError(false)
  void fetchCollectionFollowups().then(rows=>{if(active)setFollowups(rows)}).catch(()=>{if(active){setCollectionsError(true);setFollowups(null)}})
  return()=>{active=false}
 },[financeVisible])
 const priorities=useMemo(()=>buildPriorities(data),[data])
 const collectionSchedule=useMemo(()=>{
  if(!financeVisible||followups===null)return null
  const invoiceSummary=buildInvoiceSummary(data.invoices as InvoiceDetail[],[],localDay())
  return buildCollectionSchedule(invoiceSummary.rows,followups,localDay())
 },[data.invoices,financeVisible,followups])
 const collectionPriorities=useMemo<PriorityItem[]>(()=>collectionSchedule?collectionSchedule.tasks.filter(task=>task.actionableToday).map(task=>({
  id:'collection:'+task.row.invoice.id,
  kind:'COLLECTION',
  severity:task.daysOverdue>0?3:2,
  title:(task.row.invoice.counterparty_name||'Cliente')+': incasso da sollecitare',
  detail:'Fattura '+(task.row.invoice.number||'—')+' · '+money(task.row.due)+' da incassare'+(task.daysOverdue?' · '+task.daysOverdue+' gg di ritardo':''),
  due:task.actionDate
 })):[],[collectionSchedule])
 const allPriorities=useMemo(()=>[...priorities,...collectionPriorities].sort((a,b)=>b.severity-a.severity||String(a.due||'').localeCompare(String(b.due||''))).slice(0,30),[priorities,collectionPriorities])
 const stock=data.vehicles.filter(v=>!['CONSEGNATA','VENDUTA','ANNULLATA'].includes(v.status||''))
 const customerActions=priorities.filter(p=>p.kind==='CUSTOMER').length
 const garageActions=priorities.filter(p=>['PRICE','PHOTO','WORK','AGE'].includes(p.kind)).length
 const deliveryActions=priorities.filter(p=>p.kind==='DELIVERY').length
 const act=(p:PriorityItem)=>{if(p.kind==='COLLECTION'){onCollections();return}if(p.kind==='DELIVERY'&&p.saleId){onSale(p.saleId);return}if(p.kind==='CUSTOMER'){onView('clients');return}if(p.kind==='CALENDAR'){onView('calendar');return}if(p.vehicleId){onVehicle(p.vehicleId);return}if(p.customerId)onView('clients')}
 const actionLabel=(p?:PriorityItem)=>p?.kind==='COLLECTION'?'Apri scadenziario':p?.kind==='DELIVERY'&&p.saleId?'Apri vendita 360°':p?.kind==='CUSTOMER'?'Apri clienti':p?.kind==='CALENDAR'?'Apri calendario':p?.vehicleId?'Apri auto':'Apri'
 const collectionCount=collectionsError?'—':followups===null?'…':String(collectionSchedule?.todayCount||0)
 const deadlineSummary=useMemo(()=>buildDeadlineSummary(data,localDay(),collectionSchedule?.tasks||[]),[data,collectionSchedule])
 const dueNow=deadlineSummary.overdue+deadlineSummary.today
 const urgentReservations=activeReservationAlerts(data,new Date().toISOString())
 const overdueCallbacks=useMemo(()=>buildTodayReservationCallbacks(data,new Date().toISOString()),[data])
 const bookingCallbackCounts=overdueCallbackCounts(overdueCallbacks)
 const bookingCallbackRows=showAllBookingCallbacks?overdueCallbacks:overdueCallbacks.slice(0,5)
 const callbackDateTime=(value:string)=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value))

 return <><div className="page-heading"><div><p className="eyebrow">COMANDO OPERATIVO</p><h1>Oggi</h1><p>{allPriorities.length?allPriorities.length+' azioni concrete da gestire.':'Nessun blocco urgente. Puoi lavorare sul commerciale.'}</p></div><div className="mini-stat"><span>AUTO ATTIVE</span><b>{stock.length}</b></div></div>
 <div className={'today-kpis '+(financeVisible?'finance':'')}><button onClick={()=>onView('clients')}><Users/><span><b>{customerActions}</b><small>Clienti da ricontattare</small></span></button><button onClick={onDeadlines} aria-label="Apri centro scadenze"><CalendarClock/><span><b>{dueNow}</b><small>Centro scadenze</small></span></button><button onClick={()=>onView('garage')}><CarFront/><span><b>{garageActions}</b><small>Azioni sul Garage</small></span></button><button onClick={()=>onView('sales')} aria-label="Apri consegne da gestire"><PackageCheck/><span><b>{deliveryActions}</b><small>Consegne da gestire</small></span></button>{financeVisible&&<button onClick={onCollections} aria-label="Apri incassi da sollecitare"><Euro/><span><b>{collectionCount}</b><small>{collectionsError?'Scadenziario non disponibile':'Incassi da sollecitare'}</small></span></button>}</div>
 {urgentReservations.length>0&&<button type="button" className="reservation-alert-banner" data-testid="today-reservation-alert" onClick={onDeadlines}>🔔 {urgentReservations.length} prenotazion{urgentReservations.length===1?'e':'i'} da verificare · Apri Centro Scadenze <ChevronRight/></button>}
 {overdueCallbacks.length>0&&<section className="today-overdue-callbacks section" data-testid="today-overdue-callbacks">
  <div className="today-callback-head">
   <div><p className="eyebrow">PRENOTAZIONI SCADUTE</p><h2><PhoneCall/> Richiami da seguire</h2><p>Contatta il cliente, registra l'esito e programma il prossimo richiamo. L'auto resta prenotata.</p></div>
   <div className="today-callback-stats"><span><b data-testid="today-callback-to-do">{bookingCallbackCounts.toDo}</b> da gestire</span><span><b data-testid="today-callback-scheduled">{bookingCallbackCounts.scheduled}</b> programmati</span></div>
  </div>
  <div className="today-callback-list">
   {bookingCallbackRows.map(item=><button type="button" key={item.id}
    data-testid="today-callback-row" data-callback-state={item.state}
    className={'today-callback-row status-'+item.state.toLowerCase()} onClick={()=>onSale(item.contractId)}
    aria-label={'Apri prenotazione '+item.contractNumber+' di '+item.customerName}>
    <span className="today-callback-symbol"><PhoneCall size={19}/></span>
    <span className="today-callback-copy"><strong>{item.customerName} <span>· {item.contractNumber}</span></strong><small>{item.vehicleName}</small>
     <small>Scaduta il {callbackDateTime(item.expiresAt)}{item.lastContactAt?' · ultimo contatto '+callbackDateTime(item.lastContactAt):''}</small>
    </span>
    <span className="today-callback-state"><b>{overdueCallbackLabel(item.state)}</b>
     {item.callbackAt&&<small>{callbackDateTime(item.callbackAt)}</small>}
    </span>
    <ChevronRight size={18} className="today-callback-arrow"/>
   </button>)}
  </div>
  {overdueCallbacks.length>5&&<button type="button" className="today-callback-more" data-testid="today-callback-show-all"
   onClick={()=>setShowAllBookingCallbacks(x=>!x)}>
   {showAllBookingCallbacks?'Mostra i primi 5':'Mostra tutti i '+overdueCallbacks.length+' richiami'} <ChevronRight size={16}/>
  </button>}
 </section>
 <section className="focus-card"><div><p className="eyebrow">PRIMA COSA DA FARE</p><h2>{allPriorities[0]?.title||'Niente di urgente 🎉'}</h2><p>{allPriorities[0]?.detail||'Puoi passare ai clienti o al Garage senza emergenze aperte.'}</p></div>{allPriorities[0]&&<button className="focus-cta" onClick={()=>act(allPriorities[0])}>{actionLabel(allPriorities[0])} <ChevronRight/></button>}</section>
 <section className="section"><div className="section-title"><div><p className="eyebrow">CODA DI LAVORO</p><h2>Una lista, in ordine di urgenza</h2></div></div><div className="priority-list">{allPriorities.slice(0,12).map(p=>{const Icon=icon[p.kind];return <button key={p.id} onClick={()=>act(p)} className={'priority-row severity-'+p.severity}><span className="priority-icon"><Icon/></span><span><b>{p.title}</b><small>{p.detail}</small></span><ChevronRight/></button>})}{!allPriorities.length&&<div className="empty-state">Nessuna azione urgente. Ottimo momento per seguire nuovi clienti.</div>}</div></section></>
}
