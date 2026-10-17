import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react'
import {ArrowLeft,CarFront,Landmark,Pencil,ReceiptText,Search,TriangleAlert,WalletCards} from 'lucide-react'
import {buildFinanceSnapshot,type FinanceVehicleRow} from '../domain/finance'
import {fetchTenantData,getSession} from '../lib/api'
import {canWriteFinance,saveVehicleFinancial} from '../lib/financeApi'
import {money,vehicleName} from '../lib/format'
import type {TenantData,VehicleFinancial} from '../types'
import '../finance.css'

type Filter='all'|'stock'|'sold'|'attention'
type EditableFinancial=VehicleFinancial&{supplier?:string|null;purchase_date?:string|null}

export function FinancePage({onBack}:{onBack:()=>void}){
  const [session]=useState(()=>getSession())
  const [data,setData]=useState<TenantData|null>(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<Filter>('all')
  const [editing,setEditing]=useState<FinanceVehicleRow|null>(null)
  const writable=canWriteFinance(session)

  const load=useCallback(async()=>{if(!session){setError('Sessione scaduta');setBusy(false);return}setBusy(true);setError('');try{setData(await fetchTenantData(session))}catch(err){setError(err instanceof Error?err.message:'Impossibile caricare i dati economici')}finally{setBusy(false)}},[session])
  useEffect(()=>{void load()},[load])
  const snapshot=useMemo(()=>data?buildFinanceSnapshot(data):null,[data])
  const rows=useMemo(()=>{if(!snapshot)return [];const q=search.trim().toLowerCase();return snapshot.rows.filter(row=>{if(filter==='stock'&&row.closed)return false;if(filter==='sold'&&!row.recognizedSale)return false;if(filter==='attention'&&!row.missingPurchase&&!row.saleNeedsVerification)return false;if(!q)return true;const hay=[row.vehicle.brand,row.vehicle.model,row.vehicle.version,row.vehicle.plate,row.vehicle.vin].filter(Boolean).join(' ').toLowerCase();return hay.includes(q)})},[snapshot,search,filter])

  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!editing)return;const fd=new FormData(e.currentTarget);setBusy(true);setError('');try{await saveVehicleFinancial(editing.vehicle.id,{supplier:String(fd.get('supplier')||'')||null,purchase_date:String(fd.get('purchase_date')||'')||null,purchase_price:String(fd.get('purchase_price')||'0'),minimum_price:String(fd.get('minimum_price')||''),vat_regime:String(fd.get('vat_regime')||'MARGINE')});setEditing(null);await load()}catch(err){setError(err instanceof Error?err.message:'Salvataggio non riuscito');setBusy(false)}}

  if(!session)return <section className="finance-page"><button className="finance-back" onClick={onBack}><ArrowLeft/>Altro</button><div className="finance-empty">Sessione scaduta.</div></section>
  if(busy&&!data)return <section className="finance-page"><div className="finance-heading"><button className="finance-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">FINANZE</p><h1>Caricamento…</h1></div></div><div className="finance-loading"/></section>
  if(!snapshot)return <section className="finance-page"><button className="finance-back" onClick={onBack}><ArrowLeft/>Altro</button><div className="finance-empty">{error||'Dati economici non disponibili.'}</div></section>

  return <section className="finance-page">
    <div className="finance-heading"><button className="finance-back" onClick={onBack}><ArrowLeft/>Altro</button><div><p className="eyebrow">FINANZE PROTETTE</p><h1>Margini reali</h1><p>Acquisto + spese + vendita. Il margine reale compare solo sulle vendite consegnate e verificate.</p></div></div>
    {error&&<div className="finance-error">{error}<button onClick={()=>void load()}>Riprova</button></div>}
    <div className="finance-kpis">
      <article><span><Landmark/>CAPITALE IN STOCK</span><b>{money(snapshot.stockInvestment)}</b><small>acquisti + spese delle auto ancora aperte</small></article>
      <article><span><WalletCards/>MARGINE REALIZZATO</span><b className={snapshot.realizedMargin<0?'negative':''}>{money(snapshot.realizedMargin)}</b><small>su {money(snapshot.realizedRevenue)} di vendite riconosciute</small></article>
      <article><span><ReceiptText/>INCASSATO</span><b>{money(snapshot.collected)}</b><small>pagamenti registrati su fatture vendita</small></article>
      <article><span><ReceiptText/>DA INCASSARE</span><b>{money(snapshot.receivable)}</b><small>saldo residuo delle vendite riconosciute</small></article>
    </div>
    {(snapshot.missingPurchase>0||snapshot.unverifiedSales>0)&&<div className="finance-warning"><TriangleAlert/><div><b>Dati da completare</b><span>{snapshot.missingPurchase>0?`${snapshot.missingPurchase} auto senza costo acquisto. `:''}{snapshot.unverifiedSales>0?`${snapshot.unverifiedSales} vendite chiuse non entrano nel margine perché non verificate.`:''}</span></div></div>}
    <div className="finance-toolbar"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca auto, targa o telaio"/></label><div className="finance-filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Tutte</button><button className={filter==='stock'?'active':''} onClick={()=>setFilter('stock')}>Stock</button><button className={filter==='sold'?'active':''} onClick={()=>setFilter('sold')}>Vendute</button><button className={filter==='attention'?'active':''} onClick={()=>setFilter('attention')}>Da completare</button></div></div>
    <div className="finance-table">
      <div className="finance-table-head"><span>Auto</span><span>Acquisto</span><span>Spese</span><span>Investito</span><span>Vendita</span><span>Margine</span><span>Incasso</span><span/></div>
      {rows.length?rows.map(row=><FinanceRowView key={row.vehicle.id} row={row} writable={writable} onEdit={()=>setEditing(row)}/>):<div className="finance-empty"><CarFront/>Nessuna auto corrisponde ai filtri.</div>}
    </div>
    {editing&&<FinanceEditor row={editing} busy={busy} onClose={()=>setEditing(null)} onSubmit={save}/>} 
  </section>
}

