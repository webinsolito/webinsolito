import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchSaleOperationsSnapshot} from './api'
import {saleOperationsChanged} from '../domain/saleOperationsSync'
import type {SessionPayload,TenantData} from '../types'
export type SalesSyncStatus='checking'|'synced'|'updated'|'offline'
const STALE='La vendita o la disponibilità dell’auto è stata modificata su un altro dispositivo. Controlla i dati aggiornati.'
/** Poll one non-financial snapshot while Sales is visible; never merge stale remote data into local writes. */
export function useSalesOperationsSync(data:TenantData,session:SessionPayload,busy:boolean,onRefresh:()=>Promise<void>){
 const latest=useRef({data,session,busy,onRefresh});latest.current={data,session,busy,onRefresh}
 const scope=session.dealer.id+'|'+(session.user?.id||'')
 const [state,setState]=useState<{scope:string;status:SalesSyncStatus}>({scope,status:'checking'})
 const pending=useRef(false)
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
   if(saleOperationsChanged({vehicles:current.data.vehicles,contracts:current.data.contracts},remote,s.dealer.id)){
    await current.onRefresh()
    setState({scope,status:'updated'})
    if(strict)throw new Error(STALE)
   }else setState({scope,status:'synced'})
  }catch(err){
   if(err instanceof Error&&err.message===STALE)throw err
   setState({scope,status:'offline'})
   if(strict)throw new Error('Impossibile verificare vendite e disponibilità sul server. Riprova con la connessione attiva.')
  }finally{pending.current=false}
 },[scope])
 useEffect(()=>{
  let active=true
  setState({scope,status:'checking'})
  const run=()=>{if(active)void check()}
  run()
  const timer=window.setInterval(run,15000)
  const back=()=>{if(document.visibilityState==='visible')run()}
  document.addEventListener('visibilitychange',back);window.addEventListener('focus',run);window.addEventListener('online',run)
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',back);window.removeEventListener('focus',run);window.removeEventListener('online',run)}
 },[scope,check])
 return {status:state.scope===scope?state.status:'checking',refresh:()=>check({manual:true}),verifyFresh:()=>check({strict:true})}
}
