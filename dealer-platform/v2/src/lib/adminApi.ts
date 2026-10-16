import {config} from './config'
import type {AdminMember,AdminOverview,MemberDraft,MemberUpdate,SessionPayload} from '../types'

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const code=String(data?.error||data?.message||`http_${res.status}`)
    const friendly:Record<string,string>={
      admin_required:'Solo un amministratore può gestire i dipendenti.',
      dealer_access_locked:'Accesso concessionaria bloccato. Prima completa il rinnovo.',
      username_exists:'Questo username è già usato nella concessionaria.',
      member_create_failed:'Non è stato possibile creare il dipendente. Controlla che l’email non sia già collegata a un altro account.',
      invalid_member_data:'Controlla nome, email, username e ruolo.',
      member_not_found:'Dipendente non trovato.',
      cannot_demote_or_suspend_self:'Non puoi toglierti da solo il ruolo amministratore o sospendere il tuo account.',
      last_admin_required:'Deve rimanere almeno un amministratore attivo.',
      unauthorized:'Sessione scaduta. Accedi di nuovo.'
    }
    throw new Error(friendly[code]||code)
  }
  return data as T
}

const headers=(session:SessionPayload)=>({authorization:`Bearer ${session.access_token}`,'x-dealer-id':session.dealer.id,'content-type':'application/json'})

export async function getAdminOverview(session:SessionPayload){
  return parse<AdminOverview>(await fetch(`${config.workerUrl}/admin/overview`,{headers:headers(session),cache:'no-store'}))
}

export async function createDealerMember(session:SessionPayload,draft:MemberDraft){
  return parse<{ok:true;user_id:string;temp_password:string}>(await fetch(`${config.workerUrl}/admin/member/create`,{
    method:'POST',headers:headers(session),body:JSON.stringify(draft)
  }))
}

export async function updateDealerMember(session:SessionPayload,member:AdminMember,update:MemberUpdate){
  return parse<{ok:true}>(await fetch(`${config.workerUrl}/admin/member/update`,{
    method:'POST',headers:headers(session),body:JSON.stringify({user_id:member.user_id,display_name:update.display_name,role:update.role,status:update.status})
  }))
}

export async function resetDealerMemberPassword(session:SessionPayload,userId:string){
  return parse<{ok:true;temp_password:string}>(await fetch(`${config.workerUrl}/admin/member/reset-password`,{
    method:'POST',headers:headers(session),body:JSON.stringify({user_id:userId})
  }))
}
