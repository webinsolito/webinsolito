import {FormEvent,useEffect,useMemo,useState} from 'react'
import {ArrowLeft,Building2,CheckCircle2,Clock3,KeyRound,ShieldCheck,XCircle} from 'lucide-react'
import {activateDealerRegistration,getDealerRegistrationStatus,requestDealerRegistration,type RegistrationDraft,type RegistrationReceipt,type RegistrationStatus} from '../lib/registrationApi'
import type {SessionPayload} from '../types'

const STORAGE_KEY='dealer-cockpit-registration'
const emptyDraft:RegistrationDraft={dealer_name:'',legal_name:'',vat_number:'',city:'',address:'',phone:'',owner_display_name:'',email:'',username:''}

function loadReceipt():RegistrationReceipt|null{
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}
}
function saveReceipt(value:RegistrationReceipt|null){if(value)localStorage.setItem(STORAGE_KEY,JSON.stringify(value));else localStorage.removeItem(STORAGE_KEY)}

export function RegistrationFlow({onBack,onLogin}:{onBack:()=>void;onLogin:(session:SessionPayload)=>void}){
  const initial=useMemo(loadReceipt,[])
  const [draft,setDraft]=useState<RegistrationDraft>(emptyDraft)
  const [receipt,setReceipt]=useState<RegistrationReceipt|null>(initial)
  const [remote,setRemote]=useState<RegistrationStatus|null>(initial?{ok:true,status:initial.status,dealer_name:'Concessionaria'}:null)
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  const status=remote?.status||receipt?.status||null

  useEffect(()=>{
    if(!receipt||status==='ACTIVATED'||status==='REJECTED')return
    let active=true
    const refresh=async()=>{
      try{
        const next=await getDealerRegistrationStatus(receipt)
        if(!active)return
        setRemote(next)
        if(next.status!==receipt.status){const updated={...receipt,status:next.status};setReceipt(updated);saveReceipt(updated)}
      }catch(err){if(active)setError(err instanceof Error?err.message:'Impossibile aggiornare la richiesta')}
    }
    void refresh()
    if(status!=='PENDING')return()=>{active=false}
    const timer=window.setInterval(()=>void refresh(),8000)
    const visible=()=>{if(document.visibilityState==='visible')void refresh()}
    document.addEventListener('visibilitychange',visible)
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[receipt?.request_id,status])

  function field<K extends keyof RegistrationDraft>(key:K,value:RegistrationDraft[K]){setDraft(v=>({...v,[key]:value}))}

  async function submitRequest(e:FormEvent){
    e.preventDefault();setBusy(true);setError('')
    try{
      const next=await requestDealerRegistration(draft)
      setReceipt(next);saveReceipt(next)
      setRemote({ok:true,status:'PENDING',dealer_name:draft.dealer_name})
    }catch(err){setError(err instanceof Error?err.message:'Registrazione non riuscita')}finally{setBusy(false)}
  }

  async function activate(e:FormEvent){
    e.preventDefault();setError('')
    if(!receipt)return
    if(password!==confirm){setError('Le due password non coincidono.');return}
    setBusy(true)
    try{
      const session=await activateDealerRegistration(receipt,password)
      saveReceipt(null)
      const slug=session.dealer?.slug||remote?.dealer_slug||''
      if(slug)localStorage.setItem('dealer-platform-last-dealer',slug)
      onLogin(session)
    }catch(err){setError(err instanceof Error?err.message:'Attivazione non riuscita')}finally{setBusy(false)}
  }

  if(!receipt)return <section className="registration-card"><button className="registration-back" type="button" onClick={onBack}><ArrowLeft/> Accedi</button><div className="registration-title"><span><Building2/></span><div><p className="eyebrow">NUOVA CONCESSIONARIA</p><h1>Richiedi l’accesso</h1><p>I dati vengono inviati per approvazione. La password verrà scelta solo dopo l’accettazione.</p></div></div><form className="registration-form" onSubmit={submitRequest}><div className="registration-grid"><label>NOME CONCESSIONARIA<input aria-label="NOME CONCESSIONARIA" value={draft.dealer_name} onChange={e=>field('dealer_name',e.target.value)} required placeholder="Autosalone Rossi"/></label><label>RAGIONE SOCIALE<input aria-label="RAGIONE SOCIALE" value={draft.legal_name} onChange={e=>field('legal_name',e.target.value)} required placeholder="Rossi Auto S.r.l."/></label><label>PARTITA IVA<input aria-label="PARTITA IVA" value={draft.vat_number} onChange={e=>field('vat_number',e.target.value)} required inputMode="text" placeholder="IT01234567890"/></label><label>TELEFONO<input aria-label="TELEFONO REGISTRAZIONE" value={draft.phone} onChange={e=>field('phone',e.target.value)} required inputMode="tel" placeholder="030 1234567"/></label><label>CITTÀ<input aria-label="CITTÀ" value={draft.city} onChange={e=>field('city',e.target.value)} required placeholder="Brescia"/></label><label>INDIRIZZO<input aria-label="INDIRIZZO" value={draft.address} onChange={e=>field('address',e.target.value)} required placeholder="Via Roma 10"/></label><label>NOME TITOLARE<input aria-label="NOME TITOLARE" value={draft.owner_display_name} onChange={e=>field('owner_display_name',e.target.value)} required placeholder="Mario Rossi"/></label><label>EMAIL TITOLARE<input aria-label="EMAIL TITOLARE" type="email" autoComplete="email" value={draft.email} onChange={e=>field('email',e.target.value)} required placeholder="mario@autosalone.it"/></label><label className="registration-wide">USERNAME<input aria-label="USERNAME REGISTRAZIONE" autoCapitalize="none" autoCorrect="off" value={draft.username} onChange={e=>field('username',e.target.value.toLowerCase())} required placeholder="mario.rossi"/><small>3–40 caratteri: lettere minuscole, numeri, punto, trattino o underscore.</small></label></div>{error&&<div className="registration-error">{error}</div>}<div className="registration-security"><ShieldCheck/><span><b>Nessuna password viene inviata per l’approvazione.</b> La creerai solamente dopo l’accettazione.</span></div><button className="primary" disabled={busy}>{busy?'Invio richiesta…':'Invia richiesta'}</button></form></section>

  if(status==='REJECTED')return <section className="registration-card registration-status"><XCircle className="status-icon rejected"/><p className="eyebrow">RICHIESTA RIFIUTATA</p><h1>Accesso non approvato</h1><p>La richiesta per <b>{remote?.dealer_name||'la concessionaria'}</b> non è stata accettata.</p><button className="primary" onClick={()=>{saveReceipt(null);setReceipt(null);setRemote(null);setError('')}}>Nuova richiesta</button><button className="registration-secondary" onClick={onBack}>Torna all’accesso</button></section>

  if(status==='APPROVED')return <section className="registration-card registration-status"><CheckCircle2 className="status-icon approved"/><p className="eyebrow">RICHIESTA APPROVATA</p><h1>Ultimo passaggio</h1><p><b>{remote?.dealer_name}</b> è pronta. Il tuo codice concessionaria è <strong className="dealer-code">{remote?.dealer_slug}</strong>.</p><form className="registration-password" onSubmit={activate}><label>NUOVA PASSWORD<input aria-label="NUOVA PASSWORD REGISTRAZIONE" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••••••"/></label><label>CONFERMA PASSWORD<input aria-label="CONFERMA PASSWORD REGISTRAZIONE" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required placeholder="••••••••••••"/></label><small>Minimo 12 caratteri con maiuscola, minuscola, numero e simbolo.</small>{error&&<div className="registration-error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Creazione accesso…':'Crea accesso ed entra'}</button></form></section>

  return <section className="registration-card registration-status"><Clock3 className="status-icon waiting"/><p className="eyebrow">RICHIESTA INVIATA</p><h1>In attesa di approvazione</h1><p>La richiesta per <b>{remote?.dealer_name||draft.dealer_name||'la concessionaria'}</b> è stata registrata. Questa pagina si aggiorna automaticamente quando viene approvata.</p><div className="registration-wait"><KeyRound/><span>Non devi inserire codici o contattare l’assistenza. Dopo l’approvazione comparirà qui la creazione della password.</span></div>{error&&<div className="registration-error">{error}</div>}<button className="registration-secondary" type="button" onClick={onBack}>Torna all’accesso</button></section>
}
