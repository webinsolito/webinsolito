import {buildFinanceSnapshot,type FinanceVehicleRow} from './finance'
import type {TenantData,VehicleFinancial} from '../types'

const DAY=86_400_000
export type ReportPeriod='30'|'90'|'365'|'all'
export type StockBucket='0-30'|'31-60'|'61-90'|'90+'

type FinancialWithDate=VehicleFinancial&{purchase_date?:string|null}

export interface StockReportRow { row:FinanceVehicleRow; enteredAt:string|null; daysInStock:number|null; bucket:StockBucket|null }
export interface SaleReportRow { row:FinanceVehicleRow; deliveredAt:string; daysToSell:number|null; marginRate:number|null }
export interface TrendPoint { key:string; label:string; sales:number; revenue:number; margin:number }
export interface OperationalReport {
  stock:StockReportRow[]
  sales:SaleReportRow[]
  slowStock:StockReportRow[]
  stockCount:number
  stockInvestment:number
  averageStockDays:number|null
  staleCount:number
  staleCapital:number
  salesCount:number
  revenue:number
  realizedMargin:number
  marginRate:number|null
  collected:number
  receivable:number
  averageDaysToSell:number|null
  averageMargin:number|null
  marginCompleteSales:number
  missingStockDates:number
  buckets:Array<{bucket:StockBucket;count:number;capital:number}>
  trend:TrendPoint[]
}

function validTime(value?:string|null){if(!value)return 0;const ms=new Date(value).getTime();return Number.isFinite(ms)?ms:0}
function iso(value:number){return new Date(value).toISOString()}
function daysBetween(start:number,end:number){return Math.max(0,Math.floor((end-start)/DAY))}
function stockBucket(days:number|null):StockBucket|null{if(days===null)return null;if(days<=30)return '0-30';if(days<=60)return '31-60';if(days<=90)return '61-90';return '90+'}
function purchaseTime(row:FinanceVehicleRow){const financial=row.financial as FinancialWithDate|undefined;return validTime(financial?.purchase_date)||validTime(row.vehicle.purchase_date)||validTime(row.vehicle.created_at)}
function deliveryTime(row:FinanceVehicleRow){return validTime(row.contract?.delivered_at)||validTime(row.contract?.updated_at)||validTime(row.contract?.contract_date)}
function periodStart(now:number,period:ReportPeriod){if(period==='all')return 0;return now-Number(period)*DAY}
function avg(values:number[]){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function monthKey(ms:number){const d=new Date(ms);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function monthLabel(key:string){const [year,month]=key.split('-').map(Number);return new Intl.DateTimeFormat('it-IT',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)))}

export function buildOperationalReport(data:TenantData,now=Date.now(),period:ReportPeriod='90'):OperationalReport{
  const finance=buildFinanceSnapshot(data)
  const stock=finance.rows.filter(r=>!r.closed).map(row=>{
    const entered=purchaseTime(row)
    const daysInStock=entered?daysBetween(entered,now):null
    return {row,enteredAt:entered?iso(entered):null,daysInStock,bucket:stockBucket(daysInStock)}
  }).sort((a,b)=>(b.daysInStock??-1)-(a.daysInStock??-1)||b.row.invested-a.row.invested)
  const start=periodStart(now,period)
  const sales=finance.rows.filter(r=>r.recognizedSale).map(row=>{
    const delivered=deliveryTime(row)
    const purchased=purchaseTime(row)
    const marginRate=row.realizedMargin!==null&&row.realizedSale>0?row.realizedMargin/row.realizedSale*100:null
    return delivered?{row,deliveredAt:iso(delivered),daysToSell:purchased?daysBetween(purchased,delivered):null,marginRate}:null
  }).filter((x):x is SaleReportRow=>Boolean(x)&&validTime(x!.deliveredAt)>=start&&validTime(x!.deliveredAt)<=now).sort((a,b)=>validTime(b.deliveredAt)-validTime(a.deliveredAt))
  const revenue=sales.reduce((sum,s)=>sum+s.row.realizedSale,0)
  const completeSales=sales.filter(s=>s.row.realizedMargin!==null)
  const margins=completeSales.map(s=>s.row.realizedMargin as number)
  const marginRevenue=completeSales.reduce((sum,s)=>sum+s.row.realizedSale,0)
  const realizedMargin=margins.reduce((sum,value)=>sum+value,0)
  const collected=sales.reduce((sum,s)=>sum+s.row.collected,0)
  const receivable=sales.reduce((sum,s)=>sum+s.row.receivable,0)
  const stale=stock.filter(s=>(s.daysInStock??0)>90)
  const bucketOrder:StockBucket[]=['0-30','31-60','61-90','90+']
  const buckets=bucketOrder.map(bucket=>({bucket,count:stock.filter(s=>s.bucket===bucket).length,capital:stock.filter(s=>s.bucket===bucket).reduce((sum,s)=>sum+s.row.invested,0)}))
  const trendMap=new Map<string,TrendPoint>()
  for(const sale of sales){const key=monthKey(validTime(sale.deliveredAt));const point=trendMap.get(key)||{key,label:monthLabel(key),sales:0,revenue:0,margin:0};point.sales+=1;point.revenue+=sale.row.realizedSale;point.margin+=sale.row.realizedMargin||0;trendMap.set(key,point)}
  const trend=[...trendMap.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-12)
  return {
    stock,
    sales,
    slowStock:stock.filter(s=>(s.daysInStock??0)>60).slice(0,12),
    stockCount:stock.length,
    stockInvestment:stock.reduce((sum,s)=>sum+s.row.invested,0),
    averageStockDays:avg(stock.flatMap(s=>s.daysInStock===null?[]:[s.daysInStock])),
    staleCount:stale.length,
    staleCapital:stale.reduce((sum,s)=>sum+s.row.invested,0),
    salesCount:sales.length,
    revenue,
    realizedMargin,
    marginRate:marginRevenue>0?realizedMargin/marginRevenue*100:null,
    collected,
    receivable,
    averageDaysToSell:avg(sales.flatMap(s=>s.daysToSell===null?[]:[s.daysToSell])),
    averageMargin:avg(margins),
    marginCompleteSales:completeSales.length,
    missingStockDates:stock.filter(s=>s.daysInStock===null).length,
    buckets,
    trend
  }
}
