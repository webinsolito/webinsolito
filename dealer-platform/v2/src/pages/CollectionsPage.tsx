import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react'
import {ArrowLeft,CalendarClock,CheckCircle2,Clock3,Mail,Phone,ReceiptText,RotateCw,X} from 'lucide-react'
import {fetchTenantData,getSession} from '../lib/api'
import {type InvoiceDetail} from '../lib/invoiceApi'
import {canViewCollections,canWriteCollections,fetchCollectionFollowups,recordCollectionFollowup,type CollectionChannel,type CollectionOutcome,type InvoiceCollectionFollowup} from '../lib/collectionsApi'
import {buildInvoiceSummary} from '../domain/invoices'
import {buildCollectionSchedule,filterCollectionTasks,type CollectionFilter,type CollectionTask} from '../domain/collections'
import {money,vehicleName} from '../lib/format'
import type {TenantData} from '../types'
import '../collections.css'

const CHANNELS:Record<CollectionChannel,string>={TELEFONO:'Telefono',WHATSAPP:'WhatsApp',EMAIL:'Email',PEC:'PEC',ALTRO:'Altro'}
const OUTCOMES:Record<CollectionOutcome,string>={CONTATTATO:'Contattato',NESSUNA_RISPOSTA:'Nessuna risposta',PROMESSA_PAGAMENTO:'Promessa di pagamento',CONTESTAZIONE:'Contestazione',ALTRO:'Altro'}
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const dateLabel=(value?:string|null)=>value?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00')):'—'
function friendlyError(error:unknown){const m=error instanceof Error?error.message:String(error);if(m.includes('row-level security')||m.includes('dealer_access_locked'))return 'Non hai il permesso di registrare questo sollecito.';if(m.includes('duplicate key'))return 'Questo sollecito risulta già registrato. Aggiorna la pagina.';return m}

