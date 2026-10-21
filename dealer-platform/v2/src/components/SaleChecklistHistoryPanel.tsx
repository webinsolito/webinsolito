import {useEffect,useState} from 'react'
import {CheckCircle2,ChevronDown,ChevronUp,History,RefreshCw,RotateCcw,ShieldCheck} from 'lucide-react'
import {fetchSaleChecklistHistory} from '../lib/saleChecklistHistoryApi'
import {saleChecklistHistoryActor,saleChecklistHistoryTitle,visibleSaleChecklistHistory,type SaleChecklistHistoryEvent} from '../domain/saleChecklistHistory'
import type {Contract,TenantData} from '../types'

const time=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export function SaleChecklistHistoryPanel({contract,workItems}:{contract:Contract;workItems:TenantData['workItems']}){
 const [events,setEvents]=useState<SaleChecklistHistoryEvent[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [expanded,setExpanded]=useState(false)
 const [reload,setReload]=useState(0)
 useEffect(()=>{
  let alive=true
  setLoading(true);setError('')
  void fetchSaleChecklistHistory(contract).then(rows=>{
   if(!alive)return
   setEvents(visibleSaleChecklistHistory(rows,contract));setLoading(false)
  }).catch(()=>{
   if(!alive)return
   setEvents([]);setError('Impossibile caricare lo storico. Riprova.');setLoading(false)
  })
  return()=>{alive=false}
 },[contract.dealer_id,contract.vehicle_id,workItems,reload])
 const shown=expanded?events:events.slice(0,4)
 return <section className="sale360-section sale-checklist-history" data-testid="sale-checklist-history">
  <div className="sale360-head"><h3><History/> Storico verifiche</h3>
   <button type="button" data-testid="sale-checklist-history-refresh" onClick={()=>setReload(x=>x+1)}><RefreshCw/> Aggiorna</button>
  </div>
  <p className="sale-checklist-history-intro"><ShieldCheck size={15}/> Attività di consegna del veicolo · registro automatico, in sola lettura.</p>
  {loading?<div className="sale360-empty" role="status">Caricamento storico verifiche…</div>:
   error?<div className="form-error" role="alert">{error}</div>:
   !events.length?<div className="sale360-empty" data-testid="sale-checklist-history-empty">Nessun evento ancora registrato. Le verifiche precedenti all'attivazione dello storico non vengono ricostruite.</div>:
   <div className="sale-checklist-history-list" data-testid="sale-checklist-history-list">
    {shown.map(row=><article className="sale-checklist-history-event" key={row.id} data-testid="sale-checklist-history-event">
      {row.event_type==='COMPLETED'?<CheckCircle2/>:<RotateCcw/>}
      <div className="sale-checklist-history-copy">
       <div className="sale-checklist-history-entry-head"><b>{saleChecklistHistoryTitle(row)}</b><time dateTime={row.occurred_at}>{time(row.occurred_at)}</time></div>
       <p className="sale-checklist-history-title">{row.title}</p>
       <p className="sale-checklist-history-actor">{saleChecklistHistoryActor(row)}</p>
      </div>
     </article>)}
    {events.length>4&&<button type="button" className="sale-checklist-history-more" data-testid="sale-checklist-history-toggle" onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp/>:<ChevronDown/>}{expanded?'Mostra meno':'Mostra tutti ('+events.length+')'}</button>}
   </div>}
 </section>
}
