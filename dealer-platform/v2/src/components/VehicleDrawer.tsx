import {FormEvent,useState} from 'react'
import {CalendarClock,Camera,CheckCircle2,CircleDollarSign,FileText,Image as ImageIcon,Pencil,Plus,ShoppingBag,Star,Trash2,UserRound,Wrench,X} from 'lucide-react'
import {integer,money,vehicleName} from '../lib/format'
import {canSeeFinance,canWriteCustomers,canWriteGarage,completeWorkItem,deleteVehiclePhoto,saveWorkItem,setVehicleCover,uploadVehiclePhotos} from '../lib/api'
import {PHOTO_TARGET,vehicleCompleteness} from '../domain/garage'
import {buildVehicle360} from '../domain/vehicle360'
import {saveCustomerInterest} from '../lib/customerApi'
import {PrivateImage} from './PrivateImage'
import type {SessionPayload,TenantData,Vehicle} from '../types'

const localDay=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const person=(data:TenantData,id?:string|null)=>{const c=id?data.customers.find(x=>x.id===id):undefined;return c?[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente':'Cliente'}
const stageLabel=(value?:string|null)=>({OPEN:'Aperta',AGREED:'Accordo',DEPOSIT:'Caparra',BALANCE_PENDING:'Saldo da chiudere',READY:'Pronta consegna',DELIVERED:'Consegnata',CANCELLED:'Annullata'}[String(value||'')]||String(value||'Non aperta').replaceAll('_',' '))
const dateTime=(value?:string|null)=>{if(!value)return 'Da definire';const d=new Date(value);return Number.isNaN(d.getTime())?'Da definire':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}

export function VehicleDrawer({vehicle,data,session,onClose,onEdit,onRefresh,onOpenCustomer,onOpenCalendar,onQuickAppointment,onOpenDeadlines,onOpenSales,onOpenInvoices}:{vehicle:Vehicle;data:TenantData;session:SessionPayload;onClose:()=>void;onEdit:()=>void;onRefresh:()=>Promise<void>;onOpenCustomer:(id:string)=>void;onOpenCalendar:()=>void;onQuickAppointment:()=>void;onOpenDeadlines:()=>void;onOpenSales:()=>void;onOpenInvoices:(invoiceId?:string)=>void}){
  const media=data.media.filter(x=>x.vehicle_id===vehicle.id&&(x.kind||'PHOTO')==='PHOTO').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const works=data.workItems.filter(x=>x.vehicle_id===vehicle.id&&!['DONE','CANCELLED'].includes(x.status||''))
  const financial=data.financials.find(x=>x.vehicle_id===vehicle.id)
  const cover=media.find(x=>x.is_cover)||media[0]
  const writable=canWriteGarage(session)
  const customerWritable=canWriteCustomers(session)
  const financeVisible=canSeeFinance(session)
  const completeness=vehicleCompleteness(vehicle,media.length)
  const summary=buildVehicle360(data,vehicle.id,localDay())
  const linkedCustomerIds=new Set(data.customerInterests.filter(i=>i.vehicle_id===vehicle.id).map(i=>i.customer_id))
  const linkableCustomers=data.customers.filter(c=>!c.deleted_at&&!linkedCustomerIds.has(c.id))
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [workOpen,setWorkOpen]=useState(false)
  const [quickAction,setQuickAction]=useState<'customer'|'practice'|null>(null)
  const [linkCustomerId,setLinkCustomerId]=useState('')
  const [linkNote,setLinkNote]=useState('')
  const [practiceTitle,setPracticeTitle]=useState('')
  const [practiceDue,setPracticeDue]=useState('')
  const [practiceNote,setPracticeNote]=useState('')

  async function run(task:()=>Promise<unknown>){setBusy(true);setError('');try{await task();await onRefresh()}catch(err){setError(err instanceof Error?err.message:'Operazione non riuscita')}finally{setBusy(false)}}
  async function photos(files:FileList|null){if(!files?.length)return;await run(()=>uploadVehiclePhotos(vehicle,[...files],media))}
  async function removePhoto(id:string){const item=media.find(x=>x.id===id);if(!item||!window.confirm('Rimuovere questa foto dalla scheda auto?'))return;await run(()=>deleteVehiclePhoto(vehicle,item,media))}
  async function coverPhoto(id:string){const item=media.find(x=>x.id===id);if(!item)return;await run(()=>setVehicleCover(vehicle,item))}
  async function complete(id:string){const item=works.find(x=>x.id===id);if(!item)return;await run(()=>completeWorkItem(item))}
  async function addWork(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);await run(()=>saveWorkItem(vehicle.id,{title:String(fd.get('title')||''),category:String(fd.get('category')||'PREPARAZIONE'),priority:String(fd.get('priority')||'NORMAL'),due_date:String(fd.get('due_date')||'')||null,note:String(fd.get('note')||'')||null}));setWorkOpen(false)}
  async function linkCustomer(){const customer=linkableCustomers.find(c=>c.id===linkCustomerId);if(!customer)return;await run(()=>saveCustomerInterest(customer,{vehicleId:vehicle.id,status:'INTERESSATO',note:linkNote||null}));setLinkCustomerId('');setLinkNote('');setQuickAction(null)}
  async function addPractice(){if(!practiceTitle.trim())return;await run(()=>saveWorkItem(vehicle.id,{title:practiceTitle.trim(),category:'DOCUMENTI',priority:'HIGH',due_date:practiceDue||null,note:practiceNote||null}));setPracticeTitle('');setPracticeDue('');setPracticeNote('');setQuickAction(null)}

  return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="drawer garage-drawer-v2" data-testid="vehicle-360">
    <header><div><p className="eyebrow">SCHEDA AUTO 360°</p><h2>{vehicleName(vehicle)}</h2><span>{vehicle.plate||'Targa mancante'} · {vehicle.year||'Anno —'} · {integer(vehicle.mileage)} km</span></div><div className="drawer-head-actions">{writable&&<button className="icon-btn" onClick={onEdit} aria-label="Modifica auto"><Pencil/></button>}<button className="icon-btn" onClick={onClose} aria-label="Chiudi"><X/></button></div></header>

    {error&&<div className="drawer-error">{error}</div>}
    <div className="drawer-cover garage-cover">{cover?<PrivateImage objectKey={cover.object_key} alt={vehicleName(vehicle)} className="drawer-cover-image"/>:<div><ImageIcon/><b>Nessuna foto</b><span>Da iPhone puoi scattare e caricare direttamente qui.</span></div>}<div className="cover-actions">{writable&&<label className={`photo-upload ${busy?'disabled':''}`}><Camera/> {busy?'Caricamento…':media.length?'Aggiungi foto':'Scatta foto'}<input data-testid="vehicle-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" multiple disabled={busy} onChange={e=>void photos(e.target.files)}/></label>}</div></div>

    <section className="completeness-panel"><div><span>COMPLETEZZA SCHEDA</span><b>{completeness.percent}%</b></div><div className="completion-track"><i style={{width:`${completeness.percent}%`}}/></div>{completeness.missing.length?<p>Manca: {completeness.missing.join(' · ')}</p>:<p className="complete-copy">Scheda pronta per il flusso commerciale.</p>}</section>

    <section className="drawer-grid"><article><span>STATO</span><b>{(vehicle.status||'—').replaceAll('_',' ')}</b></article><article><span>PREZZO CLIENTE</span><b>{vehicle.asking_price?money(vehicle.asking_price):'Da impostare'}</b></article><article><span>FOTO</span><b>{media.length}/{PHOTO_TARGET}</b></article><article><span>LAVORI APERTI</span><b>{works.length}</b></article></section>

    <section className="vehicle360-quick" data-testid="vehicle-quick-actions">
      <div className="vehicle360-quick-head"><div><span>AZIONI RAPIDE</span><b>Fai senza uscire dalla scheda</b></div></div>
      <div className="vehicle360-quick-grid">
        <button data-testid="quick-appointment" onClick={onQuickAppointment}><CalendarClock/><span><b>Appuntamento</b><small>Auto già selezionata</small></span></button>
        {customerWritable&&<button data-testid="quick-link-customer" onClick={()=>setQuickAction(v=>v==='customer'?null:'customer')}><UserRound/><span><b>Collega cliente</b><small>Interesse immediato</small></span></button>}
        {writable&&<button data-testid="quick-practice" onClick={()=>setQuickAction(v=>v==='practice'?null:'practice')}><FileText/><span><b>Nuova pratica</b><small>Documenti / scadenza</small></span></button>}
        <button data-testid="quick-sale" onClick={onOpenSales}><ShoppingBag/><span><b>Vendita</b><small>{summary.sale?'Apri pratica':'Auto precompilata'}</small></span></button>
      </div>
      {quickAction==='customer'&&customerWritable&&<div className="vehicle360-quick-panel" data-testid="quick-customer-panel"><label><span>CLIENTE</span><select aria-label="CLIENTE DA COLLEGARE" value={linkCustomerId} disabled={busy} onChange={e=>setLinkCustomerId(e.target.value)}><option value="">Seleziona cliente…</option>{linkableCustomers.map(c=><option key={c.id} value={c.id}>{[c.first_name,c.last_name].filter(Boolean).join(' ')||'Cliente'}</option>)}</select></label><label><span>NOTA</span><input aria-label="NOTA COLLEGAMENTO" value={linkNote} disabled={busy} onChange={e=>setLinkNote(e.target.value)} placeholder="Es. interessato dopo prova auto"/></label><div className="vehicle360-quick-panel-actions"><button className="primary" disabled={busy||!linkCustomerId} onClick={()=>void linkCustomer()}>Collega cliente</button><button disabled={busy} onClick={()=>setQuickAction(null)}>Annulla</button></div>{!linkableCustomers.length&&<small className="vehicle360-quick-empty">Tutti i clienti sono già collegati a questa auto.</small>}</div>}
      {quickAction==='practice'&&writable&&<div className="vehicle360-quick-panel" data-testid="quick-practice-panel"><label><span>PRATICA</span><input aria-label="TITOLO PRATICA" value={practiceTitle} disabled={busy} onChange={e=>setPracticeTitle(e.target.value)} placeholder="Es. Immatricolazione / passaggio / libretto"/></label><label><span>SCADENZA</span><input aria-label="SCADENZA PRATICA" type="date" value={practiceDue} disabled={busy} onChange={e=>setPracticeDue(e.target.value)}/></label><label className="wide"><span>NOTA</span><input aria-label="NOTA PRATICA" value={practiceNote} disabled={busy} onChange={e=>setPracticeNote(e.target.value)} placeholder="Dettaglio utile"/></label><div className="vehicle360-quick-panel-actions"><button className="primary" disabled={busy||!practiceTitle.trim()} onClick={()=>void addPractice()}>Crea pratica</button><button disabled={busy} onClick={()=>setQuickAction(null)}>Annulla</button></div></div>}
    </section>

    <section className="vehicle360-status">
      <button onClick={()=>summary.interests[0]?.customer&&onOpenCustomer(summary.interests[0].customer.id)} disabled={!summary.interests.length}><span>COMMERCIALE</span><b>{summary.interests.length?summary.interests.length+' interessati':'Nessun interessato'}</b></button>
      <button onClick={onOpenCalendar}><span>AGENDA</span><b>{summary.upcoming.length?summary.upcoming.length+' appuntamenti':'Agenda libera'}</b></button>
      <button onClick={onOpenDeadlines}><span>PRATICHE</span><b>{summary.practices.length?summary.practices.length+' aperte':'Nessuna aperta'}</b></button>
      <button onClick={onOpenSales}><span>VENDITA</span><b>{stageLabel(summary.sale?.sale_stage)}</b></button>
    </section>

    <section className="vehicle360-section">
      <div className="vehicle360-head"><h3><UserRound/> Clienti interessati</h3>{summary.interests.length>0&&<button onClick={()=>summary.interests[0]?.customer&&onOpenCustomer(summary.interests[0].customer.id)}>Apri cliente</button>}</div>
      <div className="vehicle360-list">{summary.interests.slice(0,4).map(row=><button className="vehicle360-row" key={row.interest.id} onClick={()=>row.customer&&onOpenCustomer(row.customer.id)} disabled={!row.customer}><span><b>{row.customer?[row.customer.first_name,row.customer.last_name].filter(Boolean).join(' '):'Cliente non disponibile'}</b><small>{[row.interest.status,row.interest.offer_amount?money(row.interest.offer_amount):null,row.interest.note].filter(Boolean).join(' · ')}</small></span><span>APRI</span></button>)}{!summary.interests.length&&<p className="empty-state">Nessun cliente interessato collegato a questa auto.</p>}</div>
    </section>

    <section className="vehicle360-section">
      <div className="vehicle360-head"><h3><CalendarClock/> Agenda e prossime attività</h3><button onClick={onOpenCalendar}>Calendario</button></div>
      <div className="vehicle360-list">{summary.upcoming.slice(0,4).map(item=><button className="vehicle360-row" key={item.id} onClick={onOpenCalendar}><span><b>{item.title||'Appuntamento'}</b><small>{[dateTime(item.starts_at),person(data,item.customer_id),item.note].filter(Boolean).join(' · ')}</small></span><span>APRI</span></button>)}{!summary.upcoming.length&&<p className="empty-state">Nessun appuntamento futuro collegato.</p>}</div>
    </section>

    <section className="vehicle360-section">
      <div className="vehicle360-head"><h3><FileText/> Pratiche e documenti operativi</h3><button onClick={onOpenDeadlines}>Centro scadenze</button></div>
      <div className="vehicle360-list">{summary.practices.slice(0,5).map(item=><button className="vehicle360-row" key={item.id} onClick={onOpenDeadlines}><span><b>{item.title}</b><small>{[item.due?'Scadenza '+item.due:null,item.detail].filter(Boolean).join(' · ')}</small></span><span>APRI</span></button>)}{!summary.practices.length&&<p className="empty-state">Nessuna pratica operativa aperta per questa auto.</p>}</div>
    </section>

    <section className="vehicle360-section">
      <div className="vehicle360-head"><h3><ShoppingBag/> Vendita e consegna</h3><button onClick={onOpenSales}>{summary.sale?'Apri vendita':'Vai a Vendite'}</button></div>
      {summary.sale?<div className="vehicle360-sale"><div className="vehicle360-sale-top"><div><b>{summary.sale.contract_number}</b><small>{person(data,summary.sale.customer_id)}</small></div><span>{stageLabel(summary.sale.sale_stage)}</span></div><div className="vehicle360-sale-grid"><div><small>PREZZO</small><strong>{money(summary.sale.price)}</strong></div><div><small>CONSEGNA</small><strong>{dateTime(summary.sale.planned_delivery_at)}</strong></div><div><small>CHECKLIST</small><strong>{summary.delivery.done}/{summary.delivery.total||'—'}</strong></div></div></div>:<p className="empty-state">Nessuna pratica vendita aperta per questa auto.</p>}
    </section>

    <section className="drawer-section"><div className="drawer-section-head"><h3><Camera/> Foto veicolo</h3>{writable&&media.length>0&&<label className="text-action"><Plus/> Aggiungi<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" multiple hidden disabled={busy} onChange={e=>void photos(e.target.files)}/></label>}</div>{media.length?<div className="photo-gallery">{media.map(item=><article className={`photo-tile ${item.is_cover?'cover':''}`} key={item.id}><PrivateImage objectKey={item.object_key} alt={item.caption||vehicleName(vehicle)} className="photo-tile-img"/><div className="photo-tile-actions">{item.is_cover?<span><Star/> Copertina</span>:writable?<button onClick={()=>void coverPhoto(item.id)} disabled={busy}><Star/> Copertina</button>:<span/>}{writable&&<button className="danger-icon" onClick={()=>void removePhoto(item.id)} disabled={busy} aria-label="Elimina foto"><Trash2/></button>}</div></article>)}</div>:<p className="empty-state">Nessuna foto caricata.</p>}</section>

    <section className="drawer-section"><div className="drawer-section-head"><h3><Wrench/> Preparazione</h3>{writable&&<button className="text-action" onClick={()=>setWorkOpen(v=>!v)}><Plus/> Lavoro</button>}</div>{workOpen&&<form className="work-form" onSubmit={addWork}><input name="title" required placeholder="es. Tagliando completo"/><div><select name="category" defaultValue="PREPARAZIONE"><option>PREPARAZIONE</option><option>MECCANICA</option><option>CARROZZERIA</option><option>GOMME</option><option>CONSEGNA</option><option>ALTRO</option></select><select name="priority" defaultValue="NORMAL"><option value="LOW">Bassa</option><option value="NORMAL">Normale</option><option value="HIGH">Alta</option></select><input name="due_date" type="date"/></div><textarea name="note" rows={2} placeholder="Nota opzionale"/><button className="primary" disabled={busy}>Aggiungi lavoro</button></form>}{works.length?works.map(w=><div className="line-item work-line" key={w.id}><div><b>{w.title||w.category||'Lavoro'}</b><span>{w.status||'TODO'} {w.due_date?`· ${w.due_date}`:''} {w.priority?`· ${w.priority}`:''}</span></div>{writable&&<button className="complete-work" onClick={()=>void complete(w.id)} disabled={busy}><CheckCircle2/> Fatto</button>}</div>):<p className="empty-state">Nessun lavoro aperto.</p>}</section>

    {financeVisible&&<section className="vehicle360-finance" data-testid="vehicle-360-finance"><div className="vehicle360-head"><h3><CircleDollarSign/> Situazione economica protetta</h3></div><div className="vehicle360-finance-grid"><div><span>ACQUISTO</span><b>{financial?.purchase_price?money(financial.purchase_price):'—'}</b></div><div><span>SPESE</span><b>{money(summary.costs)}</b></div><div><span>MARGINE STIMATO</span><b>{summary.margin===null?'—':money(summary.margin)}</b></div><div><span>SALDO FATTURA</span><b>{summary.invoice?money(summary.invoiceDue):'—'}</b></div></div><div className="vehicle360-finance-actions"><button onClick={()=>onOpenInvoices(summary.invoice?.id)}>{summary.invoice?'Apri fattura':'Fatture e incassi'}</button></div></section>}
  </aside></div>
}
