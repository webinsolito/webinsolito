import {config} from './config'
import type {AccessStatus,SessionPayload} from '../types'

export type RenewalReceipt={request_id:string;claim_token:string;status:'PENDING'|'APPROVED'|'REJECTED';access_expires_at?:string|null}
export type RenewalStatus={ok:true;status:'PENDING'|'APPROVED'|'REJECTED';dealer_name:string;dealer_slug?:string|null;access_expires_at?:string|null;approved_at?:string|null;rejected_at?:string|null}

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const code=String(data?.error||data?.message||`http_${res.status}`)
    const friendly:Record<string,string>={
      renewal_too_early:'Il rinnovo si può richiedere negli ultimi 7 giorni.',
      admin_required:'Solo il titolare o un amministratore può richiedere il rinnovo.',
      unauthorized:'Sessione scaduta. Accedi di nuovo.',
      dealer_not_available:'Concessionaria non disponibile.'
    }
    throw new Error(friendly[code]||code)
  }
  return data as T
}

const authHeaders=(session:SessionPayload)=>({authorization:`Bearer ${session.access_token}`,'x-dealer-id':session.dealer.id,'content-type':'application/json'})

export async function getAccessStatus(session:SessionPayload){
  return parse<AccessStatus>(await fetch(config.accessStatusUrl,{headers:authHeaders(session),cache:'no-store'}))
}

export async function requestDealerRenewal(session:SessionPayload){
  return parse<RenewalReceipt>(await fetch(`${config.renewalUrl}/request`,{method:'POST',headers:authHeaders(session),body:'{}'}))
}

export async function getDealerRenewalStatus(receipt:RenewalReceipt){
  return parse<RenewalStatus>(await fetch(`${config.renewalUrl}/status`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:receipt.request_id,claim_token:receipt.claim_token}),cache:'no-store'}))
}