export function CollectionsPage({onBack}:{onBack:()=>void}){
 const [session]=useState(()=>getSession())
 const [data,setData]=useState<TenantData|null>(null)
 const [followups,setFollowups]=useState<InvoiceCollectionFollowup[]>([])
 const [busy,setBusy]=useState(true),[error,setError]=useState('')
 const [filter,setFilter]=useState<CollectionFilter>('today')
 const [editing,setEditing]=useState<CollectionTask|null>(null)
 const [detail,setDetail]=useState<string|null>(null)
 const allowed=canViewCollections(session),writable=canWriteCollections(session)
 const load=useCallback(async()=>{if(!session||!allowed){setError('Scadenziario non disponibile per questo profilo');setBusy(false);return}setBusy(true);setError('');try{const[tenant,logs]=await Promise.all([fetchTenantData(session),fetchCollectionFollowups()]);setData(tenant);setFollowups(logs)}catch(e){setError(friendlyError(e))}finally{setBusy(false)}},[session,allowed])
 useEffect(()=>{void load()},[load])
 const schedule=useMemo(()=>{if(!data)return null;return buildCollectionSchedule(buildInvoiceSummary(data.invoices as InvoiceDetail[],[],today()).rows,followups,today())},[data,followups])
 const tasks=useMemo(()=>schedule?filterCollectionTasks(schedule.tasks,filter):[],[schedule,filter])
 if(!allowed||!session)return <section className="collections-page"><button className="collections-back" onClick={onBack}><ArrowLeft/>Altro</button><p>Scadenziario riservato ad Amministrazione e Admin.</p></section>
 return <section className="collections-page" data-testid="collections-page">
  <header className="collections-heading"><button className="collections-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">SCADENZIARIO INCASSI</p><h1>Chi contattare oggi</h1><p>Fatture aperte, solleciti già fatti e prossimo controllo in un’unica lista operativa.</p></div><button className="collections-refresh" onClick={()=>void load()} disabled={busy}><RotateCw/>Aggiorna</button></header>
  {error&&<div className="collections-alert" role="alert"><span>{error}</span><button onClick={()=>void load()}>Riprova</button></div>}
  {busy&&!data?<div className="collections-loading">Caricamento scadenziario…</div>:schedule&&<>
   <div className="collections-kpis"><article className={schedule.todayCount?'urgent':''}><span><Phone/>DA CONTATTARE OGGI</span><b>{schedule.todayCount}</b><small>{money(schedule.todayAmount)} ancora da incassare</small></article><article><span><CalendarClock/>PROGRAMMATI</span><b>{schedule.scheduledCount}</b><small>con prossimo controllo futuro</small></article><article><span><Clock3/>SCADUTO</span><b>{schedule.overdueCount}</b><small>{money(schedule.overdueAmount)} oltre la scadenza</small></article></div>
   <div className="collections-filter">{([['today','Oggi'],['scheduled','Programmati'],['all','Tutti aperti']] as const).map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
   <div className="collections-list">{tasks.length?tasks.map(task=>{const inv=task.row.invoice,customer=data?.customers.find(c=>c.id===inv.customer_id),car=data?.vehicles.find(v=>v.id===inv.vehicle_id),expanded=detail===inv.id;return <article className={'collection-card '+(task.actionableToday?'today':'scheduled')} key={inv.id}>
    <div className="collection-main"><div><span className="collection-number">FATTURA {inv.number||'—'} · SCAD. {dateLabel(inv.due_date)}</span><h2>{inv.counterparty_name||'Cliente non indicato'}</h2><p>{car?vehicleName(car):'Veicolo non collegato'}{task.daysOverdue?' · '+task.daysOverdue+' gg di ritardo':''}</p>{task.latest&&<span className="collection-last">Ultimo: {OUTCOMES[task.latest.outcome]} · {dateLabel(task.latest.contacted_on)}</span>}</div><div className="collection-amount"><small>DA INCASSARE</small><b>{money(task.row.due)}</b><strong>{task.actionableToday?'Da gestire oggi':'Prossimo '+dateLabel(task.actionDate)}</strong></div></div>
    <div className="collection-contact">{customer?.phone&&<a href={'tel:'+customer.phone}><Phone/>Chiama</a>}{customer?.email&&<a href={'mailto:'+customer.email}><Mail/>Email</a>}<button onClick={()=>setDetail(expanded?null:inv.id)}><ReceiptText/>{expanded?'Chiudi storico':'Storico solleciti'}</button>{writable&&<button className="primary" onClick={()=>setEditing(task)}><CheckCircle2/>Registra sollecito</button>}</div>
    {expanded&&<div className="collection-history">{task.followups.length?task.followups.map(f=><div key={f.id}><strong>{OUTCOMES[f.outcome]}</strong><small>{dateLabel(f.contacted_on)} · {CHANNELS[f.channel]}{f.next_follow_up_on?' · prossimo '+dateLabel(f.next_follow_up_on):''}</small>{f.note&&<p>{f.note}</p>}</div>):<p>Nessun sollecito ancora registrato.</p>}</div>}
   </article>}):<div className="collections-empty">{filter==='today'?'Nessun incasso da sollecitare oggi.':'Nessuna fattura in questa vista.'}</div>}</div>
  </>}
  {editing&&<FollowupModal task={editing} busy={busy} onClose={()=>setEditing(null)} onSave={async draft=>{setBusy(true);setError('');try{await recordCollectionFollowup(draft);setEditing(null);await load()}catch(e){setError(friendlyError(e));setBusy(false);throw e}}}/>}
 </section>
}

function FollowupModal({task,busy,onClose,onSave}:{task:CollectionTask;busy:boolean;onClose:()=>void;onSave:(draft:{invoiceId:string;requestId:string;contactedOn:string;channel:CollectionChannel;outcome:CollectionOutcome;note:string;nextFollowUpOn:string})=>Promise<void>}){
 const [requestId]=useState(()=>crypto.randomUUID()),[contactedOn,setContactedOn]=useState(today()),[channel,setChannel]=useState<CollectionChannel>('TELEFONO'),[outcome,setOutcome]=useState<CollectionOutcome>('CONTATTATO'),[nextFollowUpOn,setNextFollowUpOn]=useState(''),[note,setNote]=useState(''),[localError,setLocalError]=useState('')
 async function submit(e:FormEvent){e.preventDefault();setLocalError('');if(nextFollowUpOn&&nextFollowUpOn<contactedOn){setLocalError('Il prossimo controllo non può essere precedente al contatto.');return}try{await onSave({invoiceId:task.row.invoice.id,requestId,contactedOn,channel,outcome,note,nextFollowUpOn})}catch(e){setLocalError(friendlyError(e))}}
 return <div className="collection-modal-wrap" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><form className="collection-modal" data-testid="collection-modal" onSubmit={e=>void submit(e)}><header><div><p className="eyebrow">REGISTRA SOLLECITO</p><h2>{task.row.invoice.counterparty_name}</h2><p>Fattura {task.row.invoice.number} · {money(task.row.due)} da incassare</p></div><button type="button" aria-label="Chiudi" onClick={onClose} disabled={busy}><X/></button></header>
  <div className="collection-form-grid"><label>Data contatto<input aria-label="Data contatto" type="date" max={today()} value={contactedOn} onChange={e=>setContactedOn(e.target.value)} required disabled={busy}/></label><label>Canale<select aria-label="Canale sollecito" value={channel} onChange={e=>setChannel(e.target.value as CollectionChannel)} disabled={busy}>{Object.entries(CHANNELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label></div>
  <label>Esito<select aria-label="Esito sollecito" value={outcome} onChange={e=>setOutcome(e.target.value as CollectionOutcome)} disabled={busy}>{Object.entries(OUTCOMES).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
  <label>Prossimo controllo (facoltativo)<input aria-label="Prossimo controllo" type="date" min={contactedOn} value={nextFollowUpOn} onChange={e=>setNextFollowUpOn(e.target.value)} disabled={busy}/></label>
  <label>Nota (facoltativa)<textarea aria-label="Nota sollecito" rows={3} maxLength={400} value={note} onChange={e=>setNote(e.target.value)} placeholder="Es. cliente conferma bonifico venerdì" disabled={busy}/></label>
  {localError&&<p className="collection-form-error" role="alert">{localError}</p>}<p className="collection-modal-note">Se imposti il prossimo controllo, la fattura sparisce da “Oggi” fino a quella data. Lo storico resta sempre visibile.</p>
  <footer><button type="button" onClick={onClose} disabled={busy}>Annulla</button><button className="primary" type="submit" disabled={busy}>{busy?'Salvataggio…':'Salva sollecito'}</button></footer>
 </form></div>
}
