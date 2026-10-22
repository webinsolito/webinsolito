import {useEffect,useState} from 'react'
import {fetchSaleChecklistHistory} from './saleChecklistHistoryApi'
import {visibleSaleChecklistHistory,type SaleChecklistHistoryEvent} from '../domain/saleChecklistHistory'
import type {Contract,TenantData} from '../types'

interface HistorySnapshot{
 scope:string;items:TenantData['workItems']|null;revision:number;
 events:SaleChecklistHistoryEvent[];loading:boolean;error:string
}

/** One shared read for the checklist's inline attribution and full audit panel. */
export function useSaleChecklistHistory(contract:Pick<Contract,'dealer_id'|'vehicle_id'>,items:TenantData['workItems']){
 const [revision,setRevision]=useState(0)
 const [snapshot,setSnapshot]=useState<HistorySnapshot>({scope:'',items:null,revision:-1,events:[],loading:true,error:''})
 const scope=contract.dealer_id+'|'+contract.vehicle_id
 useEffect(()=>{
  let alive=true
  const key=contract.dealer_id+'|'+contract.vehicle_id
  setSnapshot({scope:key,items,revision,events:[],loading:true,error:''})
  void fetchSaleChecklistHistory(contract).then(rows=>{
   if(!alive)return
   setSnapshot({scope:key,items,revision,events:visibleSaleChecklistHistory(rows,contract),loading:false,error:''})
  }).catch(()=>{
   if(!alive)return
   setSnapshot({scope:key,items,revision,events:[],loading:false,error:'Impossibile caricare lo storico. Riprova.'})
  })
  return()=>{alive=false}
 },[contract.dealer_id,contract.vehicle_id,items,revision])
 // Ignore stale responses even in the render before useEffect runs after a vehicle or data change.
 const current=snapshot.scope===scope&&snapshot.items===items&&snapshot.revision===revision
 return {
  events:current?snapshot.events:[],
  loading:!current||snapshot.loading,
  error:current?snapshot.error:'',
  refresh:()=>setRevision(n=>n+1)
 }
}
