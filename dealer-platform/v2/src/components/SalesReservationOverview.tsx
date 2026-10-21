import {useState} from 'react'
import {CalendarClock,CheckCircle2,ChevronRight,Clock3,LockKeyhole,PhoneCall,ShieldAlert} from 'lucide-react'
import {buildSalesReservationOverview,filterSalesReservations,salesReservationBucketLabel,type SalesReservationFilter} from '../domain/salesReservationOverview'
import {overdueCallbackLabel} from '../domain/todayReservationCallbacks'
import type {TenantData} from '../types'

const datetime=(iso?:string|null)=>{
 if(!iso)return 'Da definire'
 const date=new Date(iso)
 return Number.isNaN(date.getTime())?'Da definire':date.toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
}
const filters:ReadonlyArray<{id:SalesReservationFilter;name:string}>=[
 {id:'ALL',name:'Tutte'},{id:'ACTION',name:'Da gestire'},
 {id:'SCHEDULED',name:'Programmate'},{id:'COMPLETED',name:'Completate'},
 {id:'NO_DEADLINE',name:'Senza scadenza'}
]
export function SalesReservationOverview({data,nowIso,onOpenSale}:{
 data:Pick<TenantData,'contracts'|'customers'|'vehicles'|'customerInteractions'>
 nowIso:string;onOpenSale:(contractId:string)=>void
}){
 const [filter,setFilter]=useState<SalesReservationFilter>('ALL')
 const [showAll,setShowAll]=useState(false)
 const overview=buildSalesReservationOverview(data,nowIso)
 const selected=filterSalesReservations(overview.rows,filter)
 const visible=showAll?selected:selected.slice(0,6)
 const counts=overview.counts
 return <section className="sales-booking-overview" data-testid="sales-booking-overview" aria-label="Riepilogo prenotazioni">
  <div className="sales-booking-head"><div><p className="eyebrow">CONTROLLO PRENOTAZIONI</p><h2><LockKeyhole size={20}/> Prenotazioni e richiami</h2><p>Stato reale dei contratti · le prenotazioni scadute non liberano le auto.</p></div></div>
  <div className="sales-booking-kpis" data-testid="sales-booking-kpis">
   <div className="sales-booking-kpi"><LockKeyhole size={17}/><small>Auto prenotate</small><b data-testid="sales-booking-active">{counts.active}</b></div>
   <div className="sales-booking-kpi critical"><ShieldAlert size={17}/><small>Scadute</small><b data-testid="sales-booking-overdue">{counts.overdue}</b></div>
   <div className="sales-booking-kpi warning"><CalendarClock size={17}/><small>Entro 72 ore</small><b data-testid="sales-booking-soon">{counts.soon}</b></div>
   <div className="sales-booking-kpi success"><CheckCircle2 size={17}/><small>Richiami completati</small><b data-testid="sales-booking-completed">{counts.completed}</b></div>
  </div>
  <div className="sales-booking-toolbar">
   <div className="sales-booking-filters" aria-label="Filtra prenotazioni">
    {filters.map(option=><button key={option.id} type="button"
     className={filter===option.id?'selected':''} data-testid={'sales-booking-filter-'+option.id.toLowerCase()}
     aria-pressed={filter===option.id} onClick={()=>{setFilter(option.id);setShowAll(false)}}>
     {option.name}{option.id==='ACTION'&&counts.action>0?<span>{counts.action}</span>:option.id==='SCHEDULED'&&counts.scheduled>0?<span>{counts.scheduled}</span>:option.id==='COMPLETED'&&counts.completed>0?<span>{counts.completed}</span>:option.id==='NO_DEADLINE'&&counts.noDeadline>0?<span>{counts.noDeadline}</span>:null}
    </button>)}
   </div>
   <small>{selected.length} prenotazion{selected.length===1?'e':'i'}</small>
  </div>
  <div className="sales-booking-rows">
   {visible.map(item=><button type="button" key={item.id} className={'sales-booking-row bucket-'+item.bucket.toLowerCase()}
    data-testid="sales-booking-row" data-booking-bucket={item.bucket} data-callback-state={item.callbackState||'NONE'}
    onClick={()=>onOpenSale(item.contractId)} aria-label={'Apri vendita '+item.contractNumber+' di '+item.customerName}>
    <span className="sales-booking-row-icon">{item.callbackState==='COMPLETED'?<CheckCircle2 size={18}/>:item.callbackState==='SCHEDULED'?<Clock3 size={18}/>:item.bucket==='OVERDUE'?<ShieldAlert size={18}/>:<PhoneCall size={18}/>}</span>
    <span className="sales-booking-row-main">
     <strong>{item.customerName} <span>· {item.contractNumber}</span></strong>
     <small>{item.vehicleName}</small>
     <small>{item.expiresAt?'Scadenza '+datetime(item.expiresAt):'Prenotazione senza data di scadenza'}{item.lastContactAt?' · ultimo contatto '+datetime(item.lastContactAt):''}</small>
    </span>
    <span className="sales-booking-row-right"><b className={'sales-booking-status bucket-'+item.bucket.toLowerCase()}>{salesReservationBucketLabel(item.bucket)}</b>
     <small>{item.callbackState?overdueCallbackLabel(item.callbackState):item.bucket==='NO_DEADLINE'?'Data da definire':'Nessun richiamo urgente'}</small>
     {item.callbackAt&&<small>Richiamo: {datetime(item.callbackAt)}</small>}
    </span>
    <ChevronRight size={17} className="sales-booking-arrow"/>
   </button>)}
   {!selected.length&&<div className="sales-booking-empty" data-testid="sales-booking-empty">{filter==='ALL'?'Nessuna auto attualmente prenotata.':'Nessuna prenotazione in questa categoria.'}</div>}
  </div>
  {selected.length>6&&<button type="button" className="sales-booking-more" data-testid="sales-booking-more"
   onClick={()=>setShowAll(x=>!x)}>{showAll?'Mostra le prime 6':'Mostra tutte le '+selected.length+' prenotazioni'} <ChevronRight size={16}/></button>}
 </section>
}
