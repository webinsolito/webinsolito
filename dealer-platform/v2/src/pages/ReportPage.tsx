import {useCallback,useEffect,useMemo,useState} from 'react'
import {ArrowLeft,BarChart3,CarFront,Clock3,Download,Euro,ReceiptText,RotateCw,TriangleAlert,WalletCards} from 'lucide-react'
import {buildOperationalReport,type ReportPeriod} from '../domain/report'
import {canSeeFinance,fetchTenantData,getSession} from '../lib/api'
import {money,vehicleName} from '../lib/format'
import type {TenantData} from '../types'
import '../report.css'

const PERIODS:Array<{value:ReportPeriod;label:string}>=[{value:'30',label:'30 giorni'},{value:'90',label:'90 giorni'},{value:'365',label:'12 mesi'},{value:'all',label:'Sempre'}]
const dateLabel=(value:string)=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value))
const daysLabel=(value:number|null)=>value===null?'Data mancante':`${Math.round(value)} gg`
const pct=(value:number|null)=>value===null?'—':`${value.toFixed(1).replace('.',',')}%`

export function ReportPage({onBack}:{onBack:()=>void}){
  const [session]=useState(()=>getSession())
  const allowed=canSeeFinance(session)
  const [data,setData]=useState<TenantData|null>(null)
  const [period,setPeriod]=useState<ReportPeriod>('90')
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{if(!session||!allowed){setBusy(false);return}setBusy(true);setError('');try{setData(await fetchTenantData(session))}catch(err){setError(err instanceof Error?err.message:'Impossibile caricare il report')}finally{setBusy(false)}},[session,allowed])
  useEffect(()=>{void load()},[load])
  const report=useMemo(()=>data?buildOperationalReport(data,Date.now(),period):null,[data,period])

  if(!session||!allowed)return <section className="report-page"><button className="report-back" onClick={onBack}><ArrowLeft/>Altro</button><div className="report-empty">Report economico non disponibile per questo profilo.</div></section>
  if(busy&&!data)return <section className="report-page"><div className="report-heading"><button className="report-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">REPORT</p><h1>Caricamento…</h1></div></div><div className="report-loading"/></section>
  if(!report)return <section className="report-page"><button className="report-back" onClick={onBack}><ArrowLeft/>Altro</button><div className="report-empty">{error||'Dati report non disponibili.'}</div></section>

  const maxBucket=Math.max(...report.buckets.map(x=>x.count),1)
  const maxTrend=Math.max(...report.trend.map(x=>x.revenue),1)
  const periodName=PERIODS.find(x=>x.value===period)?.label||period
  return <section className="report-page">
    <div className="report-heading"><button className="report-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">REPORT OPERATIVO</p><h1>Come sta girando la concessionaria</h1><p>Stock, capitale fermo, vendite, margini e incassi. Numeri reali, senza stimare ciò che manca.</p></div><button className="report-print" onClick={()=>window.print()}><Download/>Stampa / PDF</button></div>
    {error&&<div className="report-error"><span>{error}</span><button onClick={()=>void load()}><RotateCw/>Riprova</button></div>}
    <div className="report-periods">{PERIODS.map(p=><button key={p.value} className={period===p.value?'active':''} onClick={()=>setPeriod(p.value)}>{p.label}</button>)}</div>

    <div className="report-kpis">
      <article><span><CarFront/>AUTO IN STOCK</span><b>{report.stockCount}</b><small>{money(report.stockInvestment)} investiti · media {daysLabel(report.averageStockDays)}</small></article>
      <article className={report.staleCount?'warn':''}><span><Clock3/>OLTRE 90 GIORNI</span><b>{report.staleCount}</b><small>{money(report.staleCapital)} di capitale fermo</small></article>
      <article><span><BarChart3/>VENDITE · {periodName.toUpperCase()}</span><b>{report.salesCount}</b><small>{money(report.revenue)} di ricavi verificati</small></article>
      <article><span><Euro/>MARGINE REALIZZATO</span><b className={report.realizedMargin<0?'negative':''}>{money(report.realizedMargin)}</b><small>{pct(report.marginRate)} sulle vendite con costi completi · {report.marginCompleteSales}/{report.salesCount}</small></article>
      <article><span><WalletCards/>INCASSATO</span><b>{money(report.collected)}</b><small>su vendite del periodo</small></article>
      <article className={report.receivable>0?'warn':''}><span><ReceiptText/>DA INCASSARE</span><b>{money(report.receivable)}</b><small>saldo ancora aperto</small></article>
    </div>

    <div className="report-decision-grid">
      <article className="report-panel"><div className="report-panel-head"><div><p className="eyebrow">SALUTE STOCK</p><h2>Età del parco auto</h2></div><b>{daysLabel(report.averageStockDays)} medi</b></div><div className="aging-list">{report.buckets.map(bucket=><div className="aging-row" key={bucket.bucket}><div><b>{bucket.bucket} gg</b><span>{bucket.count} auto · {money(bucket.capital)}</span></div><div className="aging-track"><i style={{width:`${Math.max(bucket.count/maxBucket*100,bucket.count?8:0)}%`}}/></div></div>)}</div>{report.missingStockDates>0&&<div className="report-note"><TriangleAlert/>{report.missingStockDates} auto non entra nella media perché manca una data di ingresso affidabile.</div>}</article>
      <article className="report-panel"><div className="report-panel-head"><div><p className="eyebrow">VELOCITÀ VENDITA</p><h2>Tempo e resa</h2></div></div><div className="metric-pairs"><div><span>GIORNI MEDI PER VENDERE</span><b>{daysLabel(report.averageDaysToSell)}</b></div><div><span>MARGINE MEDIO / AUTO</span><b>{report.averageMargin===null?'—':money(report.averageMargin)}</b></div><div><span>MARGINE %</span><b>{pct(report.marginRate)}</b></div><div><span>VENDITE CON COSTI COMPLETI</span><b>{report.marginCompleteSales}/{report.salesCount}</b></div></div></article>
    </div>

    <div className="report-section"><div className="report-section-head"><div><p className="eyebrow">PRIORITÀ</p><h2>Auto da sbloccare</h2><p>Prima quelle ferme da più tempo e con capitale immobilizzato.</p></div></div>{report.slowStock.length?<div className="report-table"><div className="report-table-head stock"><span>Auto</span><span>Giacenza</span><span>Investito</span><span>Prezzo cliente</span><span>Margine previsto</span></div>{report.slowStock.map(item=><article className="report-table-row stock" key={item.row.vehicle.id}><div><b>{vehicleName(item.row.vehicle)}</b><small>{item.row.vehicle.plate||'Targa —'}</small></div><div data-label="Giacenza"><b className={(item.daysInStock||0)>90?'negative':''}>{daysLabel(item.daysInStock)}</b></div><div data-label="Investito"><b>{money(item.row.invested)}</b></div><div data-label="Prezzo cliente"><b>{item.row.expectedSale?money(item.row.expectedSale):'—'}</b></div><div data-label="Margine previsto"><b className={(item.row.expectedMargin||0)<0?'negative':'positive'}>{item.row.expectedMargin===null?'—':money(item.row.expectedMargin)}</b></div></article>)}</div>:<div className="report-empty compact">Nessuna auto oltre 60 giorni nello stock attuale.</div>}</div>

    <div className="report-decision-grid lower">
      <article className="report-panel"><div className="report-panel-head"><div><p className="eyebrow">ANDAMENTO</p><h2>Vendite per mese</h2></div></div>{report.trend.length?<div className="trend-list">{report.trend.map(point=><div className="trend-row" key={point.key}><span>{point.label}</span><div className="trend-track"><i style={{width:`${Math.max(point.revenue/maxTrend*100,point.revenue?6:0)}%`}}/></div><b>{money(point.revenue)}</b><small>{point.sales} vendite · margine registrato {money(point.margin)}</small></div>)}</div>:<div className="report-empty compact">Nessuna vendita verificata nel periodo.</div>}</article>
      <article className="report-panel"><div className="report-panel-head"><div><p className="eyebrow">AZIONI</p><h2>Cosa guardare adesso</h2></div></div><div className="action-insights"><div className={report.staleCount?'attention':''}><span>1</span><p><b>Stock vecchio</b>{report.staleCount?`${report.staleCount} auto oltre 90 giorni bloccano ${money(report.staleCapital)}.`:'Nessuna auto oltre 90 giorni.'}</p></div><div className={report.receivable>0?'attention':''}><span>2</span><p><b>Incassi</b>{report.receivable>0?`Restano ${money(report.receivable)} da incassare sulle vendite del periodo.`:'Nessun saldo aperto sulle vendite del periodo.'}</p></div><div className={report.marginCompleteSales<report.salesCount?'attention':''}><span>3</span><p><b>Qualità dati</b>{report.marginCompleteSales<report.salesCount?`${report.salesCount-report.marginCompleteSales} vendite non hanno costi completi: il margine totale mostrato è parziale.`:'Tutte le vendite del periodo hanno dati sufficienti per il margine.'}</p></div></div></article>
    </div>

    <div className="report-section"><div className="report-section-head"><div><p className="eyebrow">VENDITE VERIFICATE</p><h2>Ultime vendite del periodo</h2></div></div>{report.sales.length?<div className="report-table"><div className="report-table-head sales"><span>Auto</span><span>Consegna</span><span>Vendita</span><span>Margine</span><span>Tempo vendita</span><span>Incasso</span></div>{report.sales.slice(0,20).map(item=><article className="report-table-row sales" key={`${item.row.vehicle.id}-${item.deliveredAt}`}><div><b>{vehicleName(item.row.vehicle)}</b><small>{item.row.vehicle.plate||'Targa —'}</small></div><div data-label="Consegna"><b>{dateLabel(item.deliveredAt)}</b></div><div data-label="Vendita"><b>{money(item.row.realizedSale)}</b></div><div data-label="Margine"><b className={(item.row.realizedMargin||0)<0?'negative':'positive'}>{item.row.realizedMargin===null?'—':money(item.row.realizedMargin)}</b><small>{pct(item.marginRate)}</small></div><div data-label="Tempo vendita"><b>{daysLabel(item.daysToSell)}</b></div><div data-label="Incasso"><b>{money(item.row.collected)}</b>{item.row.receivable>0&&<small>{money(item.row.receivable)} residuo</small>}</div></article>)}</div>:<div className="report-empty compact">Nessuna vendita verificata in questo periodo.</div>}</div>
  </section>
}
