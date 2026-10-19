import {useEffect,useMemo,useState} from 'react'
import {AlertTriangle,CalendarClock,Camera,CarFront,ChevronRight,Euro,PhoneCall,Users,Wrench} from 'lucide-react'
import {buildPriorities,type PriorityItem} from '../domain/priorities'
import {buildInvoiceSummary} from '../domain/invoices'
import {buildCollectionSchedule} from '../domain/collections'
import {fetchCollectionFollowups,type InvoiceCollectionFollowup} from '../lib/collectionsApi'
import type {InvoiceDetail} from '../lib/invoiceApi'
import {money} from '../lib/format'
import type {TenantData,View} from '../types'

const icon={PRICE:Euro,PHOTO:Camera,WORK:Wrench,AGE:CarFront,CALENDAR:CalendarClock,CUSTOMER:PhoneCall,DELIVERY:AlertTriangle,COLLECTION:Euro}
const localDay=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')

export function TodayPage({data,financeVisible=false,onVehicle,onView,onCollections}:{data:TenantData;financeVisible?:boolean;onVehicle:(id:string)=>void;onView:(view:View)=>void;onCollections:()=>void}){
 const [followups,setFollowups]=useState<InvoiceCollectionFollowup[]|null>(financeVisible?null:[])
 const [collectionsError,setCollectionsError]=useState(false)
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
 const calendarActions=priorities.filter(p=>p.kind==='CALENDAR').length
 const garageActions=priorities.filter(p=>['PRICE','PHOTO','WORK','AGE'].includes(p.kind)).length
 const act=(p:PriorityItem)=>{if(p.kind==='COLLECTION'){onCollections();return}if(p.kind==='CUSTOMER'){onView('clients');return}if(p.kind==='CALENDAR'){onView('calendar');return}if(p.vehicleId){onVehicle(p.vehicleId);return}if(p.customerId)onView('clients')}
 const actionLabel=(p?:PriorityItem)=>p?.kind==='COLLECTION'?'Apri scadenziario':p?.kind==='CUSTOMER'?'Apri clienti':p?.kind==='CALENDAR'?'Apri calendario':p?.vehicleId?'Apri auto':'Apri'
 const collectionCount=collectionsError?'—':followups===null?'…':String(collectionSchedule?.todayCount||0)
 return <><div className="page-heading"><div><p className="eyebrow">COMANDO OPERATIVO</p><h1>Oggi</h1><p>{allPriorities.length?allPriorities.length+' azioni concrete da gestire.':'Nessun blocco urgente. Puoi lavorare sul commerciale.'}</p></div><div className="mini-stat"><span>AUTO ATTIVE</span><b>{stock.length}</b></div></div>
 <div className={'today-kpis '+(financeVisible?'finance':'')}><button onClick={()=>onView('clients')}><Users/><span><b>{customerActions}</b><small>Clienti da ricontattare</small></span></button><button onClick={()=>onView('calendar')}><CalendarClock/><span><b>{calendarActions}</b><small>Scadenze / appuntamenti</small></span></button><button onClick={()=>onView('garage')}><CarFront/><span><b>{garageActions}</b><small>Azioni sul Garage</small></span></button>{financeVisible&&<button onClick={onCollections} aria-label="Apri incassi da sollecitare"><Euro/><span><b>{collectionCount}</b><small>{collectionsError?'Scadenziario non disponibile':'Incassi da sollecitare'}</small></span></button>}</div>
 <section className="focus-card"><div><p className="eyebrow">PRIMA COSA DA FARE</p><h2>{allPriorities[0]?.title||'Niente di urgente 🎉'}</h2><p>{allPriorities[0]?.detail||'Puoi passare ai clienti o al Garage senza emergenze aperte.'}</p></div>{allPriorities[0]&&<button className="focus-cta" onClick={()=>act(allPriorities[0])}>{actionLabel(allPriorities[0])} <ChevronRight/></button>}</section>
 <section className="section"><div className="section-title"><div><p className="eyebrow">CODA DI LAVORO</p><h2>Una lista, in ordine di urgenza</h2></div></div><div className="priority-list">{allPriorities.slice(0,12).map(p=>{const Icon=icon[p.kind];return <button key={p.id} onClick={()=>act(p)} className={'priority-row severity-'+p.severity}><span className="priority-icon"><Icon/></span><span><b>{p.title}</b><small>{p.detail}</small></span><ChevronRight/></button>})}{!allPriorities.length&&<div className="empty-state">Nessuna azione urgente. Ottimo momento per seguire nuovi clienti.</div>}</div></section></>
}
