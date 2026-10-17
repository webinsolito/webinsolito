import type {Contract,Invoice,TenantData,Vehicle,VehicleFinancial} from '../types'

const CLOSED_STATUSES=new Set(['VENDUTA','CONSEGNATA'])
const n=(value:unknown)=>{const num=Number(value||0);return Number.isFinite(num)?num:0}

export interface FinanceVehicleRow {
  vehicle:Vehicle
  financial?:VehicleFinancial
  purchase:number
  expenses:number
  invested:number
  expectedSale:number
  realizedSale:number
  collected:number
  receivable:number
  expectedMargin:number|null
  realizedMargin:number|null
  recognizedSale:boolean
  closed:boolean
  missingPurchase:boolean
  saleNeedsVerification:boolean
  contract?:Contract
  invoice?:Invoice
}

export interface FinanceSnapshot {
  rows:FinanceVehicleRow[]
  stockInvestment:number
  realizedRevenue:number
  realizedMargin:number
  collected:number
  receivable:number
  missingPurchase:number
  unverifiedSales:number
}

function contractTimestamp(contract:Contract){return new Date(contract.delivered_at||contract.signed_at||contract.updated_at||contract.contract_date||0).getTime()||0}
function invoiceTimestamp(invoice:Invoice){return new Date(invoice.issue_date||0).getTime()||0}
function saleContractFor(vehicleId:string,contracts:Contract[]){return contracts.filter(c=>c.vehicle_id===vehicleId&&c.status!=='CANCELLED').sort((a,b)=>contractTimestamp(b)-contractTimestamp(a))[0]}
function saleInvoiceFor(vehicleId:string,contract:Contract|undefined,invoices:Invoice[]){const saleInvoices=invoices.filter(i=>i.vehicle_id===vehicleId&&i.invoice_type==='SALE'&&!i.deleted_at);if(contract?.sale_invoice_id){const linked=saleInvoices.find(i=>i.id===contract.sale_invoice_id);if(linked)return linked}return saleInvoices.sort((a,b)=>invoiceTimestamp(b)-invoiceTimestamp(a))[0]}

export function buildFinanceSnapshot(data:TenantData):FinanceSnapshot{
  const rows=data.vehicles.filter(v=>!v.deleted_at).map(vehicle=>{
    const financial=data.financials.find(f=>f.vehicle_id===vehicle.id)
    const purchase=n(financial?.purchase_price)
    const expenses=data.costs.filter(c=>c.vehicle_id===vehicle.id).reduce((sum,c)=>sum+n(c.amount),0)
    const invested=purchase+expenses
    const contract=saleContractFor(vehicle.id,data.contracts)
    const invoice=saleInvoiceFor(vehicle.id,contract,data.invoices)
    const closed=CLOSED_STATUSES.has(String(vehicle.status||''))||contract?.sale_stage==='DELIVERED'
    const recognizedSale=contract?.sale_stage==='DELIVERED'&&contract.integrity_state!=='LEGACY_UNVERIFIED'
    const realizedSale=recognizedSale?(n(invoice?.total_amount)||n(contract?.price)||n(vehicle.sale_price)):0
    const expectedSale=!closed?n(vehicle.asking_price):0
    const collected=recognizedSale?n(invoice?.paid_amount):0
    const receivable=recognizedSale&&realizedSale>0?Math.max(realizedSale-collected,0):0
    const missingPurchase=purchase<=0
    const realizedMargin=recognizedSale&&realizedSale>0&&!missingPurchase?realizedSale-invested:null
    const expectedMargin=!closed&&expectedSale>0&&!missingPurchase?expectedSale-invested:null
    const saleNeedsVerification=closed&&!recognizedSale
    return {vehicle,financial,purchase,expenses,invested,expectedSale,realizedSale,collected,receivable,expectedMargin,realizedMargin,recognizedSale,closed,missingPurchase,saleNeedsVerification,contract,invoice}
  }).sort((a,b)=>Number(b.missingPurchase||b.saleNeedsVerification)-Number(a.missingPurchase||a.saleNeedsVerification)||Number(b.recognizedSale)-Number(a.recognizedSale)||String(a.vehicle.brand||'').localeCompare(String(b.vehicle.brand||''),'it'))
  return {rows,stockInvestment:rows.filter(r=>!r.closed).reduce((sum,r)=>sum+r.invested,0),realizedRevenue:rows.reduce((sum,r)=>sum+r.realizedSale,0),realizedMargin:rows.reduce((sum,r)=>sum+(r.realizedMargin||0),0),collected:rows.reduce((sum,r)=>sum+r.collected,0),receivable:rows.reduce((sum,r)=>sum+r.receivable,0),missingPurchase:rows.filter(r=>r.missingPurchase).length,unverifiedSales:rows.filter(r=>r.saleNeedsVerification).length}
}
