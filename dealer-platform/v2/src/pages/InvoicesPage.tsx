import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react'
import {ArrowLeft,CalendarClock,CheckCircle2,Clock3,Landmark,ReceiptText,RotateCw,Search,WalletCards,X} from 'lucide-react'
import {fetchTenantData,getSession} from '../lib/api'
import {canViewInvoices,canWriteInvoices,fetchInvoiceReceipts,recordInvoiceReceipt,type InvoiceDetail,type InvoiceReceipt,type PaymentMethod} from '../lib/invoiceApi'
import {buildInvoiceSummary,filterInvoices,type InvoiceFilter,type InvoiceRow} from '../domain/invoices'
import {money,vehicleName} from '../lib/format'
import type {TenantData} from '../types'
import '../invoices.css'

const METHODS:Record<PaymentMethod,string>={BONIFICO:'Bonifico',POS:'POS / Carta',CONTANTI:'Contanti',ASSEGNO:'Assegno',FINANZIAMENTO:'Finanziamento',ALTRO:'Altro'}
const dateLabel=(value?:string|null)=>value?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00')):'Non impostata'
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function friendlyError(error:unknown){const m=error instanceof Error?error.message:String(error);if(m.includes('payment_exceeds_balance'))return 'Importo superiore al saldo disponibile. Aggiorna i dati e riprova.';if(m.includes('receipt_request_conflict'))return 'La richiesta è già stata usata per un pagamento differente.';if(m.includes('session_revoked'))return 'Sessione scaduta. Esci e accedi nuovamente.';if(m.includes('invoices_write_forbidden')||m.includes('dealer_access_locked'))return 'Non hai il permesso di registrare questo incasso.';return m}

export function InvoicesPage({onBack}:{onBack:()=>void}){
 const [session]=useState(()=>getSession())
 const [data,setData]=useState<TenantData|null>(null)
 const [receipts,setReceipts]=useState<InvoiceReceipt[]>([])
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const [filter,setFilter]=useState<InvoiceFilter>('open')
 const [search,setSearch]=useState('')
 const [editing,setEditing]=useState<InvoiceRow|null>(null)
 const [detail,setDetail]=useState<string|null>(null)
 const allowed=canViewInvoices(session),writable=canWriteInvoices(session)
 const load=useCallback(async()=>{if(!session||!allowed){setError('Fatture non disponibili per questo profilo');setBusy(false);return}setBusy(true);setError('');try{const [tenant,payments]=await Promise.all([fetchTenantData(session),fetchInvoiceReceipts()]);setData(tenant);setReceipts(payments)}catch(e){setError(friendlyError(e))}finally{setBusy(false)}},[session,allowed])
 useEffect(()=>{void load()},[load])
 const summary=useMemo(()=>data?buildInvoiceSummary(data.invoices as InvoiceDetail[],receipts,today()):null,[data,receipts])
 const rows=useMemo(()=>summary?filterInvoices(summary.rows,filter,search):[],[summary,filter,search])
 if(!allowed||!session)return <section className="invoice-page"><button className="invoice-back" onClick={onBack}><ArrowLeft/>Altro</button><p>Area fatture riservata ad Amministrazione e Admin.</p></section>
 return <section className="invoice-page" data-testid="invoice-page">
  <header className="invoice-heading"><button className="invoice-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">FATTURE E INCASSI</p><h1>Saldi sotto controllo</h1><p>Pagamenti registrati sulle fatture vendita. I valori si aggiornano anche in Finanze e Report.</p></div><button className="invoice-refresh" onClick={()=>void load()} disabled={busy}><RotateCw/>Aggiorna</button></header>
  {error&&<div className="invoice-alert" role="alert"><span>{error}</span><button onClick={()=>void load()}>Riprova</button></div>}
  {busy&&!data?<div className="invoice-loading">Caricamento fatture…</div>:summary&&<>
   <div className="invoice-kpis">
    <article><span><ReceiptText/>FATTURATO VENDITA</span><b>{money(summary.total)}</b><small>Tutte le fatture vendita archiviate</small></article>
    <article><span><WalletCards/>INCASSATO</span><b>{money(summary.collected)}</b><small>Importi già registrati</small></article>
    <article><span><Landmark/>DA INCASSARE</span><b>{money(summary.remaining)}</b><small>{summary.openCount} fatture con saldo aperto</small></article>
    <article className={summary.overdueCount?'late':''}><span><Clock3/>SCADUTO</span><b>{money(summary.overdueAmount)}</b><small>{summary.overdueCount} fatture oltre la scadenza</small></article>
   </div>
   <div className="invoice-tools"><label><Search/><input aria-label="Cerca fatture" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Numero, cliente o riferimento auto"/></label><div className="invoice-filter">{([['open','Da incassare'],['overdue','Scadute'],['paid','Saldate'],['all','Tutte']] as const).map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div></div>
   <div className="invoice-list">{rows.length?rows.map(row=>{
    const inv=row.invoice,car=data?.vehicles.find(v=>v.id===inv.vehicle_id),expanded=detail===inv.id
    return <article key={inv.id} className={'invoice-card '+(row.overdue?'overdue':'')}>
     <div className="invoice-card-main"><div className="invoice-identity"><span className="invoice-number">FATTURA {inv.number||'—'} · {dateLabel(inv.issue_date)}</span><h2>{inv.counterparty_name||'Cliente non indicato'}</h2><p>{car?vehicleName(car):'Veicolo non collegato'}{car?.plate?' · '+car.plate:''}</p><span className={'invoice-status '+(row.overdue?'overdue':row.state.toLowerCase())}>{row.overdue?'SCADUTA':row.state==='PAID'?'SALDATA':row.state==='PARTIAL'?'PARZIALE':'NON PAGATA'}</span></div>
       <div className="invoice-amount"><small>TOTALE</small><b>{money(row.total)}</b><small>PAGATO {money(row.paid)}</small><strong>{row.due>0?money(row.due)+' da incassare':'Saldo completato'}</strong><span>Scadenza: {dateLabel(inv.due_date)}</span></div></div>
     <div className="invoice-actions"><button onClick={()=>setDetail(expanded?null:inv.id)}><ReceiptText/>{expanded?'Chiudi dettaglio':'Storico incassi'}</button>{writable&&row.due>0&&<button className="primary" onClick={()=>setEditing(row)} disabled={busy}><CheckCircle2/>Registra incasso</button>}</div>
     {expanded&&<div className="invoice-history"><b>Storico pagamenti registrati</b>{row.receipts.length?row.receipts.map(r=><div className="invoice-receipt" key={r.id}><div><strong>{money(r.amount)}</strong><small>{dateLabel(r.paid_on)} · {METHODS[r.payment_method]||r.payment_method}{r.reference?' · '+r.reference:''}</small>{r.note&&<small>{r.note}</small>}</div><small>{dateLabel(r.created_at?.slice(0,10))}</small></div>):<p>Nessun incasso dettagliato registrato in questa versione.</p>}{row.historicalPaid>0&&<p className="invoice-old-paid">Già pagato prima dell’attivazione del registro: <b>{money(row.historicalPaid)}</b>. Conteggiato nel saldo, ma senza singoli movimenti storici.</p>}</div>}
    </article>
   }):<div className="invoice-empty">Nessuna fattura corrisponde ai filtri selezionati.</div>}</div>
   <p className="invoice-disclaimer">I totali qui includono le fatture vendita, anche quelle ancora da verificare. In Report i ricavi e i margini vengono riconosciuti solo sulle vendite consegnate e verificate. Questa area registra incassi: non emette documenti fiscali.</p>
  </>}
  {editing&&<PaymentModal key={editing.invoice.id} row={editing} busy={busy} onClose={()=>setEditing(null)} onSave={async draft=>{setBusy(true);setError('');try{await recordInvoiceReceipt(draft);setEditing(null);await load()}catch(e){setError(friendlyError(e));setBusy(false);throw e}}}/>}
 </section>
}

