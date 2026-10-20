import type {Contract,TenantData} from '../types'

// La trattativa OPEN resta libera finché non ci sono impegni.
export function reservesVehicle(sale:Pick<Contract,'template_code'|'sale_stage'|'status'|'deposit'>){
 if(sale.template_code!=='VENDITA')return false
 const stage=String(sale.sale_stage||'OPEN').toUpperCase()
 if(['DELIVERED','CANCELLED'].includes(stage))return false
 if(['AGREED','DEPOSIT','BALANCE_PENDING','READY'].includes(stage))return true
 return stage==='OPEN'&&(Number(sale.deposit||0)>0||['FROZEN','SIGNED'].includes(String(sale.status||'')))
}

export function vehicleReservation(contracts:Contract[],vehicleId:string,excludingContractId?:string){
 return contracts.find(c=>c.vehicle_id===vehicleId&&c.id!==excludingContractId&&reservesVehicle(c))||null
}

export function reservationLabel(data:Pick<TenantData,'customers'>,sale:Contract){
 const customer=data.customers.find(c=>c.id===sale.customer_id)
 const name=[customer?.first_name,customer?.last_name].filter(Boolean).join(' ')
 return name?name:'cliente collegato'
}
