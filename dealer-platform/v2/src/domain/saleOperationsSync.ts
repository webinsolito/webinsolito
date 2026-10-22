import type {Contract,Vehicle} from '../types'
export interface SaleOperationsSnapshot{
 vehicles:Pick<Vehicle,'id'|'dealer_id'|'status'|'deleted_at'|'updated_at'>[]
 contracts:Pick<Contract,'id'|'dealer_id'|'vehicle_id'|'customer_id'|'template_code'|'status'|'sale_stage'|'reservation_expires_at'|'updated_at'>[]
}
const norm=(value:unknown)=>value==null?'':String(value)
export function saleOperationsFingerprint(snapshot:SaleOperationsSnapshot,dealerId:string):string{
 const vehicles=snapshot.vehicles.filter(v=>v.dealer_id===dealerId)
  .map(v=>[v.id,norm(v.status),norm(v.deleted_at),norm(v.updated_at)]).sort((a,b)=>a[0].localeCompare(b[0]))
 const contracts=snapshot.contracts.filter(c=>c.dealer_id===dealerId&&c.template_code==='VENDITA')
  .map(c=>[c.id,c.vehicle_id,c.customer_id,norm(c.status),norm(c.sale_stage),norm(c.reservation_expires_at),norm(c.updated_at)])
  .sort((a,b)=>a[0].localeCompare(b[0]))
 return JSON.stringify({vehicles,contracts})
}
export function saleOperationsChanged(local:SaleOperationsSnapshot,remote:SaleOperationsSnapshot,dealerId:string){
 return saleOperationsFingerprint(local,dealerId)!==saleOperationsFingerprint(remote,dealerId)
}
