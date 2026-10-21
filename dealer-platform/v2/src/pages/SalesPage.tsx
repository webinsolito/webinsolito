import {useEffect,useMemo,useState} from 'react'
import {ArrowUpDown,Plus,Search,ShoppingBag,X} from 'lucide-react'
import {canWriteGarage,clearMatchingReservationCallback,logCustomerInteraction,saveCustomerNextAction,saveWorkItem} from '../lib/api'
import {cancelSaleContract,canWriteContracts,createSaleContract,extendSaleReservation,friendlySaleError,updateSaleStage} from '../lib/salesApi'
import {Sale360Drawer} from '../components/Sale360Drawer'
import {SalesCompactCard} from '../components/SalesCompactCard'
import {SalesReservationOverview} from '../components/SalesReservationOverview'
import {filterSalesSegment,searchSales,salesSegment,salesSegmentCounts,type SalesListFilter} from '../domain/salesView'
import {salesPriority,sortSales,type SalesSortMode} from '../domain/salesSorting'
import {reservationLabel,vehicleReservation} from '../domain/saleReservation'
import {activeReservationAlerts} from '../domain/reservationDeadlines'
import {latestReservationCompletion,reservationCompletionTitle,reservationNextStep,type ReservationFollowupWindow} from '../domain/reservationFollowup'
import type {Contract,SaleDraft,SessionPayload,TenantData} from '../types'

