import {useState} from 'react'
import {AlertTriangle,CalendarClock,CheckCircle2,ClipboardList,LockKeyhole,Mail,Phone,PhoneCall} from 'lucide-react'
import {
 RESERVATION_CONTACT_OUTCOMES,followupForReservation,isOverdueReservation,isUpcomingReservation,validPreventiveCallback,
 reservationContactPhone,reservationContactTitle,reservationFollowupPrefix,
 reservationNextStep,validReservationCallback,latestReservationCompletion,reservationCompletionPrefix,type ReservationFollowupWindow,type ReservationContactOutcome
} from '../domain/reservationFollowup'
import type {Contract,Customer,CustomerInteraction} from '../types'

const dateTime=(iso?:string|null)=>{
 if(!iso)return '—'
 const d=new Date(iso)
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
}

export function ReservationFollowupPanel({contract,customer,interactions,writable,onLog,onPlan,onComplete}:{
 contract:Contract;customer?:Customer;interactions:CustomerInteraction[];writable:boolean;
 onLog:(channel:string,title:string)=>Promise<void>;
 onPlan:(nextStep:string,iso:string)=>Promise<void>;
 onComplete:(window:ReservationFollowupWindow,note:string)=>Promise<void>
}){
 const [channel,setChannel]=useState('TELEFONO')
 const [outcome,setOutcome]=useState<ReservationContactOutcome>('NO_REPLY')
 const [note,setNote]=useState('')
 const [callbackAt,setCallbackAt]=useState('')
 const [confirmOverwrite,setConfirmOverwrite]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [completionNote,setCompletionNote]=useState('')
 const upcoming=isUpcomingReservation(contract,new Date().toISOString())
 if(!upcoming&&!isOverdueReservation(contract,new Date().toISOString()))return null
 const history=followupForReservation(contract,interactions)
 const window:ReservationFollowupWindow=upcoming?'SOON':'OVERDUE'
 const lastCompletion=latestReservationCompletion(contract,interactions,window)
 const nextStep=reservationNextStep(contract)
 const completedAt=lastCompletion?Date.parse(lastCompletion.happened_at||lastCompletion.created_at||''):NaN
 const customerUpdatedAt=customer?.updated_at?Date.parse(customer.updated_at):NaN
 const hasNewCallback=customer?.next_step===nextStep&&Boolean(customer.next_contact_at)&&Number.isFinite(completedAt)&&Number.isFinite(customerUpdatedAt)&&customerUpdatedAt>=completedAt
 const completed=hasNewCallback?null:lastCompletion
 const conflictingAction=Boolean(customer?.next_step&&customer.next_step!==nextStep)
 const canSchedule=Boolean(callbackAt&&validReservationCallback(callbackAt,new Date().toISOString())&&(!upcoming||validPreventiveCallback(callbackAt,contract.reservation_expires_at,new Date().toISOString()))&&(!conflictingAction||confirmOverwrite))
 const phone=reservationContactPhone(customer?.phone)
 const hasLinkedAction=customer?.next_step===nextStep
 const save=async()=>{
  setError('');setSuccess('')
  if(!customer){setError('Cliente non disponibile: nessuna registrazione eseguita.');return}
  try{
   const title=reservationContactTitle(contract,outcome,note)
   setBusy(true)
   await onLog(channel,title)
   setNote('');setSuccess('Contatto registrato nel CRM. L’auto resta prenotata.')
  }catch(e){setError(e instanceof Error?e.message:'Contatto non registrato')}
  finally{setBusy(false)}
 }
 const schedule=async()=>{
  setError('');setSuccess('')
  if(!customer||!canSchedule){setError(upcoming?'Scegli un richiamo prima della scadenza della prenotazione.':'Scegli una data futura valida (entro 30 giorni).');return}
  try{
   setBusy(true)
   await onPlan(nextStep,new Date(callbackAt).toISOString())
   setSuccess('Richiamo salvato nella scheda cliente. L’auto resta prenotata.')
   setConfirmOverwrite(false)
  }catch(e){setError(e instanceof Error?e.message:'Richiamo non salvato')}
  finally{setBusy(false)}
 }
 const finish=async()=>{
  setError('');setSuccess('')
  if(!customer){setError('Cliente non disponibile.');return}
  if(!completed&&completionNote.trim().length<4){setError('Descrivi brevemente il risultato del richiamo.');return}
  try{
   setBusy(true)
   await onComplete(window,completed?'Richiamo già registrato':completionNote)
   setCompletionNote('')
   setSuccess('Richiamo completato e registrato nel CRM. La prenotazione resta invariata.')
  }catch(e){setError(e instanceof Error?e.message:'Richiamo non completato')}
  finally{setBusy(false)}
 }
 return <section className={'sale360-section reservation-followup-panel'+(upcoming?' preventive':'')} data-testid="reservation-followup-panel" data-booking-state={upcoming?'SOON':'OVERDUE'}>
  <div className="sale360-head"><h3><PhoneCall/> {upcoming?'Previeni la scadenza della prenotazione':'Gestisci prenotazione scaduta'}</h3></div>
  <div className="reservation-followup-warning" data-testid="reservation-followup-lock">
   <LockKeyhole size={18}/><p><strong>Auto ancora prenotata.</strong> {upcoming?'Scadrà il '+dateTime(contract.reservation_expires_at)+'. Contatta il cliente e programma il richiamo prima di questa data.':'La scadenza è un promemoria: un ricontatto o un richiamo non libera il veicolo.'} Solo l’annullamento protetto della vendita può liberarlo.</p>
  </div>
  {customer?<div className="reservation-followup-person">
   <div><strong>{[customer.first_name,customer.last_name].filter(Boolean).join(' ')||'Cliente collegato'}</strong><small>Ricontatta il cliente, poi registra l’esito.</small></div>
   <div className="reservation-followup-contact-links">
    {phone&&<a href={'tel:'+phone} data-testid="reservation-followup-call"><Phone size={14}/> Chiama</a>}
    {customer.email&&<a href={'mailto:'+customer.email} data-testid="reservation-followup-email"><Mail size={14}/> Email</a>}
   </div>
  </div>:<p role="alert" className="form-error">Anagrafica cliente non disponibile. Nessuna operazione sul contratto.</p>}
  {!writable?<p className="reservation-followup-noedit"><LockKeyhole size={14}/> Per registrare contatti e richiami serve il permesso di scrittura CRM.</p>:customer&&<>
   <div className="reservation-followup-subhead"><ClipboardList size={17}/><strong>1. Registra l’esito</strong></div>
   <div className="reservation-followup-form">
    <label>Canale
     <select value={channel} disabled={busy} aria-label="Canale ricontatto" onChange={e=>setChannel(e.target.value)}>
      <option value="TELEFONO">Telefono</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option><option value="NOTE">Nota interna</option>
     </select>
    </label>
    <label>Esito
     <select value={outcome} disabled={busy} aria-label="Esito ricontatto" onChange={e=>setOutcome(e.target.value as ReservationContactOutcome)}>
      {RESERVATION_CONTACT_OUTCOMES.map(x=><option key={x.code} value={x.code}>{x.label}</option>)}
     </select>
    </label>
    <label className="reservation-followup-wide">Nota sul contatto (obbligatoria)
     <textarea aria-label="Nota ricontatto" rows={2} value={note} disabled={busy} maxLength={180}
      placeholder="Es. chiamato oggi, riprovare domani" onChange={e=>setNote(e.target.value)}/>
    </label>
    <button type="button" className="reservation-followup-primary" data-testid="reservation-followup-save"
     disabled={busy||note.trim().length<4} onClick={()=>void save()}><CheckCircle2 size={16}/> {busy?'Salvataggio…':'Registra ricontatto'}</button>
   </div>
   <div className="reservation-followup-subhead"><CalendarClock size={17}/><strong>2. Programma un richiamo (facoltativo)</strong></div>
   <p className="reservation-followup-explain">{upcoming?'Imposta un richiamo prima del termine della prenotazione. Non cambia la scadenza né libera l’auto.':'Imposta la prossima azione nel CRM. Non modifica la data di prenotazione.'}</p>
   {customer.next_step&&<p className="reservation-followup-current">Azione già presente: <strong>{customer.next_step}</strong> {customer.next_contact_at?'· '+dateTime(customer.next_contact_at):''}</p>}
   <div className="reservation-followup-form">
    <label className="reservation-followup-wide">Data e ora richiamo
     <input type="datetime-local" aria-label="Data richiamo prenotazione" value={callbackAt} disabled={busy} onChange={e=>{setCallbackAt(e.target.value);setConfirmOverwrite(false)}}/>
    </label>
    {upcoming&&callbackAt&&!validPreventiveCallback(callbackAt,contract.reservation_expires_at,new Date().toISOString())&&<p className="reservation-followup-deadline-warning" data-testid="reservation-preventive-deadline-warning">Il richiamo deve essere futuro e svolgersi entro il {dateTime(contract.reservation_expires_at)}. Per spostare la prenotazione usa la proroga autorizzata.</p>}
    {conflictingAction&&<label className="reservation-followup-overwrite"><input type="checkbox" checked={confirmOverwrite} disabled={busy} onChange={e=>setConfirmOverwrite(e.target.checked)}/> Sostituisci la prossima azione CRM esistente (non verrà eliminato lo storico dei contatti).</label>}
    <button type="button" className="reservation-followup-secondary" data-testid="reservation-followup-plan"
     disabled={busy||!canSchedule} onClick={()=>void schedule()}><CalendarClock size={16}/> {busy?'Salvataggio…':'Salva richiamo'}</button>
   </div>
   <div className="reservation-followup-completion" data-testid="reservation-followup-completion">
    <div className="reservation-followup-subhead"><CheckCircle2 size={17}/><strong>3. Chiudi il richiamo svolto</strong></div>
    {completed&&<p className="reservation-followup-completed" data-testid="reservation-followup-completed"><CheckCircle2 size={17}/> Completato il {dateTime(completed.happened_at||completed.created_at)}. Resta nello storico CRM; la prenotazione non è annullata.</p>}
    {!completed&&<label className="reservation-followup-completion-label">Esito dell'attività (obbligatorio)
     <textarea aria-label="Nota chiusura richiamo" rows={2} maxLength={180} value={completionNote} disabled={busy}
      placeholder="Es. contattato il cliente, conferma ricevuta" onChange={e=>setCompletionNote(e.target.value)}/>
    </label>}
    {(!completed||hasLinkedAction)&&<button type="button" className="reservation-followup-finish" data-testid="reservation-followup-finish"
     disabled={busy||(!completed&&completionNote.trim().length<4)} onClick={()=>void finish()}>
     <CheckCircle2 size={16}/> {busy?'Salvataggio…':completed?'Completa chiusura promemoria CRM':'Segna richiamo completato'}
    </button>}
   </div>
  </>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  {success&&<div className="reservation-followup-success" role="status">{success}</div>}
  <div className="reservation-followup-history" data-testid="reservation-followup-history">
   <strong>Ultimi ricontatti della prenotazione</strong>
   {history.length?history.slice(0,4).map(x=><div key={x.id} className="reservation-followup-event">
    <small>{dateTime(x.happened_at||x.created_at)} · {x.channel||'NOTA'}</small>
    <span>{x.title?.startsWith(reservationCompletionPrefix(contract,'SOON'))?'Richiamo completato · '+x.title.slice(reservationCompletionPrefix(contract,'SOON').length):x.title?.startsWith(reservationCompletionPrefix(contract,'OVERDUE'))?'Richiamo completato · '+x.title.slice(reservationCompletionPrefix(contract,'OVERDUE').length):x.title?.slice(reservationFollowupPrefix(contract).length)}</span>
   </div>):<p>Nessun ricontatto registrato per questa vendita.</p>}
  </div>
  <p className="reservation-followup-footer"><AlertTriangle size={14}/> Se il cliente rinuncia, utilizza separatamente <strong>“Annulla vendita”</strong> con le autorizzazioni previste. Un esito “Rinuncia da verificare” non annulla nulla.</p>
 </section>
}
