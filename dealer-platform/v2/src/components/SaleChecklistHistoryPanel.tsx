import {useState} from 'react'
import {CheckCircle2,ChevronDown,ChevronUp,History,RefreshCw,RotateCcw,ShieldCheck} from 'lucide-react'
import {filterSaleChecklistHistory,saleChecklistHistoryActor,saleChecklistHistoryTitle} from '../domain/saleChecklistHistory'
import type {ReturnTypeSaleChecklistHistory} from '../lib/saleChecklistHistoryTypes'

const time=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export function SaleChecklistHistoryPanel({history,focusTitle=null,onShowAll}:{history:ReturnTypeSaleChecklistHistory;focusTitle?:string|null;onShowAll:()=>void}){
 const {events,loading,error,refresh}=history
 const [expanded,setExpanded]=useState(false)
 const filtered=filterSaleChecklistHistory(events,focusTitle)
 const shown=focusTitle?filtered:expanded?events:events.slice(0,4)
 return <section id="sale360-checklist-history-panel" className={'sale360-section sale-checklist-history'+(focusTitle?' focused':'')} data-testid="sale-checklist-history" tabIndex={-1} aria-label={focusTitle?'Storico verifica: '+focusTitle:'Storico verifiche'}>
  <div className="sale360-head"><h3><History/> Storico verifiche</h3>
   <button type="button" data-testid="sale-checklist-history-refresh" onClick={refresh}><RefreshCw/> Aggiorna</button>
  </div>
  {focusTitle&&<div className="sale-checklist-history-focus" data-testid="sale-checklist-history-filter">
    <span><b>Verifica selezionata</b><strong>{focusTitle}</strong></span>
    <button type="button" data-testid="sale-checklist-history-show-all" onClick={onShowAll}>Mostra tutto lo storico</button>
   </div>}
  <p className="sale-checklist-history-intro"><ShieldCheck size={15}/> Attività di consegna del veicolo · registro automatico, in sola lettura.</p>
  {loading?<div className="sale360-empty" role="status">Caricamento storico verifiche…</div>:
   error?<div className="form-error" role="alert">{error}</div>:
   !filtered.length?<div className="sale360-empty" data-testid="sale-checklist-history-empty">{focusTitle?'Nessun evento registrato per questa verifica. Potrebbe essere stata completata prima dell’attivazione dello storico.':'Nessun evento ancora registrato. Le verifiche precedenti all’attivazione dello storico non vengono ricostruite.'}</div>:
   <div className="sale-checklist-history-list" data-testid="sale-checklist-history-list">
    {shown.map(row=><article className="sale-checklist-history-event" key={row.id} data-testid="sale-checklist-history-event">
      {row.event_type==='COMPLETED'?<CheckCircle2/>:<RotateCcw/>}
      <div className="sale-checklist-history-copy">
       <div className="sale-checklist-history-entry-head"><b>{saleChecklistHistoryTitle(row)}</b><time dateTime={row.occurred_at}>{time(row.occurred_at)}</time></div>
       <p className="sale-checklist-history-title">{row.title}</p>
       <p className="sale-checklist-history-actor">{saleChecklistHistoryActor(row)}</p>
      </div>
     </article>)}
    {!focusTitle&&events.length>4&&<button type="button" className="sale-checklist-history-more" data-testid="sale-checklist-history-toggle" onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp/>:<ChevronDown/>}{expanded?'Mostra meno':'Mostra tutti ('+events.length+')'}</button>}
   </div>}
 </section>
}
