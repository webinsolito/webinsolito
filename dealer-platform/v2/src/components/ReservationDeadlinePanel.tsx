import {useState} from 'react'
import {AlertTriangle,CalendarClock,CheckCircle2,LockKeyhole} from 'lucide-react'
import {canExtendReservation,extensionDeadline,reservationAlert} from '../domain/reservationDeadlines'
import {reservesVehicle} from '../domain/saleReservation'
import type {Contract,SessionPayload} from '../types'

const fmt=(value:string)=>new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
export function ReservationDeadlinePanel({contract,session,busy,onExtend}:{
 contract:Contract;session:SessionPayload;busy:boolean;onExtend:(iso:string,reason:string)=>Promise<void>
}){
 const [open,setOpen]=useState(false)
 const [days,setDays]=useState<7|14>(7)
 const [reason,setReason]=useState('')
 const [confirm,setConfirm]=useState(false)
 const [error,setError]=useState('')
 if(!reservesVehicle(contract))return null
 const now=new Date().toISOString()
 const state=reservationAlert(contract,now)
 const allowed=canExtendReservation(contract,session)
 let target=''
 try{target=extensionDeadline(contract,days,now)}catch{}
 const save=async()=>{
  setError('')
  try{
   if(reason.trim().length<4)throw new Error('Indica il motivo della proroga (almeno 4 caratteri).')
   if(!target)throw new Error('Data non valida: scegli una proroga più breve.')
   await onExtend(target,reason.trim())
   setOpen(false);setConfirm(false);setReason('')
  }catch(e){setError(e instanceof Error?e.message:'Impossibile prorogare la prenotazione');setConfirm(false)}
 }
 return <section className="sale360-section" data-testid="reservation-deadline-panel">
  <div className="sale360-head"><h3><CalendarClock/> Scadenza prenotazione</h3></div>
  <div className={'reservation-deadline-status '+state.toLowerCase()} data-testid="reservation-deadline-state">
   <b>{state==='OVERDUE'?'Prenotazione scaduta · da verificare':state==='SOON'?'Prenotazione in scadenza':state==='NONE'?'Scadenza non impostata':'Prenotazione attiva'}</b>
   <span>{contract.reservation_expires_at?fmt(contract.reservation_expires_at):'Da definire'}</span>
  </div>
  <p className="reservation-deadline-hint"><AlertTriangle size={15}/> La scadenza è un promemoria: l'auto rimane prenotata finché la vendita non viene annullata con la procedura protetta.</p>
  {contract.reservation_extension_count? <small data-testid="reservation-extension-count">Proroghe registrate: {contract.reservation_extension_count}</small>:null}
  {!allowed?<div className="reservation-deadline-locked"><LockKeyhole size={16}/> Proroga disponibile solo per Admin/Amministrazione nelle vendite con impegni.</div>:
   !open?<button type="button" data-testid="reservation-extend-open" className="soft-action" disabled={busy||!contract.reservation_expires_at} onClick={()=>setOpen(true)}>Proroga prenotazione</button>:
   <div className="reservation-extension-form" data-testid="reservation-extension-form">
    <label>Durata proroga
     <select aria-label="Durata proroga" value={days} disabled={busy} onChange={e=>{setDays(Number(e.target.value) as 7|14);setConfirm(false)}}>
      <option value={7}>+7 giorni</option><option value={14}>+14 giorni</option>
     </select>
    </label>
    <label>Motivo obbligatorio
     <input aria-label="Motivo proroga" maxLength={240} value={reason} disabled={busy}
      onChange={e=>{setReason(e.target.value);setConfirm(false)}} placeholder="Es. attesa risposta cliente" />
    </label>
    {target&&<p>Nuova scadenza: <b>{fmt(target)}</b></p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <div className="reservation-extension-buttons">
     {!confirm?<button type="button" data-testid="reservation-extend-next" disabled={busy||!target||reason.trim().length<4} onClick={()=>setConfirm(true)}>Continua</button>:
      <button type="button" data-testid="reservation-extend-confirm" disabled={busy} onClick={()=>void save()}><CheckCircle2 size={16}/> {busy?'Salvataggio…':'Conferma proroga'}</button>}
     <button type="button" disabled={busy} onClick={()=>{setOpen(false);setConfirm(false);setError('')}}>Chiudi</button>
    </div>
   </div>}
 </section>
}
