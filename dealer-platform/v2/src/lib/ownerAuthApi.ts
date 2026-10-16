import {config} from './config'
import type {SessionPayload} from '../types'

export async function loginOwner(email:string,password:string){
  const res=await fetch(config.ownerAuthUrl,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password})})
  const text=await res.text();let data:any=null
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(res.status===401?'Email o password proprietario non validi.':String(data?.error||'Accesso proprietario non riuscito'))
  return data as SessionPayload
}
