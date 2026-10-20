import {describe,it,expect} from 'vitest'
import {filterSalesSegment,salesSegment,salesSegmentCounts} from './salesView'
import type {Contract} from '../types'

const sale=(id:string,stage?:string|null):Contract=>({id,dealer_id:'d',customer_id:'c',vehicle_id:'v',contract_number:id,template_code:'VENDITA',sale_stage:stage})

describe('sales view segments',()=>{
 it('classifica come attive tutte le fasi operative',()=>{for(const stage of [undefined,'OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY'])expect(salesSegment(sale(String(stage),stage))).toBe('ACTIVE')})
 it('separa consegnate e annullate',()=>{expect(salesSegment(sale('d','DELIVERED'))).toBe('DELIVERED');expect(salesSegment(sale('c','CANCELLED'))).toBe('CANCELLED')})
 it('conta e filtra senza perdere pratiche',()=>{const rows=[sale('a','READY'),sale('b','OPEN'),sale('d','DELIVERED'),sale('c','CANCELLED')];expect(salesSegmentCounts(rows)).toEqual({ACTIVE:2,DELIVERED:1,CANCELLED:1});expect(filterSalesSegment(rows,'ACTIVE').map(x=>x.id)).toEqual(['a','b']);expect(filterSalesSegment(rows,'DELIVERED').map(x=>x.id)).toEqual(['d']);expect(filterSalesSegment(rows,'CANCELLED').map(x=>x.id)).toEqual(['c'])})
})
