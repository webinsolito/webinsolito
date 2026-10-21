import {useState} from 'react'
import {CalendarClock,ChevronRight,Clock3,PhoneCall} from 'lucide-react'
import {overdueCallbackCounts,overdueCallbackLabel,type TodayReservationCallback} from '../domain/todayReservationCallbacks'

const labelDate=(iso:string)=>new Date(iso).toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
export function TodayUpcomingReservationPanel({items,onSale}:{items:TodayReservationCallback[];onSale:(id:string)=>void}){
 const [showAll,setShowAll]=useState(false)
 if(!items.length)return null
 const counts=overdueCallbackCounts(items)
 return <section className="today-upcoming-reservations section" data-testid="today-upcoming-reservations">
  <div className="today-callback-head">
   <div><p className="eyebrow">PREVENZIONE · ENTRO 72 ORE</p><h2><CalendarClock/> Prenotazioni in scadenza</h2><p>Avvisa il cliente prima che scada la prenotazione. La scadenza non libera l'auto automaticamente.</p></div>
   <div className="today-callback-stats"><span><b data-testid="today-upcoming-to-do">{counts.toDo}</b> da gestire</span><span><b data-testid="today-upcoming-scheduled">{counts.scheduled}</b> programmati</span></div>
  </div>
  <div className="today-callback-list">{(showAll?items:items.slice(0,4)).map(item=><button type="button"
   key={item.id} className={'today-callback-row status-'+item.state.toLowerCase()} data-testid="today-upcoming-row"
   data-callback-state={item.state} onClick={()=>onSale(item.contractId)}
   aria-label={'Apri prenotazione in scadenza '+item.contractNumber+' di '+item.customerName}>
   <span className="today-callback-symbol">{item.state==='SCHEDULED'?<Clock3 size={19}/>:<PhoneCall size={19}/>}</span>
   <span className="today-callback-copy"><strong>{item.customerName} <span>· {item.contractNumber}</span></strong><small>{item.vehicleName}</small><small>Scade il {labelDate(item.expiresAt)}{item.lastContactAt?' · ultimo contatto '+labelDate(item.lastContactAt):''}</small></span>
   <span className="today-callback-state"><b>{overdueCallbackLabel(item.state)}</b>{item.callbackAt&&<small>Richiamo: {labelDate(item.callbackAt)}</small>}</span>
   <ChevronRight size={18} className="today-callback-arrow"/>
  </button>)}</div>
  {items.length>4&&<button type="button" className="today-callback-more" data-testid="today-upcoming-show-all" onClick={()=>setShowAll(v=>!v)}>{showAll?'Mostra i primi 4':'Mostra tutte le '+items.length+' prenotazioni'} <ChevronRight size={16}/></button>}
 </section>
}
