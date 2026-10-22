import type {VehicleWorkItem} from '../types'

/** Compare only scoped delivery items; ignore unrelated garage work and array ordering. */
export function deliveryChecklistFingerprint(items:VehicleWorkItem[],dealerId:string,vehicleId:string):string{
 return JSON.stringify(items.filter(item=>item.dealer_id===dealerId&&item.vehicle_id===vehicleId
  &&String(item.category||'').toUpperCase()==='CONSEGNA')
  .map(item=>[item.id,String(item.title||'').trim(),String(item.status||'').toUpperCase(),
   item.completed_at||'',item.updated_at||''])
  .sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
}
export const deliveryChecklistChanged=(local:VehicleWorkItem[],remote:VehicleWorkItem[],dealerId:string,vehicleId:string)=>
 deliveryChecklistFingerprint(local,dealerId,vehicleId)!==deliveryChecklistFingerprint(remote,dealerId,vehicleId)
