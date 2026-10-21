import type {Contract} from '../types'
import {reservationAlert} from './reservationDeadlines'
import {salesSegment} from './salesView'

export type SalesSortMode='PRIORITY'|'RESERVATION'|'DELIVERY'|'RECENT'
export type SalesPriority='RESERVATION_OVERDUE'|'DELIVERY_OVERDUE'|'RESERVATION_SOON'|'DELIVERY_SOON'|'NORMAL'|'TERMINAL'

const THREE_DAYS=3*86400000
const dateMs=(value?:string|null)=>{
 if(!value)return null
 const t=Date.parse(value)
 return Number.isFinite(t)?t:null
}
const terminal=(sale:Contract)=>salesSegment(sale)!=='ACTIVE'
export const salesPriority=(sale:Contract,nowIso:string):SalesPriority=>{
 if(terminal(sale))return 'TERMINAL'
 const alert=reservationAlert(sale,nowIso)
 if(alert==='OVERDUE')return 'RESERVATION_OVERDUE'
 const delivery=dateMs(sale.planned_delivery_at)
 const now=dateMs(nowIso)
 if(delivery!==null&&now!==null&&delivery<=now)return 'DELIVERY_OVERDUE'
 if(alert==='SOON')return 'RESERVATION_SOON'
 if(delivery!==null&&now!==null&&delivery-now<=THREE_DAYS)return 'DELIVERY_SOON'
 return 'NORMAL'
}
export const salesPriorityLabel=(priority:SalesPriority)=>({
 RESERVATION_OVERDUE:'Prenotazione scaduta',DELIVERY_OVERDUE:'Consegna in ritardo',
 RESERVATION_SOON:'Prenotazione in scadenza',DELIVERY_SOON:'Consegna imminente',
 NORMAL:'',TERMINAL:''
})[priority]
const priorityRank:Record<SalesPriority,number>={
 RESERVATION_OVERDUE:0,DELIVERY_OVERDUE:1,RESERVATION_SOON:2,DELIVERY_SOON:3,NORMAL:4,TERMINAL:5
}
const ascending=(a:number|null,b:number|null)=>(a??Number.POSITIVE_INFINITY)-(b??Number.POSITIVE_INFINITY)
const descending=(a:number|null,b:number|null)=>(b??Number.NEGATIVE_INFINITY)-(a??Number.NEGATIVE_INFINITY)
const smartDeadline=(sale:Contract,priority:SalesPriority)=>{
 if(priority==='RESERVATION_OVERDUE'||priority==='RESERVATION_SOON')return dateMs(sale.reservation_expires_at)
 if(priority==='DELIVERY_OVERDUE'||priority==='DELIVERY_SOON')return dateMs(sale.planned_delivery_at)
 return dateMs(sale.planned_delivery_at)??dateMs(sale.reservation_expires_at)
}

/** Pure, immutable sort: acts only on the already-filtered results for this dealer. */
export function sortSales(sales:Contract[],mode:SalesSortMode,nowIso:string):Contract[]{
 const priority=new Map<string,SalesPriority>()
 for(const sale of sales)priority.set(sale.id,salesPriority(sale,nowIso))
 return sales.map((sale,index)=>({sale,index})).sort((left,right)=>{
  const a=left.sale,b=right.sale
  const terminalDelta=Number(terminal(a))-Number(terminal(b))
  const rankA=priority.get(a.id)!,rankB=priority.get(b.id)!
  let comparison=0
  if(mode==='PRIORITY'){
   comparison=priorityRank[rankA]-priorityRank[rankB]
    ||ascending(smartDeadline(a,rankA),smartDeadline(b,rankB))
  }else if(mode==='RESERVATION'){
   comparison=terminalDelta||ascending(dateMs(a.reservation_expires_at),dateMs(b.reservation_expires_at))
  }else if(mode==='DELIVERY'){
   comparison=terminalDelta||ascending(dateMs(a.planned_delivery_at),dateMs(b.planned_delivery_at))
  }else{
   comparison=descending(dateMs(a.contract_date||a.created_at),dateMs(b.contract_date||b.created_at))
  }
  return comparison||descending(dateMs(a.contract_date||a.created_at),dateMs(b.contract_date||b.created_at))
   ||a.contract_number.localeCompare(b.contract_number,'it')
   ||left.index-right.index
 }).map(({sale})=>sale)
}
