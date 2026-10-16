import {useMemo,useState} from 'react'
import {CalendarClock,Car,CheckCircle2,ClipboardCheck,Euro,Plus,ShoppingBag,UserRound,X} from 'lucide-react'
import {canWriteGarage,saveWorkItem} from '../lib/api'
import {canWriteContracts,createSaleContract,friendlySaleError,updateSaleStage} from '../lib/salesApi'
import type {Contract,SaleDraft,SessionPayload,TenantData} from '../types'

const DELIVERY_ITEMS=['Contratto firmato','Saldo verificato','Passaggio / documenti completati','Libretto e documenti pronti','Preparazione auto completata','Doppie chiavi presenti','Garanzia / documentazione consegnata']
const STAGES=['OPEN','AGREED','DEPOSIT','BALANCE_PENDING','READY','DELIVERED'] as const
const STAGE_LABELS:Record<string,string>={OPEN:'Aperta',AGREED:'Accordo',DEPOSIT:'Caparra',BALANCE_PENDING:'Saldo da chiudere',READY:'Pronta consegna',DELIVERED:'Consegnata',CANCELLED:'Annullata'}
const NEXT_STAGE:Record<string,string>={OPEN:'AGREED',AGREED:'DEPOSIT',DEPOSIT:'BALANCE_PENDING',BALANCE_PENDING:'READY'}
const money=(value?:number|null)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value||0))
const personName=(c?:TenantData['customers'][number])=>c?[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente':'Cliente non disponibile'
const vehicleName=(v?:TenantData['vehicles'][number])=>v?[v.brand,v.model,v.version].filter(Boolean).join(' ')||'Auto':'Auto non disponibile'
const localDateTime=(value?:string|null)=>{if(!value)return 'Da definire';const d=new Date(value);return Number.isNaN(d.getTime())?'Da definire':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}

export function SalesPage({data,session,onRefresh}:{data:TenantData;session:SessionPayload;onRefresh:()=>Promise<void>}){
  const writable=canWriteContracts(session),checklistWritable=canWriteGarage(session)
  const [creating,setCreating]=useState(false)
  const [draft,setDraft]=useState<SaleDraft>({customerId:'',vehicleId:'',price:'',deposit:'',plannedDeliveryAt:'',notes:''})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const sales=useMemo(()=>data.contracts.filter(c=>c.template_code==='VENDITA').sort((a,b)=>String(b.contract_date||'').localeCompare(String(a.contract_date||''))),[data.contracts])
  const selectVehicle=(vehicleId:string)=>{const vehicle=data.vehicles.find(v=>v.id===vehicleId);setDraft(current=>({...current,vehicleId,price:vehicle?.asking_price??current.price}))}
  const persist=async()=>{setBusy(true);setError('');try{await createSaleContract(draft);setCreating(false);setDraft({customerId:'',vehicleId:'',price:'',deposit:'',plannedDeliveryAt:'',notes:''});await onRefresh()}catch(err){setError(friendlySaleError(err))}finally{setBusy(false)}}
  const move=async(contract:Contract,stage:string)=>{setBusy(true);setError('');try{await updateSaleStage(contract,stage);await onRefresh()}catch(err){setError(friendlySaleError(err))}finally{setBusy(false)}}
  const ensureChecklist=async(contract:Contract)=>{setBusy(true);setError('');try{const existing=new Set(data.workItems.filter(w=>w.vehicle_id===contract.vehicle_id&&w.category==='CONSEGNA').map(w=>String(w.title||'').trim()));for(const title of DELIVERY_ITEMS){if(!existing.has(title))await saveWorkItem(contract.vehicle_id,{title,category:'CONSEGNA',priority:'HIGH',note:'Checklist consegna vendita'});}await onRefresh()}catch(err){setError(err instanceof Error?err.message:'Errore checklist consegna')}finally{setBusy(false)}}

  return <>
    <div className="page-heading"><div><p className="eyebrow">VENDITA E CONSEGNA</p><h1>Vendite</h1><p>Dalla trattativa alla consegna, con i blocchi reali che evitano errori.</p></div>{writable&&<button className="primary-action" data-testid="new-sale" onClick={()=>setCreating(true)}><Plus/> Nuova vendita</button>}</div>
    {error&&<div className="form-error customer-global-error">{error}</div>}

    {creating&&<section className="sale-create" data-testid="sale-create"><div className="customer-section-head"><div><p className="eyebrow">NUOVA VENDITA</p><h2>Apri pratica vendita</h2></div><button className="icon-ghost" aria-label="Chiudi vendita" onClick={()=>setCreating(false)}><X/></button></div><div className="sale-form-grid"><label><span>CLIENTE</span><select aria-label="CLIENTE VENDITA" disabled={busy} value={draft.customerId} onChange={e=>setDraft({...draft,customerId:e.target.value})}><option value="">Seleziona cliente…</option>{data.customers.filter(c=>!c.deleted_at).map(c=><option key={c.id} value={c.id}>{personName(c)}</option>)}</select></label><label><span>AUTO</span><select aria-label="AUTO VENDITA" disabled={busy} value={draft.vehicleId} onChange={e=>selectVehicle(e.target.value)}><option value="">Seleziona auto…</option>{data.vehicles.filter(v=>!v.deleted_at).map(v=><option key={v.id} value={v.id}>{vehicleName(v)}{v.plate?` · ${v.plate}`:''}</option>)}</select></label><label><span>PREZZO VENDITA €</span><input aria-label="PREZZO VENDITA" inputMode="decimal" disabled={busy} value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label><label><span>CAPARRA €</span><input aria-label="CAPARRA VENDITA" inputMode="decimal" disabled={busy} value={draft.deposit??''} onChange={e=>setDraft({...draft,deposit:e.target.value})}/></label><label><span>CONSEGNA PREVISTA</span><input aria-label="CONSEGNA PREVISTA" type="datetime-local" disabled={busy} value={draft.plannedDeliveryAt||''} onChange={e=>setDraft({...draft,plannedDeliveryAt:e.target.value})}/></label><label className="wide"><span>NOTE</span><input aria-label="NOTE VENDITA" disabled={busy} value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Permuta, finanziamento, richieste cliente…"/></label></div><div className="workbench-actions"><button data-testid="sale-save" disabled={busy||!draft.customerId||!draft.vehicleId||!draft.price} onClick={()=>void persist()}><ShoppingBag/> {busy?'Salvataggio…':'Apri vendita'}</button><button className="ghost" onClick={()=>setCreating(false)}><X/> Annulla</button></div></section>}

    <div className="sales-list">{sales.map(contract=>{
      const customer=data.customers.find(c=>c.id===contract.customer_id),vehicle=data.vehicles.find(v=>v.id===contract.vehicle_id)
      const deliveryItems=data.workItems.filter(w=>w.vehicle_id===contract.vehicle_id&&w.category==='CONSEGNA')
      const done=new Set(deliveryItems.filter(w=>w.status==='DONE').map(w=>String(w.title||'').trim()))
      const checklistDone=DELIVERY_ITEMS.filter(item=>done.has(item)).length
      const stage=contract.sale_stage||'OPEN',next=NEXT_STAGE[stage]
      const terminal=stage==='DELIVERED'||stage==='CANCELLED'
      return <article className={`sale-card ${terminal?'is-terminal':''}`} key={contract.id} data-testid="sale-card"><div className="sale-card-head"><div><span className="sale-number">{contract.contract_number}</span><h3>{vehicleName(vehicle)}</h3><p><UserRound/> {personName(customer)}</p></div><span className={`sale-stage stage-${stage.toLowerCase()}`}>{STAGE_LABELS[stage]||stage}</span></div><div className="sale-kpis"><div><Euro/><span>Prezzo</span><b>{money(contract.price)}</b></div><div><Euro/><span>Caparra</span><b>{money(contract.deposit)}</b></div><div><CalendarClock/><span>Consegna</span><b>{localDateTime(contract.planned_delivery_at)}</b></div><div><ClipboardCheck/><span>Checklist</span><b>{checklistDone}/{DELIVERY_ITEMS.length}</b></div></div><div className="sale-progress">{STAGES.map(s=><span key={s} className={STAGES.indexOf(s)<=STAGES.indexOf(stage as typeof STAGES[number])?'done':''}>{STAGE_LABELS[s]}</span>)}</div><div className="sale-status-line"><span>Contratto: <b>{contract.status||'DRAFT'}</b></span>{stage==='READY'&&<span>{contract.status==='SIGNED'?'Contratto firmato':'Firma contratto ancora necessaria'}</span>}</div>{writable&&!terminal&&<div className="sale-actions">{checklistWritable&&<button className="soft-action" disabled={busy} onClick={()=>void ensureChecklist(contract)}><ClipboardCheck/> Prepara checklist</button>}{next&&<button disabled={busy} onClick={()=>void move(contract,next)}><CheckCircle2/> Avanza a {STAGE_LABELS[next]}</button>}{stage==='READY'&&<button className="delivery-action" disabled={busy||checklistDone<DELIVERY_ITEMS.length} onClick={()=>void move(contract,'DELIVERED')}><Car/> Verifica e consegna</button>}</div>}</article>
    })}{!sales.length&&!creating&&<div className="empty-state">Nessuna vendita aperta. Crea la prima pratica quando un cliente conferma l’auto.</div>}</div>
  </>
}
