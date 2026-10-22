import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchDeliveryChecklistSnapshot} from './api'
import {deliveryChecklistChanged} from '../domain/saleChecklistSync'
import type {Contract,SessionPayload,TenantData} from '../types'

export type ChecklistSyncState='checking'|'synced'|'updated'|'offline'
const INTERVAL_MS=15000
const STALE_MESSAGE='La checklist è cambiata su un altro dispositivo. Verifica lo stato aggiornato prima di procedere.'

/** Poll a single scoped read while the sale drawer is visible. Never overwrite a local write. */
export function useSaleChecklistSync({contract,data,session,busy,onRefresh}:{
 contract:Contract;data:TenantData;session:SessionPayload;busy:boolean;onRefresh:()=>Promise<void>
}){
 const latest=useRef({contract,data,session,busy,onRefresh})
 latest.current={contract,data,session,busy,onRefresh}
 const [status,setStatus]=useState<ChecklistSyncState>('checking')
 const [lastChecked,setLastChecked]=useState<string|null>(null)
 const polling=useRef(false)
 const scope=contract.dealer_id+'|'+contract.vehicle_id+'|'+session.user?.id
 const [scopeKey,setScopeKey]=useState(scope)
 // Guard against stale states after switching between sales without remounting.
 const visibleStatus=scopeKey===scope?status:'checking'
 const check=useCallback(async({force=false,strict=false}:{force?:boolean;strict?:boolean}={}):Promise<void>=>{
  const {contract:c,data:d,session:s,busy:b,onRefresh:refresh}=latest.current
  if(!force&&(polling.current||b||document.visibilityState!=='visible'))return
  if(strict&&b)throw new Error('Completa prima l’operazione in corso.')
  if(!force)polling.current=true
  if(!strict&&visibleStatus!=='updated')setStatus('checking')
  try{
   const remote=await fetchDeliveryChecklistSnapshot(c.vehicle_id,s)
   // Session/sale may have changed while the browser was fetching.
   if(latest.current.contract.dealer_id!==c.dealer_id||latest.current.contract.vehicle_id!==c.vehicle_id||
     latest.current.session.user?.id!==s.user?.id)return
   if(!strict&&latest.current.busy)return
   const changed=deliveryChecklistChanged(latest.current.data.workItems,remote,c.dealer_id,c.vehicle_id)
   if(changed){
    await latest.current.onRefresh()
    setStatus('updated')
    setLastChecked(new Date().toISOString())
    if(strict)throw new Error(STALE_MESSAGE)
   }else{
    setStatus('synced')
    setLastChecked(new Date().toISOString())
   }
  }catch(err){
   if(err instanceof Error&&err.message===STALE_MESSAGE)throw err
   setStatus('offline')
   if(strict)throw new Error('Impossibile verificare la checklist sul server. Riprova quando la connessione è disponibile.')
  }finally{if(!force)polling.current=false}
 },[visibleStatus])
 useEffect(()=>{
  setScopeKey(scope);setStatus('checking');setLastChecked(null)
  let active=true
  const sync=()=>{if(active)void check()}
  sync()
  const timer=window.setInterval(sync,INTERVAL_MS)
  const visibility=()=>{if(document.visibilityState==='visible')sync()}
  document.addEventListener('visibilitychange',visibility)
  window.addEventListener('focus',sync)
  window.addEventListener('online',sync)
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',sync);window.removeEventListener('online',sync)}
 },[scope,check])
 return {status:visibleStatus,lastChecked:scopeKey===scope?lastChecked:null,refresh:()=>check({force:true}),verifyFresh:()=>check({force:true,strict:true})}
}
