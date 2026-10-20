import type {Contract,SessionPayload} from '../types'

export const SALE_CANCEL_REASONS=[
 {code:'CLIENTE_RINUNCIA',label:'Cliente ha rinunciato'},
 {code:'CAMBIO_AUTO',label:'Cliente ha scelto un’altra auto'},
 {code:'FINANZIAMENTO',label:'Finanziamento non concluso'},
 {code:'ERRORE_PRATICA',label:'Pratica aperta per errore'},
 {code:'ALTRO',label:'Altro motivo'}
] as const

export type SaleCancelReasonCode=typeof SALE_CANCEL_REASONS[number]['code']

export function saleCancellationNeedsAdmin(contract:Contract){
 const stage=String(contract.sale_stage||'OPEN').toUpperCase()
 const status=String(contract.status||'DRAFT').toUpperCase()
 return !['OPEN','AGREED'].includes(stage)
  || ['FROZEN','SIGNED'].includes(status)
  || Number(contract.deposit||0)>0
  || Number(contract.financing_amount||0)>0
  || Boolean(contract.sale_invoice_id)
}

export function saleCancellationAuthority(session:SessionPayload,contract:Contract){
 const role=String(session.profile.role||'').toUpperCase()
 const writable=['ADMIN','AMMINISTRAZIONE','VENDITORE'].includes(role)||session.profile.permissions?.contracts_write===true
 if(!writable)return {allowed:false,requiresAdmin:false,reason:'Non hai il permesso di modificare le vendite.'}
 if(role==='ADMIN'||role==='AMMINISTRAZIONE')return {allowed:true,requiresAdmin:false,reason:''}
 if(role==='VENDITORE'&&!saleCancellationNeedsAdmin(contract))return {allowed:true,requiresAdmin:false,reason:''}
 return {allowed:false,requiresAdmin:true,reason:'Questa vendita ha già elementi contrattuali o economici: serve Admin/Amministrazione.'}
}

export function formatSaleCancelReason(code:SaleCancelReasonCode,details=''){
 const label=SALE_CANCEL_REASONS.find(x=>x.code===code)?.label||'Altro motivo'
 const clean=details.trim().replace(/\s+/g,' ')
 return (clean?label+' — '+clean:label).slice(0,240)
}