function FinanceRowView({row,writable,onEdit}:{row:FinanceVehicleRow;writable:boolean;onEdit:()=>void}){
  const margin=row.recognizedSale?row.realizedMargin:row.expectedMargin
  const sale=row.recognizedSale?row.realizedSale:row.expectedSale
  return <article className={`finance-row ${row.missingPurchase||row.saleNeedsVerification?'attention':''}`}>
    <div className="finance-car"><b>{vehicleName(row.vehicle)}</b><span>{row.vehicle.plate||'Targa —'} · {(row.vehicle.status||'—').replaceAll('_',' ')}</span>{row.saleNeedsVerification&&<em>Vendita da verificare</em>}{row.missingPurchase&&<em>Costo acquisto mancante</em>}</div>
    <div data-label="Acquisto"><b>{row.purchase>0?money(row.purchase):'—'}</b></div>
    <div data-label="Spese"><b>{money(row.expenses)}</b></div>
    <div data-label="Investito"><b>{money(row.invested)}</b></div>
    <div data-label={row.recognizedSale?'Vendita':'Prezzo cliente'}><b>{sale>0?money(sale):'—'}</b></div>
    <div data-label={row.recognizedSale?'Margine reale':'Margine previsto'}>{margin===null?<b>—</b>:<><b className={margin<0?'negative':'positive'}>{money(margin)}</b><small>{row.recognizedSale?'REALE':'PREVISTO'}</small></>}</div>
    <div data-label="Incasso"><b>{row.recognizedSale?money(row.collected):'—'}</b>{row.receivable>0&&<small>{money(row.receivable)} da incassare</small>}</div>
    <div>{writable&&<button className="finance-edit" onClick={onEdit} aria-label={`Modifica costi ${vehicleName(row.vehicle)}`}><Pencil/></button>}</div>
  </article>
}

function FinanceEditor({row,busy,onClose,onSubmit}:{row:FinanceVehicleRow;busy:boolean;onClose:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}){
  const f=row.financial as EditableFinancial|undefined
  return <div className="finance-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><form className="finance-modal" onSubmit={onSubmit}>
    <div className="finance-modal-head"><div><p className="eyebrow">COSTO AUTO</p><h2>{vehicleName(row.vehicle)}</h2><span>{row.vehicle.plate||'Targa —'}</span></div><button type="button" onClick={onClose} disabled={busy}>×</button></div>
    <label>Fornitore<input name="supplier" defaultValue={f?.supplier||''} placeholder="es. AutoProff / privato"/></label>
    <div className="finance-form-grid"><label>Data acquisto<input name="purchase_date" type="date" defaultValue={f?.purchase_date||''}/></label><label>Costo acquisto €<input name="purchase_price" type="number" min="0" step="0.01" required defaultValue={row.purchase||''}/></label></div>
    <div className="finance-form-grid"><label>Prezzo minimo €<input name="minimum_price" type="number" min="0" step="0.01" defaultValue={f?.minimum_price||''}/></label><label>Regime IVA<select name="vat_regime" defaultValue={f?.vat_regime||'MARGINE'}><option value="MARGINE">Regime del margine</option><option value="IVA_ESPOSTA">IVA esposta</option><option value="PRIVATO_FUORI_CAMPO">Privato / fuori campo</option></select></label></div>
    <div className="finance-modal-summary"><span>Spese già registrate <b>{money(row.expenses)}</b></span><span>Investimento dopo il salvataggio verrà ricalcolato automaticamente.</span></div>
    <div className="finance-modal-actions"><button type="button" onClick={onClose} disabled={busy}>Annulla</button><button className="primary" disabled={busy}>{busy?'Salvataggio…':'Salva costo acquisto'}</button></div>
  </form></div>
}
