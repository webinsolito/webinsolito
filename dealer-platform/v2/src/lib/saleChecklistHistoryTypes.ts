import type {SaleChecklistHistoryEvent} from '../domain/saleChecklistHistory'

export interface ReturnTypeSaleChecklistHistory{
 events:SaleChecklistHistoryEvent[]
 loading:boolean
 error:string
 refresh:()=>void
}
