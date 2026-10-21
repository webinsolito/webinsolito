import type {Contract,CustomerInteraction} from '../types'
import {reservationAlert,type ReservationAlert} from './reservationDeadlines'

export type ReservationContactOutcome='NO_REPLY'|'NEEDS_TIME'|'CONFIRMED'|'WITHDRAWAL'
export const RESERVATION_CONTACT_OUTCOMES=[
 {code:'NO_REPLY',label:'Non risponde'},
 {code:'NEEDS_TIME',label:'Chiede più tempo'},
 {code:'CONFIRMED',label:'Conferma interesse'},
 {code:'WITHDRAWAL',label:'Rinuncia da verificare'}
] as const
const labels:Record<ReservationContactOutcome,string>={
 NO_REPLY:'Non risponde',NEEDS_TIME:'Chiede più tempo',
 CONFIRMED:'Conferma interesse',WITHDRAWAL:'Rinuncia da verificare'
}
export function isOverdueReservation(sale:Contract,nowIso:string){
 return reservationAlert(sale,nowIso)==='OVERDUE'
}
export function isUpcomingReservation(sale:Contract,nowIso:string){
 return reservationAlert(sale,nowIso)==='SOON'
}
export function validPreventiveCallback(iso:string,expiry:string|null|undefined,nowIso:string){
 const expiryMs=expiry?Date.parse(expiry):NaN
 return validReservationCallback(iso,nowIso)&&Number.isFinite(expiryMs)&&Date.parse(iso)<=expiryMs
}
export const reservationFollowupPrefix=(sale:Pick<Contract,'contract_number'>)=>'Prenotazione '+sale.contract_number+' · '
export function reservationContactTitle(sale:Contract,outcome:ReservationContactOutcome,note:string){
 const cleaned=note.trim().replace(/\s+/g,' ')
 if(!labels[outcome])throw new Error('Seleziona l’esito del ricontatto')
 if(cleaned.length<4||cleaned.length>180)throw new Error('Inserisci una nota da 4 a 180 caratteri')
 return reservationFollowupPrefix(sale)+labels[outcome]+' · '+cleaned
}
export function followupForReservation(sale:Contract,interactions:CustomerInteraction[]){
 const prefix=reservationFollowupPrefix(sale)
 return interactions.filter(x=>x.customer_id===sale.customer_id&&x.title?.startsWith(prefix))
  .sort((a,b)=>String(b.happened_at||b.created_at||'').localeCompare(String(a.happened_at||a.created_at||'')))
}
export type ReservationFollowupWindow=Extract<ReservationAlert,'SOON'|'OVERDUE'>
export const reservationCompletionPrefix=(sale:Contract,window:ReservationFollowupWindow)=>
 reservationFollowupPrefix(sale)+'Richiamo completato · '+window+' · '+sale.reservation_expires_at+' · '
export function reservationCompletionTitle(sale:Contract,window:ReservationFollowupWindow,note:string){
 if(reservationAlert(sale,new Date().toISOString())!==window)throw new Error('Lo stato della prenotazione è cambiato: aggiorna la vendita')
 const cleaned=note.trim().replace(/\s+/g,' ')
 if(cleaned.length<4||cleaned.length>180)throw new Error('Inserisci una nota da 4 a 180 caratteri')
 return reservationCompletionPrefix(sale,window)+cleaned
}
export function latestReservationCompletion(sale:Contract,interactions:CustomerInteraction[],window:ReservationFollowupWindow){
 const last=followupForReservation(sale,interactions)[0]
 return last?.title?.startsWith(reservationCompletionPrefix(sale,window))?last:null
}
export function reservationNextStep(sale:Contract){
 return 'Ricontatto prenotazione '+sale.contract_number
}
export function validReservationCallback(iso:string,nowIso:string){
 const when=Date.parse(iso),now=Date.parse(nowIso)
 return Number.isFinite(when)&&Number.isFinite(now)&&when>now
  &&when<=now+30*86400000
}
export function reservationContactPhone(phone?:string|null){
 return (phone||'').replace(/[^\d+]/g,'')
}
