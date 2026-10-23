import {garageReviewPriority} from './garageReviewPriority'
import {vehicleAvailabilityAlert} from './vehicleAvailabilityAlerts'
import type {TenantData} from '../types'

/** Single dealer-scoped source of truth for Garage and OGGI review totals (Mod52). */
export function buildGarageReviewSummary(
 data:Pick<TenantData,'vehicles'|'contracts'>,dealerId:string
){
 const ids=new Set<string>()
 let reservation=0,blocked=0,other=0
 for(const vehicle of data.vehicles){
  if(vehicle.deleted_at||vehicle.dealer_id!==dealerId||ids.has(vehicle.id))continue
  if(vehicleAvailabilityAlert(vehicle,data.contracts,dealerId)?.kind!=='UNAVAILABLE')continue
  ids.add(vehicle.id)
  const kind=garageReviewPriority(vehicle).kind
  if(kind==='reservation')reservation++
  else if(kind==='blocked')blocked++
  else other++
 }
 return {ids,total:ids.size,reservation,blocked,other}
}