const DELIVERY_ITEMS=['Contratto firmato','Saldo verificato','Passaggio / documenti completati','Libretto e documenti pronti','Preparazione auto completata','Doppie chiavi presenti','Garanzia / documentazione consegnata']
const personName=(c?:TenantData['customers'][number])=>c?[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente':'Cliente non disponibile'
const vehicleName=(v?:TenantData['vehicles'][number])=>v?[v.brand,v.model,v.version].filter(Boolean).join(' ')||'Auto':'Auto non disponibile'

export function SalesPage({data,session,onRefresh,focusContractId,focusVehicleId,focusCustomerId,focusKey=0,onFocusConsumed,onOpenCustomer,onOpenVehicle,onOpenDeliveryAppointment,onOpenInvoices,onOpenDeadlines}:{data:TenantData;session:SessionPayload;onRefresh:()=>Promise<void>;focusContractId?:string|null;focusVehicleId?:string|null;focusCustomerId?:string|null;focusKey?:number;onFocusConsumed?:()=>void;onOpenCustomer:(id:string)=>void;onOpenVehicle:(id:string)=>void;onOpenDeliveryAppointment:(customerId:string,vehicleId:string)=>void;onOpenInvoices:(invoiceId?:string)=>void;onOpenDeadlines:()=>void}){
  const writable=canWriteContracts(session),checklistWritable=canWriteGarage(session)
  const [creating,setCreating]=useState(false)
  const [draft,setDraft]=useState<SaleDraft>({customerId:'',vehicleId:'',price:'',deposit:'',plannedDeliveryAt:'',notes:''})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [focusedVehicleId,setFocusedVehicleId]=useState<string|null>(null)
  const [focusedCustomerId,setFocusedCustomerId]=useState<string|null>(null)
  const [sale360Id,setSale360Id]=useState<string|null>(null)
  const [segment,setSegment]=useState<SalesListFilter>('ACTIVE')
  const [searchQuery,setSearchQuery]=useState('')
  const [sortMode,setSortMode]=useState<SalesSortMode>('PRIORITY')
  const [nowIso,setNowIso]=useState(()=>new Date().toISOString())
  useEffect(()=>{
    const refreshClock=()=>setNowIso(new Date().toISOString())
    const interval=window.setInterval(refreshClock,60_000)
    window.addEventListener('focus',refreshClock)
    document.addEventListener('visibilitychange',refreshClock)
    return()=>{window.clearInterval(interval);window.removeEventListener('focus',refreshClock);document.removeEventListener('visibilitychange',refreshClock)}
  },[])
  const allSales=useMemo(()=>data.contracts.filter(c=>c.template_code==='VENDITA').sort((a,b)=>Number(b.vehicle_id===focusedVehicleId||b.customer_id===focusedCustomerId)-Number(a.vehicle_id===focusedVehicleId||a.customer_id===focusedCustomerId)||String(b.contract_date||'').localeCompare(String(a.contract_date||''))),[data.contracts,focusedVehicleId,focusedCustomerId])
  const counts=useMemo(()=>salesSegmentCounts(allSales),[allSales])
  const alerts=activeReservationAlerts(data,nowIso)
  const sales=useMemo(()=>sortSales(searchSales(data,filterSalesSegment(allSales,segment),searchQuery),sortMode,nowIso),[data.customers,data.vehicles,allSales,segment,searchQuery,sortMode,nowIso])
  const changeSearch=(value:string)=>{
    if(value.trim()&&!searchQuery.trim())setSegment('ALL')
    if(!value.trim()&&searchQuery.trim())setSegment('ACTIVE')
    setSearchQuery(value)
  }
  const resetSearch=()=>{setSearchQuery('');setSegment('ACTIVE')}
  useEffect(()=>{if(!focusContractId&&!focusVehicleId&&!focusCustomerId)return;setFocusedVehicleId(focusVehicleId||null);setFocusedCustomerId(focusCustomerId||null);const exact=focusContractId?data.contracts.find(c=>c.id===focusContractId&&c.template_code==='VENDITA'):undefined;if(exact){setSearchQuery('');setSegment(salesSegment(exact));setSale360Id(exact.id);setCreating(false);onFocusConsumed?.();return}const existing=allSales.find(c=>(!focusVehicleId||c.vehicle_id===focusVehicleId)&&(!focusCustomerId||c.customer_id===focusCustomerId)&&salesSegment(c)==='ACTIVE');if(existing){setSearchQuery('');setSegment('ACTIVE');setSale360Id(existing.id);setCreating(false)}else if(writable){setSearchQuery('');setSegment('ACTIVE');const interestVehicleId=!focusVehicleId&&focusCustomerId?data.customerInterests.find(i=>i.customer_id===focusCustomerId&&String(i.status||'').toUpperCase()!=='PERSA')?.vehicle_id:undefined;const targetVehicleId=focusVehicleId||interestVehicleId||'';const vehicle=targetVehicleId?data.vehicles.find(v=>v.id===targetVehicleId):undefined;setCreating(true);setDraft(current=>({...current,vehicleId:targetVehicleId,customerId:focusCustomerId||current.customerId,price:vehicle?.asking_price??''}))}else setCreating(false);onFocusConsumed?.()},[focusContractId,focusVehicleId,focusCustomerId,focusKey,allSales,writable])
  const selectedReservation=vehicleReservation(data.contracts,draft.vehicleId)
  const selectVehicle=(vehicleId:string)=>{const vehicle=data.vehicles.find(v=>v.id===vehicleId);setDraft(current=>({...current,vehicleId,price:vehicle?.asking_price??current.price}))}
  const persist=async()=>{setBusy(true);setError('');try{await createSaleContract(draft);setSearchQuery('');setSegment('ACTIVE');setCreating(false);setDraft({customerId:'',vehicleId:'',price:'',deposit:'',plannedDeliveryAt:'',notes:''});await onRefresh()}catch(err){setError(friendlySaleError(err))}finally{setBusy(false)}}
  const move=async(contract:Contract,stage:string)=>{setBusy(true);setError('');try{await updateSaleStage(contract,stage);await onRefresh()}catch(err){setError(friendlySaleError(err))}finally{setBusy(false)}}
  const deliver=async(contract:Contract)=>{setBusy(true);setError('');try{await updateSaleStage(contract,'DELIVERED');await onRefresh();setSale360Id(null)}catch(err){const message=friendlySaleError(err);setError(message);throw new Error(message)}finally{setBusy(false)}}
  const extendReservation=async(contract:Contract,iso:string,reason:string)=>{setBusy(true);setError('');try{await extendSaleReservation(contract,iso,reason);await onRefresh()}catch(err){const message=friendlySaleError(err);setError(message);throw new Error(message)}finally{setBusy(false)}}
  const cancelSale=async(contract:Contract,reason:string)=>{setBusy(true);setError('');try{await cancelSaleContract(contract,reason);await onRefresh();setSale360Id(null);setSegment('CANCELLED')}catch(err){const message=friendlySaleError(err);setError(message);throw new Error(message)}finally{setBusy(false)}}
  const recordReservationContact=async(contract:Contract,channel:string,title:string)=>{
    const customer=data.customers.find(c=>c.id===contract.customer_id)
    if(!customer||customer.dealer_id!==session.dealer.id)throw new Error('Cliente non disponibile nella concessionaria')
    setBusy(true);setError('')
    try{
      await logCustomerInteraction(customer,{channel,title})
      await onRefresh()
    }catch(err){const message=err instanceof Error?err.message:'Impossibile registrare il ricontatto';setError(message);throw new Error(message)}
    finally{setBusy(false)}
  }
  const planReservationCallback=async(contract:Contract,nextStep:string,iso:string)=>{
    const customer=data.customers.find(c=>c.id===contract.customer_id)
    if(!customer||customer.dealer_id!==session.dealer.id)throw new Error('Cliente non disponibile nella concessionaria')
    setBusy(true);setError('')
    try{
      await saveCustomerNextAction(customer,{nextStep,nextContactAt:iso})
      await onRefresh()
    }catch(err){const message=err instanceof Error?err.message:'Impossibile pianificare il richiamo';setError(message);throw new Error(message)}
    finally{setBusy(false)}
  }
  const completeReservationCallback=async(contract:Contract,window:ReservationFollowupWindow,note:string)=>{
    const customer=data.customers.find(c=>c.id===contract.customer_id)
    if(!customer||customer.dealer_id!==session.dealer.id)throw new Error('Cliente non disponibile nella concessionaria')
    setBusy(true);setError('')
    let logged=false
    try{
      const existing=latestReservationCompletion(contract,data.customerInteractions.filter(x=>x.dealer_id===session.dealer.id),window)
      if(!existing){
        await logCustomerInteraction(customer,{channel:'NOTE',title:reservationCompletionTitle(contract,window,note)})
        logged=true
      }
      if(customer.next_step===reservationNextStep(contract)){
        await clearMatchingReservationCallback(customer,reservationNextStep(contract))
      }
      await onRefresh()
    }catch(err){
      if(logged)await onRefresh().catch(()=>undefined)
      const message=err instanceof Error?err.message:'Impossibile completare il richiamo'
      setError(message);throw new Error(message)
    }finally{setBusy(false)}
  }
  const ensureChecklist=async(contract:Contract)=>{setBusy(true);setError('');try{const existing=new Set(data.workItems.filter(w=>w.vehicle_id===contract.vehicle_id&&w.category==='CONSEGNA').map(w=>String(w.title||'').trim()));for(const title of DELIVERY_ITEMS){if(!existing.has(title))await saveWorkItem(contract.vehicle_id,{title,category:'CONSEGNA',priority:'HIGH',note:'Checklist consegna vendita'});}await onRefresh()}catch(err){setError(err instanceof Error?err.message:'Errore checklist consegna')}finally{setBusy(false)}}

  return <>
    <div className="page-heading"><div><p className="eyebrow">VENDITA E CONSEGNA</p><h1>Vendite</h1><p>Dalla trattativa alla consegna, con i blocchi reali che evitano errori.</p></div>{writable&&<button className="primary-action" data-testid="new-sale" onClick={()=>{setSearchQuery('');setSegment('ACTIVE');setCreating(true)}}><Plus/> Nuova vendita</button>}</div>
    {error&&<div className="form-error customer-global-error">{error}</div>}

    {alerts.length>0&&<button type="button" className="reservation-alert-banner" data-testid="sales-reservation-alert" onClick={()=>{setSegment('ACTIVE');setSale360Id(alerts[0].id)}}>🔔 {alerts.length} prenotazion{alerts.length===1?'e':'i'} da verificare · Apri la più urgente</button>}
    <SalesReservationOverview data={data} nowIso={nowIso} onOpenSale={contractId=>{
      setSegment('ACTIVE')
      setCreating(false)
      setSale360Id(contractId)
    }}/>
    <section className="sales-search-panel" data-testid="sales-search-panel" aria-label="Ricerca rapida vendite">
      <label className="sales-search-field" htmlFor="sales-quick-search">
        <Search size={19} aria-hidden="true"/>
        <input id="sales-quick-search" type="search" data-testid="sales-quick-search" autoComplete="off"
          placeholder="Cerca cliente, targa o numero contratto…" value={searchQuery}
          onChange={e=>changeSearch(e.target.value)} aria-label="Cerca vendite per cliente, targa o contratto"
          onKeyDown={e=>{if(e.key==='Escape')resetSearch()}}/>
        {searchQuery&&<button type="button" className="sales-search-clear" data-testid="sales-search-clear"
          aria-label="Cancella ricerca vendite" onClick={resetSearch}><X size={16}/></button>}
      </label>
      <div className="sales-search-meta">
        <span data-testid="sales-search-count">{searchQuery.trim()?sales.length+' risultati per "'+searchQuery.trim()+'"':segment==='ALL'?'Tutte le vendite':segment==='DELIVERED'?'Vendite consegnate':segment==='CANCELLED'?'Vendite annullate':'Vendite attive'}</span>
        <small>La ricerca include anche consegnate e annullate. Seleziona un filtro per restringere.</small>
      </div>
    </section>
    <div className="sales-segments" role="tablist" aria-label="Filtra vendite"><button role="tab" aria-selected={segment==='ALL'} className={segment==='ALL'?'active':''} data-testid="sales-tab-all" onClick={()=>setSegment('ALL')}><span>Tutte</span><b>{allSales.length}</b></button><button role="tab" aria-selected={segment==='ACTIVE'} className={segment==='ACTIVE'?'active':''} data-testid="sales-tab-active" onClick={()=>setSegment('ACTIVE')}><span>Attive</span><b>{counts.ACTIVE}</b></button><button role="tab" aria-selected={segment==='DELIVERED'} className={segment==='DELIVERED'?'active':''} data-testid="sales-tab-delivered" onClick={()=>setSegment('DELIVERED')}><span>Consegnate</span><b>{counts.DELIVERED}</b></button><button role="tab" aria-selected={segment==='CANCELLED'} className={segment==='CANCELLED'?'active':''} data-testid="sales-tab-cancelled" onClick={()=>setSegment('CANCELLED')}><span>Annullate</span><b>{counts.CANCELLED}</b></button></div>

    <section className="sales-sort-panel" data-testid="sales-sort-panel" aria-label="Ordina elenco vendite">
      <div className="sales-sort-heading"><ArrowUpDown size={16}/><span>Ordina per</span></div>
      <div className="sales-sort-options" role="group" aria-label="Criterio di ordinamento">
        {([['PRIORITY','Priorità'],['RESERVATION','Scadenza prenotazione'],['DELIVERY','Data consegna'],['RECENT','Più recenti']] as const).map(([mode,label])=>
          <button type="button" key={mode} data-testid={'sales-sort-'+mode.toLowerCase()}
           className={sortMode===mode?'selected':''} aria-pressed={sortMode===mode}
           onClick={()=>setSortMode(mode)}>{label}</button>)}
      </div>
      <small data-testid="sales-sort-hint">{sortMode==='PRIORITY'?'Prima prenotazioni scadute e consegne urgenti.':sortMode==='RESERVATION'?'Prima le prenotazioni con scadenza più vicina.':sortMode==='DELIVERY'?'Prima le date di consegna più vicine.':'Prima le vendite più recenti.'}</small>
    </section>
    {creating&&<section className="sale-create" data-testid="sale-create"><div className="customer-section-head"><div><p className="eyebrow">NUOVA VENDITA</p><h2>Apri pratica vendita</h2></div><button className="icon-ghost" aria-label="Chiudi vendita" onClick={()=>setCreating(false)}><X/></button></div><div className="sale-form-grid"><label><span>CLIENTE</span><select aria-label="CLIENTE VENDITA" disabled={busy} value={draft.customerId} onChange={e=>setDraft({...draft,customerId:e.target.value})}><option value="">Seleziona cliente…</option>{data.customers.filter(c=>!c.deleted_at).map(c=><option key={c.id} value={c.id}>{personName(c)}</option>)}</select></label><label><span>AUTO</span><select aria-label="AUTO VENDITA" disabled={busy} value={draft.vehicleId} onChange={e=>selectVehicle(e.target.value)}><option value="">Seleziona auto…</option>{data.vehicles.filter(v=>!v.deleted_at).map(v=><option key={v.id} value={v.id} disabled={Boolean(vehicleReservation(data.contracts,v.id))||['CONSEGNATA','VENDUTA','DA_CONSEGNARE'].includes(v.status||'')}>{vehicleName(v)}{v.plate?` · ${v.plate}`:''}{vehicleReservation(data.contracts,v.id)?` · PRENOTATA da ${reservationLabel(data,vehicleReservation(data.contracts,v.id)!)} `:''}</option>)}</select></label><label><span>PREZZO VENDITA €</span><input aria-label="PREZZO VENDITA" inputMode="decimal" disabled={busy} value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label><label><span>CAPARRA €</span><input aria-label="CAPARRA VENDITA" inputMode="decimal" disabled={busy} value={draft.deposit??''} onChange={e=>setDraft({...draft,deposit:e.target.value})}/></label><label><span>CONSEGNA PREVISTA</span><input aria-label="CONSEGNA PREVISTA" type="datetime-local" disabled={busy} value={draft.plannedDeliveryAt||''} onChange={e=>setDraft({...draft,plannedDeliveryAt:e.target.value})}/></label><label className="wide"><span>NOTE</span><input aria-label="NOTE VENDITA" disabled={busy} value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Permuta, finanziamento, richieste cliente…"/></label></div>{selectedReservation&&<p className="form-error" role="alert" data-testid="vehicle-booking-warning">Auto già prenotata per {reservationLabel(data,selectedReservation)} · vendita {selectedReservation.contract_number}. Scegli un'altra auto.</p>}<div className="workbench-actions"><button data-testid="sale-save" disabled={busy||Boolean(selectedReservation)||!draft.customerId||!draft.vehicleId||!draft.price} onClick={()=>void persist()}><ShoppingBag/> {busy?'Salvataggio…':'Apri vendita'}</button><button className="ghost" onClick={()=>setCreating(false)}><X/> Annulla</button></div></section>}

    <div className="sales-list sales-list-compact" data-testid="sales-compact-list">{sales.map(contract=>{
      const customer=data.customers.find(c=>c.id===contract.customer_id&&c.dealer_id===contract.dealer_id&&!c.deleted_at)
      const vehicle=data.vehicles.find(v=>v.id===contract.vehicle_id&&v.dealer_id===contract.dealer_id&&!v.deleted_at)
      const deliveryItems=data.workItems.filter(w=>w.vehicle_id===contract.vehicle_id&&w.dealer_id===contract.dealer_id&&w.category==='CONSEGNA')
      const done=new Set(deliveryItems.filter(w=>w.status==='DONE').map(w=>String(w.title||'').trim()))
      const checklistDone=DELIVERY_ITEMS.filter(item=>done.has(item)).length
      return <SalesCompactCard key={contract.id} contract={contract} customer={customer} vehicle={vehicle}
        checklistDone={checklistDone} checklistTotal={DELIVERY_ITEMS.length}
        focused={focusedVehicleId===contract.vehicle_id||focusedCustomerId===contract.customer_id}
        writable={writable} checklistWritable={checklistWritable} busy={busy} nowIso={nowIso}
        sortPriority={sortMode==='PRIORITY'?salesPriority(contract,nowIso):null}
        onOpen={()=>setSale360Id(contract.id)}
        onChecklist={()=>void ensureChecklist(contract)}
        onAdvance={stage=>void move(contract,stage)}
        onDelivery={()=>setSale360Id(contract.id)}/>
    })}{!sales.length&&!creating&&<div className="empty-state" data-testid="sales-search-empty">{searchQuery.trim()?'Nessuna vendita trovata. Prova con un altro nome, targa o numero contratto.':segment==='ACTIVE'?'Nessuna vendita attiva. Crea una pratica quando un cliente conferma l’auto.':segment==='DELIVERED'?'Nessuna vendita consegnata.':segment==='CANCELLED'?'Nessuna vendita annullata.':'Nessuna vendita registrata.'}</div>}</div>
    {sale360Id&&data.contracts.find(c=>c.id===sale360Id)&&<Sale360Drawer contract={data.contracts.find(c=>c.id===sale360Id)!} data={data} session={session} onClose={()=>setSale360Id(null)} onOpenCustomer={onOpenCustomer} onOpenVehicle={onOpenVehicle} onOpenDeliveryAppointment={onOpenDeliveryAppointment} onOpenInvoices={onOpenInvoices} onOpenDeadlines={onOpenDeadlines} onPrepareChecklist={()=>void ensureChecklist(data.contracts.find(c=>c.id===sale360Id)!)} onDeliver={()=>deliver(data.contracts.find(c=>c.id===sale360Id)!)} onCancel={(reason)=>cancelSale(data.contracts.find(c=>c.id===sale360Id)!,reason)} onExtendReservation={(iso,reason)=>extendReservation(data.contracts.find(c=>c.id===sale360Id)!,iso,reason)} onRecordReservationContact={(channel,title)=>recordReservationContact(data.contracts.find(c=>c.id===sale360Id)!,channel,title)} onScheduleReservationCallback={(nextStep,iso)=>planReservationCallback(data.contracts.find(c=>c.id===sale360Id)!,nextStep,iso)} onCompleteReservationCallback={(window,note)=>completeReservationCallback(data.contracts.find(c=>c.id===sale360Id)!,window,note)} deliveryBusy={busy} />}
  </>
}
