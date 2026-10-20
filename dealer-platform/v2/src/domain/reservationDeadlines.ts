import type {Contract,SessionPayload,TenantData} from '../types'
import {reservesVehicle} from './saleReservation'

export type ReservationAlert='NONE'|'LATER'|'SOON'|'OVERDUE'

export function reservationAlert(sale:Contract,nowIso:string):ReservationAlert{
 if(!reservesVehicle(sale)||!sale.reservation_expires_at)return 'NONE'
 const expiry=new Date(sale.reservation_expires_at).getTime()
 const now=new Date(nowIso).getTime()
 if(!Number.isFinite(expiry)||!Number.isFinite(now))return 'NONE'
 if(expiry<=now)return 'OVERDUE'
 if(expiry-now<=3*86400000)return 'SOON'
 return 'LATER'
}

export function activeReservationAlerts(data:Pick<TenantData,'contracts'>,nowIso:string){
 return data.contracts.filter(c=>['SOON','OVERDUE'].includes(reservationAlert(c,nowIso)))
  .sort((a,b)=>String(a.reservation_expires_at).localeCompare(String(b.reservation_expires_at)))
}

export function canExtendReservation(sale:Contract,session:SessionPayload){
 if(!reservesVehicle(sale)||!sale.reservation_expires_at)return false
 const role=String(session.profile.role||'').toUpperCase()
 if(role==='ADMIN'||role==='AMMINISTRAZIONE'||session.support_mode)return true
 return role==='VENDITORE'&&String(sale.sale_stage)==='AGREED'&&sale.status==='DRAFT'
  &&Number(sale.deposit||0)===0&&Number(sale.financing_amount||0)===0&&!sale.sale_invoice_id
}

export function extensionDeadline(sale:Contract,days:number,nowIso:string){
 if(![7,14].includes(days))throw new Error('Proroga non valida')
 const now=new Date(nowIso).getTime()
 const from=Math.max(now,new Date(sale.reservation_expires_at||'').getTime())
 if(!Number.isFinite(from))throw new Error('Scadenza non valida')
 const expiry=new Date(from+days*86400000)
 if(expiry.getTime()>now+30*86400000)throw new Error('La proroga supera il limite di 30 giorni')
 return expiry.toISOString()
}
