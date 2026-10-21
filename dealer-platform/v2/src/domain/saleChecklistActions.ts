import {DELIVERY_CHECKLIST} from './sale360'
import type {Contract,TenantData,VehicleWorkItem} from '../types'

export type ChecklistResolution={kind:'DONE'|'EXISTING'|'CREATE';item?:VehicleWorkItem}

/** Resolve one existing checklist action, confined to the sale's dealer and vehicle. */
export function resolveSaleChecklistAction(data:TenantData,contract:Contract,title:string):ChecklistResolution{
 if(!DELIVERY_CHECKLIST.includes(title))throw new Error('Verifica della checklist non riconosciuta')
 if(contract.template_code!=='VENDITA'||['DELIVERED','CANCELLED'].includes(String(contract.sale_stage||'').toUpperCase()))throw new Error('La vendita non è più modificabile')
 if(!data.vehicles.some(v=>v.id===contract.vehicle_id&&v.dealer_id===contract.dealer_id&&!v.deleted_at))throw new Error('Auto della concessionaria non disponibile')
 const items=data.workItems.filter(item=>item.dealer_id===contract.dealer_id&&item.vehicle_id===contract.vehicle_id&&String(item.category||'').toUpperCase()==='CONSEGNA'&&String(item.title||'').trim()===title)
 if(items.some(item=>String(item.status||'').toUpperCase()==='DONE'))return {kind:'DONE'}
 const pending=items.find(item=>!['DONE','CANCELLED','CHIUSO'].includes(String(item.status||'').toUpperCase()))
 return pending?{kind:'EXISTING',item:pending}:{kind:'CREATE'}
}

// Only one DONE row may be reversed: duplicate DONE rows must be reconciled manually,
// otherwise reopening one row would leave the delivery gate incorrectly green.
export function resolveSaleChecklistUndo(data:TenantData,contract:Contract,title:string):VehicleWorkItem{
 const resolution=resolveSaleChecklistAction(data,contract,title)
 if(resolution.kind!=='DONE')throw new Error('Questa verifica non risulta più completata. Aggiorna la vendita.')
 const completed=data.workItems.filter(item=>item.dealer_id===contract.dealer_id&&item.vehicle_id===contract.vehicle_id
  &&String(item.category||'').toUpperCase()==='CONSEGNA'&&String(item.title||'').trim()===title&&String(item.status||'').toUpperCase()==='DONE')
 if(completed.length!==1)throw new Error('Sono presenti più verifiche completate con lo stesso nome. Correggile dalla scheda veicolo.')
 return completed[0]
}
