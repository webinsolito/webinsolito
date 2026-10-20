import {useState} from 'react'
import {AlertTriangle,LockKeyhole,XCircle} from 'lucide-react'
import {formatSaleCancelReason,SALE_CANCEL_REASONS,saleCancellationAuthority,type SaleCancelReasonCode} from '../domain/saleCancellation'
import type {Contract,SessionPayload} from '../types'

const dateTime=(value?:string|null)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export function SaleCancellationPanel({contract,session,busy=false,onCancel}:{contract:Contract;session:SessionPayload;busy?:boolean;onCancel:(reason:string)=>Promise<void>}){
 const cancelled=String(contract.sale_stage||'').toUpperCase()==='CANCELLED'
 const delivered=String(contract.sale_stage||'').toUpperCase()==='DELIVERED'
 const authority=saleCancellationAuthority(session,contract)
 const [open,setOpen]=useState(false)
 const [reason,setReason]=useState<SaleCancelReasonCode|''>('') 
 const [details,setDetails]=useState('')
 const [confirming,setConfirming]=useState(false)
 const [error,setError]=useState('')

 if(delivered)return null
 if(cancelled)return <section className="sale360-cancelled" data-testid="sale-cancelled-summary"><div><XCircle/><span><small>VENDITA ANNULLATA</small><b>{contract.sale_cancel_reason||'Motivo non disponibile'}</b></span></div><p>Annullata il {dateTime(contract.sale_cancelled_at)}. La pratica è terminale e non può essere riaperta.</p></section>

 const canContinue=Boolean(reason)&&(reason!=='ALTRO'||details.trim().length>=4)
 const finalReason=reason?formatSaleCancelReason(reason,details):''
 const submit=async()=>{setError('');try{await onCancel(finalReason)}catch(err){setError(err instanceof Error?err.message:'Impossibile annullare la vendita');setConfirming(false)}}

 return <section className="sale360-cancel" data-testid="sale-cancellation">
  {!open?<button className="sale360-cancel-open" data-testid="open-sale-cancel" onClick={()=>setOpen(true)}><XCircle/> Annulla vendita</button>:<>
   <div className="sale360-cancel-head"><div><small>ANNULLAMENTO VENDITA</small><h3>Chiudi la pratica in sicurezza</h3></div><button aria-label="Chiudi annullamento" onClick={()=>{setOpen(false);setConfirming(false);setError('')}}>×</button></div>
   <div className="sale360-cancel-warning"><AlertTriangle/><p>La vendita diventerà definitiva in <b>Annullate</b>. Gli appuntamenti di consegna verranno chiusi e l’auto tornerà disponibile solo se non esistono altre vendite attive.</p></div>
   {!authority.allowed?<div className="sale360-cancel-lock" data-testid="sale-cancel-admin-lock"><LockKeyhole/><span><b>Serve Admin/Amministrazione</b><small>{authority.reason}</small></span></div>:!confirming?<div className="sale360-cancel-form">
    <label><span>MOTIVO</span><select aria-label="Motivo annullamento" value={reason} onChange={e=>setReason(e.target.value as SaleCancelReasonCode|'')}><option value="">Seleziona motivo…</option>{SALE_CANCEL_REASONS.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
    <label><span>DETTAGLI {reason==='ALTRO'?'(OBBLIGATORI)':'(OPZIONALI)'}</span><textarea aria-label="Dettagli annullamento" maxLength={180} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Nota breve per capire perché la vendita è stata annullata."/></label>
    <button className="sale360-cancel-next" disabled={!canContinue||busy} onClick={()=>setConfirming(true)}>Continua</button>
   </div>:<div className="sale360-cancel-confirm">
    <p>Stai per annullare definitivamente <b>{contract.contract_number}</b>.</p>
    <div><span>MOTIVO</span><b>{finalReason}</b></div>
    <p>Questa operazione non riapre automaticamente fatture, incassi o documenti economici già registrati.</p>
    <div className="sale360-cancel-confirm-actions"><button disabled={busy} className="danger" onClick={()=>void submit()}>{busy?'Annullamento…':'Conferma annullamento definitivo'}</button><button disabled={busy} onClick={()=>setConfirming(false)}>Indietro</button></div>
   </div>}
   {error&&<div className="sale360-gate-error" role="alert">{error}</div>}
  </>}
 </section>
}
