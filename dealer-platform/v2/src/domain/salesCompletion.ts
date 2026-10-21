import type {Contract,TenantData} from '../types'
import {buildDeliveryGate,type DeliveryGateCheck} from './deliveryGate'
import {salesSegment} from './salesView'

export interface SalesCompletionStatus {
 contractId:string
 count:number
 checks:Pick<DeliveryGateCheck,'id'|'label'|'detail'>[]
}

/** Checks operational delivery requirements only. Finance is PRIVATE to sales operators
 * and must never become an implied "ready to deliver" decision or be exposed in labels. */
export function salesCompletionStatus(data:TenantData,sale:Contract):SalesCompletionStatus|null{
 if(salesSegment(sale)!=='ACTIVE'||sale.template_code!=='VENDITA')return null
 const scoped:TenantData={
  ...data,
  vehicles:data.vehicles.filter(item=>item.dealer_id===sale.dealer_id),
  media:data.media.filter(item=>item.dealer_id===sale.dealer_id),
  workItems:data.workItems.filter(item=>item.dealer_id===sale.dealer_id)
 }
 const checks=buildDeliveryGate(scoped,sale,false).checks
  .filter(check=>check.state==='BLOCK')
  .map(({id,label,detail})=>({id,label,detail}))
 return {contractId:sale.id,count:checks.length,checks}
}

export function incompleteSalesIndex(data:TenantData,sales:Contract[]):Map<string,SalesCompletionStatus>{
 const result=new Map<string,SalesCompletionStatus>()
 for(const sale of sales){
  const status=salesCompletionStatus(data,sale)
  if(status?.count)result.set(sale.id,status)
 }
 return result
}

export function filterIncompleteSales(sales:Contract[],index:ReadonlyMap<string,SalesCompletionStatus>){
 return sales.filter(sale=>index.has(sale.id))
}
