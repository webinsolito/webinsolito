import type {SaleOperationsSnapshot} from './saleOperationsSync'
export const RECENT_REMOTE_CHANGE_MS=30_000
/** Compare meaningful inventory/sale status; ignore timestamps, finance, prices and ordering. */
export function operationalVehicleStateChanges(previous:SaleOperationsSnapshot,next:SaleOperationsSnapshot,dealerId:string):string[]{
 const priorVehicles=new Map(previous.vehicles.filter(v=>v.dealer_id===dealerId).map(v=>[v.id,v]))
 const newVehicles=next.vehicles.filter(v=>v.dealer_id===dealerId)
 const signature=(snapshot:SaleOperationsSnapshot,vehicleId:string)=>snapshot.contracts
  .filter(c=>c.dealer_id===dealerId&&c.vehicle_id===vehicleId&&c.template_code==='VENDITA')
  .map(c=>[c.id,String(c.status||''),String(c.sale_stage||'')].join(':')).sort().join('|')
 return newVehicles.filter(vehicle=>{
  const prior=priorVehicles.get(vehicle.id)
  if(!prior)return false
  return String(prior.status||'').toUpperCase()!==String(vehicle.status||'').toUpperCase()
   ||Boolean(prior.deleted_at)!==Boolean(vehicle.deleted_at)
   ||signature(previous,vehicle.id)!==signature(next,vehicle.id)
 }).map(v=>v.id)
}
export function unexpiredRemoteChanges(expires:Record<string,number>,now:number):Record<string,number>{
 return Object.fromEntries(Object.entries(expires).filter(([,until])=>until>now))
}
