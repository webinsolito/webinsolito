import {config} from './config'
import {setSession} from './api'
import type {SessionPayload} from '../types'

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const code=String(data?.error||data?.message||`http_${res.status}`)
    const friendly:Record<string,string>={
      password_policy:'La password deve avere almeno 12 caratteri, maiuscola, minuscola, numero e simbolo.',
      unauthorized:'Sessione scaduta. Accedi di nuovo.',
      dealer_access_expired:'L’accesso della concessionaria è scaduto.'
    }
    throw new Error(friendly[code]||code)
  }
  return data as T
}

export async function loginWithAccess(identifier:string,password:string,dealerSlug:string){
  const data=await parse<SessionPayload>(await fetch(`${config.workerUrl}/auth/resolve-login`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({identifier:identifier.trim(),dealer_slug:dealerSlug,password})
  }))
  setSession(data)
  return data
}

export async function changeOwnPassword(session:SessionPayload,password:string){
  await parse<{ok:true}>(await fetch(`${config.workerUrl}/account/change-password`,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`,'x-dealer-id':session.dealer.id},
    body:JSON.stringify({password})
  }))
  const next:SessionPayload={...session,profile:{...session.profile,force_password_change:false,password_changed_at:new Date().toISOString()}}
  setSession(next)
  return next
}
