import {useEffect,useMemo,useState} from 'react'
import {ArrowLeft,BriefcaseBusiness,CalendarClock,ChevronRight,CarFront,Euro,FileText,PackageCheck,PhoneCall} from 'lucide-react'
import {buildDeadlineSummary,filterDeadlines,type DeadlineBucket,type DeadlineKind,type DeadlineItem} from '../domain/deadlines'
import {buildInvoiceSummary} from '../domain/invoices'
import {buildCollectionSchedule} from '../domain/collections'
import {fetchCollectionFollowups,type InvoiceCollectionFollowup} from '../lib/collectionsApi'
import type {InvoiceDetail} from '../lib/invoiceApi'
import type {TenantData} from '../types'

const localDay=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
const icons:Record<DeadlineKind,typeof CalendarClock>={CUSTOMER:PhoneCall,APPOINTMENT:CalendarClock,DELIVERY:PackageCheck,DOCUMENT:FileText,WORK:BriefcaseBusiness,COLLECTION:Euro,RESERVATION:CarFront}
const kindLabel:Record<DeadlineKind,string>={CUSTOMER:'RICHIAMO',APPOINTMENT:'APPUNTAMENTO',DELIVERY:'CONSEGNA',DOCUMENT:'PRATICA / DOCUMENTO',WORK:'ATTIVITÀ AUTO',COLLECTION:'INCASSO',RESERVATION:'PRENOTAZIONE AUTO'}
const dateLabel=(value:string)=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'))
const bucketLabel=(item:DeadlineItem,today:string)=>item.bucket==='OVERDUE'?'SCADUTA':item.bucket==='TODAY'?'OGGI':Math.ceil((Date.parse(item.date+'T12:00:00')-Date.parse(today+'T12:00:00'))/86400000)+' gg'

export function DeadlinesPage({data,financeVisible,onBack,onVehicle,onCustomer,onSale,onCalendar,onCollections}:{data:TenantData;financeVisible:boolean;onBack:()=>void;onVehicle:(id:string)=>void;onCustomer:(id:string)=>void;onSale:(id:string)=>void;onCalendar:()=>void;onCollections:()=>void}){
 const [followups,setFollowups]=useState<InvoiceCollectionFollowup[]|null>(financeVisible?null:[])
 const [financeError,setFinanceError]=useState(false)
 const [bucket,setBucket]=useState<'ALL'|DeadlineBucket>('ALL')
 const [kind,setKind]=useState<'ALL'|DeadlineKind>('ALL')
 const today=localDay()
 useEffect(()=>{
  let active=true
  if(!financeVisible){setFollowups([]);setFinanceError(false);return()=>{active=false}}
  setFollowups(null);setFinanceError(false)
  void fetchCollectionFollowups().then(rows=>{if(active)setFollowups(rows)}).catch(()=>{if(active){setFollowups([]);setFinanceError(true)}})
  return()=>{active=false}
 },[financeVisible])
 const collectionTasks=useMemo(()=>{
  if(!financeVisible||followups===null)return []
  const summary=buildInvoiceSummary(data.invoices as InvoiceDetail[],[],today)
  return buildCollectionSchedule(summary.rows,followups,today).tasks
 },[data.invoices,financeVisible,followups,today])
 const summary=useMemo(()=>buildDeadlineSummary(data,today,collectionTasks),[data,today,collectionTasks])
 const rows=useMemo(()=>filterDeadlines(summary.items,bucket,kind),[summary.items,bucket,kind])
 const open=(item:DeadlineItem)=>{if(item.kind==='COLLECTION'){onCollections();return}if((item.kind==='DELIVERY'||item.kind==='RESERVATION')&&item.saleId){onSale(item.saleId);return}if(item.vehicleId){onVehicle(item.vehicleId);return}if(item.customerId){onCustomer(item.customerId);return}onCalendar()}
 return <section className="deadline-page" data-testid="deadline-page">
  <div className="page-heading"><div><p className="eyebrow">CENTRO SCADENZE</p><h1>Tutto ciò che non deve sfuggire</h1><p>Richiami, appuntamenti, consegne, pratiche, lavori e incassi ordinati per urgenza.</p></div><div className="deadline-heading-actions"><button className="access-secondary" onClick={onBack}><ArrowLeft/>Indietro</button></div></div>
  <div className="deadline-kpis"><article className={summary.overdue?'danger':''}><span>SCADUTE</span><b>{summary.overdue}</b></article><article><span>OGGI</span><b>{summary.today}</b></article><article><span>ENTRO 7 GIORNI</span><b>{summary.next7}</b></article><article><span>PROSSIME</span><b>{summary.upcoming}</b></article></div>
  {financeVisible&&financeError&&<div className="invoice-alert"><span>Incassi temporaneamente non disponibili. Le altre scadenze restano aggiornate.</span></div>}
  <div className="deadline-tools" aria-label="Filtri scadenze">
   {([['ALL','Tutte'],['OVERDUE','Scadute'],['TODAY','Oggi'],['UPCOMING','Prossime']] as const).map(([key,label])=><button key={key} className={bucket===key?'active':''} onClick={()=>setBucket(key)}>{label}</button>)}
   {([['ALL','Ogni tipo'],['CUSTOMER','Richiami'],['APPOINTMENT','Appuntamenti'],['DELIVERY','Consegne'],['RESERVATION','Prenotazioni'],['DOCUMENT','Pratiche'],['WORK','Auto'],...(financeVisible?[['COLLECTION','Incassi'] as const]:[])] as const).map(([key,label])=><button key={key} className={kind===key?'active':''} onClick={()=>setKind(key)}>{label}</button>)}
  </div>
  <div className="deadline-list">{rows.map(item=>{const Icon=icons[item.kind];return <button key={item.id} className={'deadline-card '+item.bucket.toLowerCase()} onClick={()=>open(item)} aria-label={'Apri '+item.title}><span className="deadline-icon"><Icon/></span><span className="deadline-copy"><small>{kindLabel[item.kind]}</small><b>{item.title}</b><p>{item.detail}</p></span><span className="deadline-date"><b>{dateLabel(item.date)}</b><small>{bucketLabel(item,today)}</small><ChevronRight/></span></button>})}{!rows.length&&<div className="deadline-empty">{followups===null?'Caricamento scadenze…':'Nessuna scadenza con questi filtri.'}</div>}</div>
 </section>
}
