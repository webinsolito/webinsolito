import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchSaleOperationsSnapshot} from './api'
import {saleOperationsChanged} from '../domain/saleOperationsSync'
import {operationalVehicleStateChanges,RECENT_REMOTE_CHANGE_MS,unexpiredRemoteChanges} from '../domain/recentRemoteVehicleChanges'
import type {SessionPayload,TenantData} from '../types'
export type SalesSyncStatus='checking'|'synced'|'updated'|'offline'
const STALE='La vendita o la disponibilità dell’auto è stata modificata su un altro dispositivo. Controlla i dati aggiornati.'
/** Poll one non-financial snapshot while Sales is visible; never merge stale remote data into local writes. */
export function useSalesOperationsSync(data:TenantData,session:SessionPayload,busy:boolean,onRefresh:()=>Promise<void>){
 const latest=useRef({data,session,busy,onRefresh});latest.current={data,session,busy,onRefresh}
 const scope=session.dealer.id+'|'+(session.user?.id||'')
 const [state,setState]=useState<{scope:string;status:SalesSyncStatus}>({scope,status:'checking'})
 const pending=useRef(false)
 const [recent,setRecent]=useState<{scope:string;expires:Record<string,number>}>({scope,expires:{}})
 const hasSyncedOnce=useRef(false)
 const expiryTimers=useRef<Set<number>>(new Set())
 const check=useCallback(async({strict=false,manual=false}:{strict?:boolean;manual?:boolean}={})=>{
  const {session:s,busy:b}=latest.current
  if(pending.current){if(strict)throw new Error('Sincronizzazione in corso, riprova.');return}
  if(!strict&&!manual&&(b||document.visibilityState!=='visible'))return
  pending.current=true
  if(!strict)setState(prev=>prev.scope===scope&&prev.status==='updated'?prev:{scope,status:'checking'})
  try{
   const remote=await fetchSaleOperationsSnapshot(s)
   const current=latest.current
   if(current.session.dealer.id!==s.dealer.id||current.session.user?.id!==s.user?.id)return
   if(!strict&&current.busy)return
   const local={vehicles:current.data.vehicles,contracts:current.data.contracts}
   const changed=saleOperationsChanged(local,remote,s.dealer.id)
   const recentIds=hasSyncedOnce.current&&changed?operationalVehicleStateChanges(local,remote,s.dealer.id):[]
   if(changed){
    await current.onRefresh()
    // Do not mark the initial load or a change that failed to refresh.
    if(recentIds.length){
     const expiresAt=Date.now()+RECENT_REMOTE_CHANGE_MS
     setRecent(previous=>{
      const alive=previous.scope===scope?unexpiredRemoteChanges(previous.expires,Date.now()):{}
      for(const id of recentIds)alive[id]=expiresAt
      return {scope,expires:alive}
     })
     const timer=window.setTimeout(()=>{
      expiryTimers.current.delete(timer)
      setRecent(previous=>previous.scope===scope?{scope,expires:unexpiredRemoteChanges(previous.expires,Date.now())}:previous)
     },RECENT_REMOTE_CHANGE_MS+50)
     expiryTimers.current.add(timer)
    }
    setState({scope,status:'updated'})
    hasSyncedOnce.current=true
    if(strict)throw new Error(STALE)
   }else{
    hasSyncedOnce.current=true
    setState({scope,status:'synced'})
   }
  }catch(err){
   if(err instanceof Error&&err.message===STALE)throw err
   setState({scope,status:'offline'})
   if(strict)throw new Error('Impossibile verificare vendite e disponibilità sul server. Riprova con la connessione attiva.')
  }finally{pending.current=false}
 },[scope])
 useEffect(()=>{
  let active=true
  setState({scope,status:'checking'})
  hasSyncedOnce.current=false
  setRecent({scope,expires:{}})
  const run=()=>{if(active)void check()}
  run()
  const timer=window.setInterval(run,15000)
  const back=()=>{if(document.visibilityState==='visible')run()}
  document.addEventListener('visibilitychange',back);window.addEventListener('focus',run);window.addEventListener('online',run)
  return()=>{active=false;window.clearInterval(timer);for(const id of expiryTimers.current)window.clearTimeout(id);expiryTimers.current.clear();document.removeEventListener('visibilitychange',back);window.removeEventListener('focus',run);window.removeEventListener('online',run)}
 },[scope,check])
 return {status:state.scope===scope?state.status:'checking',
  recentlyChangedVehicleIds:new Set(recent.scope===scope?Object.keys(unexpiredRemoteChanges(recent.expires,Date.now())):[]),
  refresh:()=>check({manual:true}),verifyFresh:()=>check({strict:true})}
}
