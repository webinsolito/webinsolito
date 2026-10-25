import {useEffect,useMemo,useState} from 'react'
import {AlertTriangle,CalendarClock,Camera,CarFront,ChevronRight,Euro,PackageCheck,PhoneCall,Users,Wrench} from 'lucide-react'
import {buildPriorities,type PriorityItem} from '../domain/priorities'
import {buildInvoiceSummary} from '../domain/invoices'
import {buildCollectionSchedule} from '../domain/collections'
import {buildDeadlineSummary} from '../domain/deadlines'
import {activeReservationAlerts} from '../domain/reservationDeadlines'
import {buildGarageReviewSummary} from '../domain/garageReviewSummary'
import {garageReviewPriority} from '../domain/garageReviewPriority'
import {buildTodayReservationCallbacks,buildUpcomingReservationCallbacks,completedReservationCallbackCount,overdueCallbackCounts,overdueCallbackLabel} from '../domain/todayReservationCallbacks'
import {dedupeTodayPriorities,remainingTodayPriorities,selectTodayPrimaryAction} from '../domain/todayNextAction'
import {fetchCollectionFollowups,type InvoiceCollectionFollowup} from '../lib/collectionsApi'
import {TodayUpcomingReservationPanel} from '../components/TodayUpcomingReservationPanel'
import type {InvoiceDetail} from '../lib/invoiceApi'
import {money,vehicleName} from '../lib/format'
import type {TenantData,View} from '../types'
import '../today-garage-review.css'
import '../today-clarity.css'

const icon={PRICE:Euro,PHOTO:Camera,WORK:Wrench,AGE:CarFront,CALENDAR:CalendarClock,CUSTOMER:PhoneCall,DELIVERY:PackageCheck,COLLECTION:Euro}
const localDay=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')

