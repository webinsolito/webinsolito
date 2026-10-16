import {FormEvent,useEffect,useMemo,useState} from 'react'
import {AlertTriangle,CalendarClock,CheckCircle2,Clock3,KeyRound,LogOut,RefreshCw,ShieldCheck,XCircle} from 'lucide-react'
import {changeOwnPassword} from '../lib/accessApi'
import {getDealerRenewalStatus,requestDealerRenewal,type RenewalReceipt,type RenewalStatus} from '../lib/renewalApi'
import type {AccessStatus,SessionPayload} from '../types'

const receiptKey=(dealerId:string)=>`dealer-cockpit-renewal:${dealerId}`
function loadReceipt(dealerId:string):RenewalReceipt|null{try{return JSON.parse(localStorage.getItem(receiptKey(dealerId))||'null')}catch{return null}}
function saveReceipt(dealerId:string,value:RenewalReceipt|null){if(value)localStorage.setItem(receiptKey(dealerId),JSON.stringify(value));else localStorage.removeItem(receiptKey(dealerId))}
const formatDate=(value?:string|null)=>value?new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)):'—'

export function PasswordChangeGate({session,currentPassword,onChanged,onLogout}:{session:SessionPayload;currentPassword?:string;onChanged:(session:SessionPayload)=>void;onLogout:()=>void}){
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(e:FormEvent){
    e.preventDefault();setError('')
    if(password!==confirm){setError('Le due password non coincidono.');return}
    if(currentPassword&&password===currentPassword){setError('La nuova password deve essere diversa da quella precedente.');return}
    setBusy(true)
    try{onChanged(await changeOwnPassword(session,password))}catch(err){setError(err instanceof Error?err.message:'Cambio password non riuscito')}finally{setBusy(false)}
  }
  return <main className="access-page"><section className="access-card"><div className="access-icon"><KeyRound/></div><p className="eyebrow">SICUREZZA ACCOUNT</p><h1>Crea una nuova password</h1><p className="access-copy">Per continuare devi cambiare la password. Fino a quel momento i dati della concessionaria restano bloccati.</p><form className="access-form" onSubmit={submit}><label>NUOVA PASSWORD<input aria-label="NUOVA PASSWORD MENSILE" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>CONFERMA PASSWORD<input aria-label="CONFERMA PASSWORD MENSILE" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label><small>Minimo 12 caratteri con maiuscola, minuscola, numero e simbolo. Deve essere diversa dalla precedente.</small>{error&&<div className="access-error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Aggiornamento…':'Cambia password e continua'}</button></form><button className="access-secondary" onClick={onLogout}><LogOut/> Esci</button></section></main>
}

export function RenewalControl({session,access,full=false,onApproved,onStatusChanged}:{session:SessionPayload;access:AccessStatus;full?:boolean;onApproved:()=>void;onStatusChanged?:()=>void}){
  const initial=useMemo(()=>loadReceipt(session.dealer.id),[session.dealer.id])
  const [receipt,setReceipt]=useState<RenewalReceipt|null>(initial)
  const [remote,setRemote]=useState<RenewalStatus|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const status=remote?.status||receipt?.status||null
  const isAdmin=session.profile.role==='ADMIN'

  useEffect(()=>{
    if(!receipt||status!=='PENDING')return
    let active=true
    const refresh=async()=>{
      try{
        const next=await getDealerRenewalStatus(receipt)
        if(!active)return
        setRemote(next)
        if(next.status!==receipt.status){const updated={...receipt,status:next.status,access_expires_at:next.access_expires_at};setReceipt(updated);saveReceipt(session.dealer.id,updated)}
        if(next.status==='APPROVED'){saveReceipt(session.dealer.id,null);onApproved()}
        else if(next.status==='REJECTED')onStatusChanged?.()
      }catch(err){if(active)setError(err instanceof Error?err.message:'Impossibile aggiornare il rinnovo')}
    }
    void refresh()
    const timer=window.setInterval(()=>void refresh(),8000)
    const visible=()=>{if(document.visibilityState==='visible')void refresh()}
    document.addEventListener('visibilitychange',visible)
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[receipt?.request_id,status,session.dealer.id])

  async function request(){
    setBusy(true);setError('')
    try{const next=await requestDealerRenewal(session);setReceipt(next);setRemote(null);saveReceipt(session.dealer.id,next)}catch(err){setError(err instanceof Error?err.message:'Richiesta rinnovo non riuscita')}finally{setBusy(false)}
  }
  function reset(){saveReceipt(session.dealer.id,null);setReceipt(null);setRemote(null);setError('')}

  const state=status==='PENDING'?'pending':status==='REJECTED'?'rejected':access.expired?'expired':'expiring'
  if(!full)return <div className={`renewal-banner ${state}`}><CalendarClock/><div><b>{status==='PENDING'?'Rinnovo richiesto':`Accesso in scadenza il ${formatDate(access.dealer.access_expires_at)}`}</b><span>{status==='PENDING'?'In attesa di approvazione. Puoi continuare a lavorare fino alla scadenza.':`Mancano ${access.days_remaining} giorni. ${isAdmin?'Richiedi ora il rinnovo.':'Il titolare deve richiedere il rinnovo.'}`}</span>{error&&<em>{error}</em>}</div>{status==='PENDING'?<span className="renewal-wait"><Clock3/> In attesa</span>:isAdmin?<button onClick={()=>void request()} disabled={busy}>{busy?'Invio…':'Richiedi rinnovo'}</button>:null}</div>

  return <main className="access-page"><section className="access-card renewal-card">{state==='rejected'?<XCircle className="access-large-icon rejected"/>:state==='pending'?<Clock3 className="access-large-icon waiting"/>:<AlertTriangle className="access-large-icon warning"/>}<p className="eyebrow">ACCESSO CONCESSIONARIA</p><h1>{state==='pending'?'Rinnovo in approvazione':state==='rejected'?'Rinnovo non approvato':'Accesso scaduto'}</h1><p className="access-copy">{state==='pending'?`La richiesta per ${session.dealer.display_name||'la concessionaria'} è stata inviata. Questa pagina si aggiorna automaticamente.`:state==='rejected'?'Il rinnovo è stato rifiutato. I dati restano conservati e non vengono cancellati.':`L’accesso è scaduto il ${formatDate(access.dealer.access_expires_at)}. I dati sono al sicuro, ma il gestionale resta bloccato finché il rinnovo non viene approvato.`}</p>{state==='pending'&&<div className="access-info"><ShieldCheck/><span>Quando il rinnovo viene approvato, tutte le sessioni vengono chiuse e ogni utente dovrà creare una nuova password.</span></div>}{state==='rejected'&&isAdmin&&<button className="primary" onClick={reset}>Richiedi nuovamente</button>}{!status&&isAdmin&&<button className="primary" disabled={busy} onClick={()=>void request()}>{busy?'Invio richiesta…':'Richiedi rinnovo'}</button>}{!isAdmin&&state!=='pending'&&<div className="access-info"><RefreshCw/><span>Il titolare o un amministratore deve richiedere il rinnovo.</span></div>}{error&&<div className="access-error">{error}</div>}<div className="access-retention"><CheckCircle2/><span>Nessuna auto, cliente, documento o storico viene eliminato durante il blocco.</span></div></section></main>
}
