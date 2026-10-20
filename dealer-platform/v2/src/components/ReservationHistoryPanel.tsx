import {useEffect,useState} from 'react'
import {CalendarDays,ChevronDown,ChevronUp,History,RefreshCw,ShieldCheck} from 'lucide-react'
import {fetchReservationHistory} from '../lib/salesApi'
import {reservationEventActor,reservationEventDetails,reservationEventTitle,sortReservationHistory,type ReservationHistoryEvent} from '../domain/reservationHistory'
import type {Contract} from '../types'

const dateTime=(v?:string|null)=>{
 if(!v)return '—'
 const d=new Date(v)
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
}
export function ReservationHistoryPanel({contract}:{contract:Contract}){
 const [rows,setRows]=useState<ReservationHistoryEvent[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [expanded,setExpanded]=useState(false)
 const [reload,setReload]=useState(0)
 useEffect(()=>{
  let alive=true
  setLoading(true);setError('')
  void fetchReservationHistory(contract).then(value=>{
   if(!alive)return
   setRows(sortReservationHistory(value));setLoading(false)
  }).catch(()=>{
   if(!alive)return
   setRows([]);setError('Storico temporaneamente non disponibile. Riprova.');setLoading(false)
  })
  return()=>{alive=false}
 },[contract.id,contract.dealer_id,contract.sale_stage,contract.reservation_extension_count,contract.reservation_expires_at,reload])
 const visible=expanded?rows:rows.slice(0,4)
 return <section className="sale360-section reservation-history" data-testid="reservation-history-panel">
  <div className="sale360-head"><h3><History/> Storico prenotazione</h3>
   <button type="button" data-testid="reservation-history-refresh" aria-label="Aggiorna storico prenotazione" onClick={()=>setReload(x=>x+1)}><RefreshCw/> Aggiorna</button>
  </div>
  <p className="reservation-history-intro"><ShieldCheck size={15}/> Registro automatico in sola lettura · gli eventi non possono essere modificati dagli operatori.</p>
  {loading?<div className="sale360-empty" role="status">Caricamento storico…</div>
   :error?<div className="form-error" role="alert">{error}</div>
   :!rows.length?<div className="sale360-empty">Nessun evento registrato da quando lo storico è attivo. Gli eventi precedenti non vengono ricostruiti.</div>
   :<div className="reservation-history-list" data-testid="reservation-history-list">
     {visible.map(row=>{
      const [before,after]=reservationEventDetails(row)
      return <article className={'reservation-history-entry type-'+row.event_type.toLowerCase()} key={row.id} data-testid="reservation-history-event">
       <span className="reservation-history-marker"><CalendarDays size={15}/></span>
       <div className="reservation-history-copy">
        <div className="reservation-history-entry-head"><b>{reservationEventTitle(row)}</b><time dateTime={row.occurred_at}>{dateTime(row.occurred_at)}</time></div>
        <p className="reservation-history-actor">{reservationEventActor(row)}</p>
        {before&&after&&<p className="reservation-history-dates">Scadenza: {dateTime(before)} → <strong>{dateTime(after)}</strong></p>}
        {!before&&after&&<p className="reservation-history-dates">Scadenza: {dateTime(after)}</p>}
        {row.reason&&<p className="reservation-history-reason">Motivo: {row.reason}</p>}
       </div>
      </article>
     })}
     {rows.length>4&&<button type="button" className="reservation-history-more" data-testid="reservation-history-toggle" onClick={()=>setExpanded(x=>!x)}>{expanded?<ChevronUp/>:<ChevronDown/>}{expanded?'Mostra meno':'Mostra tutti gli eventi ('+rows.length+')'}</button>}
    </div>}
 </section>
}
