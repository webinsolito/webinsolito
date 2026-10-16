import {config} from './config'
import type {OnboardingCompanyDraft,OnboardingStatus,SessionPayload,VehicleImportResult} from '../types'
import type {VehicleImportRow} from './vehicleImport'

async function parse<T>(res:Response):Promise<T>{
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok){
    const code=String(data?.error||data?.message||`http_${res.status}`)
    const friendly:Record<string,string>={
      unauthorized:'Sessione scaduta. Accedi di nuovo.',
      admin_required:'Solo l’amministratore può completare la configurazione iniziale.',
      dealer_access_locked:'Accesso concessionaria bloccato. Prima completa il rinnovo.',
      dealer_name_required:'Inserisci nome concessionaria e ragione sociale.',
      invalid_contact_email:'L’email della concessionaria non è valida.',
      import_empty:'Il file non contiene auto da importare.',
      import_too_many_rows:'Importa al massimo 250 auto per volta.',
      company_incomplete:'Completa prima i dati della concessionaria.',
      branch_required:'Inserisci almeno la sede principale.',
      payload_too_large:'Il file contiene troppi dati per una singola importazione.'
    }
    throw new Error(friendly[code]||code)
  }
  return data as T
}
const headers=(session:SessionPayload)=>({authorization:`Bearer ${session.access_token}`,'x-dealer-id':session.dealer.id,'content-type':'application/json'})
export async function getOnboardingStatus(session:SessionPayload){return parse<OnboardingStatus>(await fetch(`${config.onboardingUrl}/status`,{headers:headers(session),cache:'no-store'}))}
export async function saveOnboardingCompany(session:SessionPayload,draft:OnboardingCompanyDraft){return parse<{ok:true}>(await fetch(`${config.onboardingUrl}/company`,{method:'POST',headers:headers(session),body:JSON.stringify(draft)}))}
export async function importOnboardingVehicles(session:SessionPayload,rows:VehicleImportRow[]){return parse<VehicleImportResult>(await fetch(`${config.onboardingUrl}/import`,{method:'POST',headers:headers(session),body:JSON.stringify({rows})}))}
export async function completeOnboarding(session:SessionPayload){return parse<{ok:true;completed_at:string}>(await fetch(`${config.onboardingUrl}/complete`,{method:'POST',headers:headers(session),body:'{}'}))}
