import type {Contract,TenantData} from '../types'

export type SalesSegment='ACTIVE'|'DELIVERED'|'CANCELLED'
export type SalesListFilter='ALL'|SalesSegment

export function salesSegment(contract:Contract):SalesSegment{
 const stage=String(contract.sale_stage||'OPEN').toUpperCase()
 if(stage==='DELIVERED')return 'DELIVERED'
 if(stage==='CANCELLED')return 'CANCELLED'
 return 'ACTIVE'
}

export function salesSegmentCounts(contracts:Contract[]){
 return contracts.reduce((acc,contract)=>{acc[salesSegment(contract)]++;return acc},{ACTIVE:0,DELIVERED:0,CANCELLED:0} as Record<SalesSegment,number>)
}

export function filterSalesSegment(contracts:Contract[],segment:SalesListFilter){
 return segment==='ALL'?contracts:contracts.filter(contract=>salesSegment(contract)===segment)
}

const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT').trim()
const compactSearch=(value:string)=>normalizeSearch(value).replace(/[^a-z0-9]/g,'')

/** Search only commercial identifiers and tenant-scoped customer/vehicle names. No finance fields. */
export function searchSales(data:Pick<TenantData,'customers'|'vehicles'>,sales:Contract[],query:string):Contract[]{
 const tokens=normalizeSearch(query).split(/\s+/).filter(Boolean)
 if(!tokens.length)return sales
 const customers=new Map(data.customers.filter(c=>!c.deleted_at).map(c=>[c.id,c]))
 const vehicles=new Map(data.vehicles.filter(v=>!v.deleted_at).map(v=>[v.id,v]))
 return sales.filter(sale=>{
  const customer=customers.get(sale.customer_id)
  const vehicle=vehicles.get(sale.vehicle_id)
  const safeCustomer=customer?.dealer_id===sale.dealer_id?customer:undefined
  const safeVehicle=vehicle?.dealer_id===sale.dealer_id?vehicle:undefined
  const text=normalizeSearch([sale.contract_number,safeCustomer?.first_name,safeCustomer?.last_name,
   safeVehicle?.plate,safeVehicle?.brand,safeVehicle?.model,safeVehicle?.version].filter(Boolean).join(' '))
  const identifiers=[sale.contract_number,safeVehicle?.plate].filter((x):x is string=>Boolean(x)).map(compactSearch)
  return tokens.every(token=>text.includes(token)||identifiers.some(value=>value.includes(compactSearch(token))&&compactSearch(token).length>0))
 })
}
