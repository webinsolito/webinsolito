import type {Contract} from '../types'

export type SalesSegment='ACTIVE'|'DELIVERED'|'CANCELLED'

export function salesSegment(contract:Contract):SalesSegment{
 const stage=String(contract.sale_stage||'OPEN').toUpperCase()
 if(stage==='DELIVERED')return 'DELIVERED'
 if(stage==='CANCELLED')return 'CANCELLED'
 return 'ACTIVE'
}

export function salesSegmentCounts(contracts:Contract[]){
 return contracts.reduce((acc,contract)=>{acc[salesSegment(contract)]++;return acc},{ACTIVE:0,DELIVERED:0,CANCELLED:0} as Record<SalesSegment,number>)
}

export function filterSalesSegment(contracts:Contract[],segment:SalesSegment){
 return contracts.filter(contract=>salesSegment(contract)===segment)
}