export function TodayPage({data,dealerId,financeVisible=false,onVehicle,onSale,onView,onCollections,onDeadlines,onOpenGarageReview}:{data:TenantData;dealerId:string;financeVisible?:boolean;onVehicle:(id:string)=>void;onSale:(id:string)=>void;onView:(view:View)=>void;onCollections:()=>void;onDeadlines:()=>void;onOpenGarageReview:()=>void}){
 const [followups,setFollowups]=useState<InvoiceCollectionFollowup[]|null>(financeVisible?null:[])
 const [collectionsError,setCollectionsError]=useState(false)
 const [showAllBookingCallbacks,setShowAllBookingCallbacks]=useState(false)
 const [showCompletedBookingCallbacks,setShowCompletedBookingCallbacks]=useState(false)
 const [nowIso,setNowIso]=useState(()=>new Date().toISOString())
 useEffect(()=>{const tick=()=>setNowIso(new Date().toISOString());const timer=window.setInterval(tick,60_000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{window.clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[])
 useEffect(()=>{
  let active=true
  if(!financeVisible){setFollowups([]);setCollectionsError(false);return()=>{active=false}}
  setFollowups(null);setCollectionsError(false)
  void fetchCollectionFollowups().then(rows=>{if(active)setFollowups(rows)}).catch(()=>{if(active){setCollectionsError(true);setFollowups(null)}})
  return()=>{active=false}
 },[financeVisible])
 const priorities=useMemo(()=>buildPriorities(data),[data])
 const garageReview=useMemo(()=>buildGarageReviewSummary(data,dealerId),[data.vehicles,data.contracts,dealerId])
 const garageReviewDetails=[
  garageReview.reservation&&`${garageReview.reservation} prenotazion${garageReview.reservation===1?'e':'i'} incoerent${garageReview.reservation===1?'e':'i'}`,
  garageReview.blocked&&`${garageReview.blocked} bloccat${garageReview.blocked===1?'a':'e'}`,
  garageReview.other&&`${garageReview.other} altr${garageReview.other===1?'a':'e'}`
 ].filter(Boolean).join(' · ')
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
 const overdueCallbacks=useMemo(()=>buildTodayReservationCallbacks(data,nowIso),[data,nowIso])
 const upcomingReservations=useMemo(()=>buildUpcomingReservationCallbacks(data,nowIso),[data,nowIso])
 const operationalPriorities=useMemo(
  ()=>dedupeTodayPriorities(allPriorities,[...overdueCallbacks,...upcomingReservations]),
  [allPriorities,overdueCallbacks,upcomingReservations]
 )
 const primaryAction=useMemo(
  ()=>selectTodayPrimaryAction(operationalPriorities,overdueCallbacks,upcomingReservations),
  [operationalPriorities,overdueCallbacks,upcomingReservations]
 )
 const stock=data.vehicles.filter(v=>!['CONSEGNATA','VENDUTA','ANNULLATA'].includes(v.status||''))
 const customerActions=operationalPriorities.filter(p=>p.kind==='CUSTOMER').length
 const garageActions=operationalPriorities.filter(p=>['PRICE','PHOTO','WORK','AGE'].includes(p.kind)).length
 const deliveryActions=operationalPriorities.filter(p=>p.kind==='DELIVERY').length
 const act=(p:PriorityItem)=>{if(p.kind==='COLLECTION'){onCollections();return}if(p.kind==='DELIVERY'&&p.saleId){onSale(p.saleId);return}if(p.kind==='CUSTOMER'){onView('clients');return}if(p.kind==='CALENDAR'){onView('calendar');return}if(p.vehicleId){onVehicle(p.vehicleId);return}if(p.customerId)onView('clients')}
 const actionLabel=(p?:PriorityItem)=>p?.kind==='COLLECTION'?'Apri scadenziario':p?.kind==='DELIVERY'&&p.saleId?'Apri vendita 360°':p?.kind==='CUSTOMER'?'Apri clienti':p?.kind==='CALENDAR'?'Apri calendario':p?.vehicleId?'Apri auto':'Apri'
 const collectionCount=collectionsError?'—':followups===null?'…':String(collectionSchedule?.todayCount||0)
 const deadlineSummary=useMemo(()=>buildDeadlineSummary(data,localDay(),collectionSchedule?.tasks||[]),[data,collectionSchedule])
 const dueNow=deadlineSummary.overdue+deadlineSummary.today
 const urgentReservations=activeReservationAlerts(data,nowIso)
 const upcomingCount=overdueCallbackCounts(upcomingReservations)
 const bookingCallbackCounts=overdueCallbackCounts(overdueCallbacks)
 const completedOverdueCount=completedReservationCallbackCount(overdueCallbacks)
 const activeOverdueCallbacks=overdueCallbacks.filter(row=>row.state!=='COMPLETED')
 const completedOverdueCallbacks=overdueCallbacks.filter(row=>row.state==='COMPLETED')
 const bookingCallbackRows=showAllBookingCallbacks?activeOverdueCallbacks:activeOverdueCallbacks.slice(0,5)
 const remainingPriorities=useMemo(()=>remainingTodayPriorities(operationalPriorities,primaryAction,12),[operationalPriorities,primaryAction])
 const primaryTitle=primaryAction.source==='PRIORITY'?primaryAction.priority.title:
  primaryAction.source==='OVERDUE_RESERVATION'?'Richiamare '+primaryAction.callback.customerName:
  primaryAction.source==='UPCOMING_RESERVATION'?'Confermare '+primaryAction.callback.customerName:'Niente di urgente 🎉'
 const primaryDetail=primaryAction.source==='PRIORITY'?primaryAction.priority.detail:
  primaryAction.source==='OVERDUE_RESERVATION'?'Prenotazione '+primaryAction.callback.contractNumber+' scaduta · registra il ricontatto nella vendita.':
  primaryAction.source==='UPCOMING_RESERVATION'?'Prenotazione '+primaryAction.callback.contractNumber+' in scadenza · contatta il cliente prima del termine.':
  'Puoi passare ai clienti o al Garage senza emergenze aperte.'
 const primaryCta=primaryAction.source==='PRIORITY'?actionLabel(primaryAction.priority):
  primaryAction.source==='OVERDUE_RESERVATION'?'Apri vendita 360°':
  primaryAction.source==='UPCOMING_RESERVATION'?'Apri prenotazione':''
 const runPrimary=()=>{
  if(primaryAction.source==='PRIORITY'){act(primaryAction.priority);return}
  if(primaryAction.source==='OVERDUE_RESERVATION'||primaryAction.source==='UPCOMING_RESERVATION')onSale(primaryAction.callback.contractId)
 }
 const operationalCount=operationalPriorities.length+bookingCallbackCounts.toDo+upcomingCount.toDo
 const callbackDateTime=(value:string)=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value))

 return <><div className="page-heading today-heading" data-testid="today-heading"><div className="today-heading-copy"><p className="eyebrow">DEALER COCKPIT / LIVE</p><h1>Oggi <span className="today-live-dot" aria-hidden="true"/></h1><p>{operationalCount?operationalCount+' azioni concrete da gestire.'+(bookingCallbackCounts.toDo?' · '+bookingCallbackCounts.toDo+' prenotazioni scadute da verificare.':''): 'Nessun blocco urgente. Puoi lavorare sul commerciale.'}</p></div><div className="today-heading-meta"><span className="today-live-pill"><i aria-hidden="true"/>OPERATIVO</span><div className="mini-stat"><span>AUTO ATTIVE</span><b>{stock.length}</b></div></div></div>
 <div className={'today-kpis '+(financeVisible?'finance':'')}><button onClick={()=>onView('clients')}><Users/><span><b>{customerActions}</b><small>Clienti da ricontattare</small></span></button><button onClick={onDeadlines} data-testid={urgentReservations.length>0?'today-reservation-alert':undefined} aria-label="Apri centro scadenze"><CalendarClock/><span><b>{dueNow}</b><small>Centro scadenze</small>{urgentReservations.length>0&&<small className="today-kpi-reservation-count">{urgentReservations.length} prenotazion{urgentReservations.length===1?'e':'i'} da verificare</small>}</span></button><button onClick={()=>onView('garage')}><CarFront/><span><b>{garageActions}</b><small>Azioni sul Garage</small></span></button><button onClick={()=>onView('sales')} aria-label="Apri consegne da gestire"><PackageCheck/><span><b>{deliveryActions}</b><small>Consegne da gestire</small></span></button>{financeVisible&&<button onClick={onCollections} aria-label="Apri incassi da sollecitare"><Euro/><span><b>{collectionCount}</b><small>{collectionsError?'Scadenziario non disponibile':'Incassi da sollecitare'}</small></span></button>}</div>
 <section className="focus-card today-primary-action" data-testid="today-primary-action" data-primary-source={primaryAction.source}><div><p className="eyebrow">PRIMA COSA DA FARE</p><h2>{primaryTitle}</h2><p>{primaryDetail}</p></div>{primaryAction.source!=='NONE'&&<button className="focus-cta" onClick={runPrimary}>{primaryCta} <ChevronRight/></button>}</section>
 {garageReview.total>0&&<section className="today-garage-review-panel" data-testid="today-garage-review-panel" aria-label="Auto con disponibilità da verificare">
  <button type="button" className="today-garage-review" data-testid="today-garage-review" onClick={onOpenGarageReview}
   aria-label={`Apri Garage con ${garageReview.total} auto da verificare`}>
   <span className="today-garage-review-icon"><AlertTriangle size={19} aria-hidden="true"/></span>
   <span className="today-garage-review-copy"><strong><b data-testid="today-garage-review-count">{garageReview.total}</b> auto da verificare in Garage</strong><small data-testid="today-garage-review-detail">{garageReviewDetails}</small></span>
   <ChevronRight className="today-garage-review-arrow" size={20} aria-hidden="true"/>
  </button>
  <div className="today-garage-review-list" aria-label="Le prime tre auto da verificare">
   {garageReview.topVehicles.map(v=><button type="button" key={v.id} className="today-garage-review-vehicle"
    data-testid={`today-garage-review-car-${v.id}`}
    onClick={()=>onVehicle(v.id)} aria-label={`Apri scheda auto ${vehicleName(v)}, targa ${v.plate||'non indicata'}`}>
     <span className="today-garage-review-vehicle-icon"><CarFront size={19} aria-hidden="true"/></span>
     <span className="today-garage-review-vehicle-copy"><strong>{vehicleName(v)}</strong><small>{v.plate||'Targa non indicata'} · {garageReviewPriority(v).label}</small></span>
     <ChevronRight size={18} aria-hidden="true"/>
    </button>)}
  </div>
  {garageReview.total>3&&<p className="today-garage-review-more" data-testid="today-garage-review-more">+{garageReview.total-3} altre auto · Apri Garage per vederle tutte</p>}
 </section>}
 {overdueCallbacks.length>0&&<section className="today-overdue-callbacks section" data-testid="today-overdue-callbacks">
  <div className="today-callback-head">
   <div><p className="eyebrow">PRENOTAZIONI SCADUTE</p><h2><PhoneCall/> Richiami da seguire</h2><p>Contatta il cliente, registra l'esito e programma il prossimo richiamo. L'auto resta prenotata.</p></div>
   <div className="today-callback-stats"><span><b data-testid="today-callback-to-do">{bookingCallbackCounts.toDo}</b> da gestire</span><span><b data-testid="today-callback-scheduled">{bookingCallbackCounts.scheduled}</b> programmati</span>{completedOverdueCount>0&&<span><b data-testid="today-callback-completed">{completedOverdueCount}</b> completati</span>}</div>
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
  {activeOverdueCallbacks.length>5&&<button type="button" className="today-callback-more" data-testid="today-callback-show-all"
   onClick={()=>setShowAllBookingCallbacks(x=>!x)}>
   {showAllBookingCallbacks?'Mostra i primi 5':'Mostra tutti i '+activeOverdueCallbacks.length+' richiami'} <ChevronRight size={16}/>
  </button>}
  {completedOverdueCount>0&&<button type="button" className="today-callback-more" data-testid="today-callback-show-completed" onClick={()=>setShowCompletedBookingCallbacks(x=>!x)}>
   {showCompletedBookingCallbacks?'Nascondi completati':'Mostra '+completedOverdueCount+' richiami completati'} <ChevronRight size={16}/>
  </button>}
  {showCompletedBookingCallbacks&&completedOverdueCallbacks.map(item=><button type="button" key={item.id}
   className="today-callback-row status-completed" data-testid="today-completed-callback-row" onClick={()=>onSale(item.contractId)}>
   <span className="today-callback-symbol"><PhoneCall size={19}/></span>
   <span className="today-callback-copy"><strong>{item.customerName} · {item.contractNumber}</strong><small>{item.vehicleName}</small><small>Ultimo contatto: {item.lastContactAt?callbackDateTime(item.lastContactAt):'—'}</small></span>
   <span className="today-callback-state"><b>Completato</b></span><ChevronRight size={18}/>
  </button>)}
 </section>}
 <TodayUpcomingReservationPanel items={upcomingReservations} onSale={onSale}/>

 <section className="section" data-testid="today-other-priorities"><div className="section-title"><div><p className="eyebrow">ALTRE AZIONI</p><h2>Il resto della giornata</h2></div></div><div className="priority-list">{remainingPriorities.map(p=>{const Icon=icon[p.kind];return <button key={p.id} onClick={()=>act(p)} className={'priority-row severity-'+p.severity}><span className="priority-icon"><Icon/></span><span><b>{p.title}</b><small>{p.detail}</small></span><ChevronRight/></button>})}{!remainingPriorities.length&&<div className="empty-state">{primaryAction.source==='PRIORITY'&&operationalPriorities.length?'La prima attività è già evidenziata sopra.':'Nessuna altra azione urgente.'}</div>}</div></section></>
}