function PaymentModal({row,busy,onClose,onSave}:{row:InvoiceRow;busy:boolean;onClose:()=>void;onSave:(draft:{invoiceId:string;requestId:string;amount:number;paidOn:string;method:PaymentMethod;reference:string;note:string})=>Promise<void>}){
 const [requestId]=useState(()=>crypto.randomUUID())
 const [amount,setAmount]=useState(row.due.toFixed(2))
 const [paidOn,setPaidOn]=useState(today())
 const [method,setMethod]=useState<PaymentMethod>('BONIFICO')
 const [reference,setReference]=useState('')
 const [note,setNote]=useState('')
 const [localError,setLocalError]=useState('')
 async function submit(e:FormEvent){e.preventDefault();setLocalError('');const value=Number(amount);if(!Number.isFinite(value)||value<=0||Math.round(value*100)>Math.round(row.due*100)){setLocalError('L’importo deve essere positivo e non superare il saldo.');return}try{await onSave({invoiceId:row.invoice.id,requestId,amount:value,paidOn,method,reference,note})}catch(e){setLocalError(friendlyError(e))}}
 return <div className="invoice-modal-wrap" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><form className="invoice-modal" onSubmit={e=>void submit(e)} data-testid="payment-modal"><header><div><p className="eyebrow">REGISTRA INCASSO</p><h2>{row.invoice.counterparty_name}</h2><p>Fattura {row.invoice.number} · Saldo {money(row.due)}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Chiudi"><X/></button></header>
  <div className="invoice-form-grid"><label>Importo incassato €<input aria-label="Importo incassato" required type="number" min="0.01" max={row.due} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label><label>Data incasso<input type="date" aria-label="Data incasso" required value={paidOn} max={today()} onChange={e=>setPaidOn(e.target.value)} disabled={busy}/></label></div>
  <label>Metodo di pagamento<select aria-label="Metodo di pagamento" value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)} disabled={busy}>{Object.entries(METHODS).map(([key,value])=><option value={key} key={key}>{value}</option>)}</select></label>
  <label>Riferimento (facoltativo)<input placeholder="Es. CRO bonifico" maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></label>
  <label>Note (facoltative)<textarea rows={2} maxLength={400} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
  {localError&&<p className="invoice-form-error" role="alert">{localError}</p>}<p className="invoice-modal-note">L’operazione sarà registrata nello storico e non può essere cancellata da questa schermata. In caso di errore di rete puoi riprovare senza duplicarla.</p>
  <footer><button type="button" onClick={onClose} disabled={busy}>Annulla</button><button className="primary" type="submit" disabled={busy}>{busy?'Registrazione…':'Conferma incasso'}</button></footer>
 </form></div>
}
