import {useMemo,useState} from 'react'
import {AlertCircle,AlertTriangle,ArrowUpRight,CalendarClock,Camera,CarFront,ChevronRight,ClockAlert,LockKeyhole,Plus,Search} from 'lucide-react'
import {integer,money,vehicleName} from '../lib/format'
import {vehicleAgeDays} from '../domain/priorities'
import {vehicleCompleteness} from '../domain/garage'
import {reservationLabel,vehicleReservation} from '../domain/saleReservation'
import {garageReservationCounts,garageReservationDueLabel,garageReservationFilterMatch,type GarageReservationFilter} from '../domain/garageReservations'
import {reservationAlert} from '../domain/reservationDeadlines'
import {PrivateImage} from '../components/PrivateImage'
import type {SessionPayload,TenantData} from '../types'
import {vehicleAvailabilityAlert} from '../domain/vehicleAvailabilityAlerts'
import {vehicleAvailabilityReviewGuide} from '../domain/vehicleAvailabilityReviewGuide'
import {compareGarageReviewPriority,garageReviewPriority} from '../domain/garageReviewPriority'
import {useSalesOperationsSync} from '../lib/useSalesOperationsSync'
import {AvailabilityAlert} from '../components/AvailabilityAlert'
import '../garage.css'

const BOOKING_TABS=[
 {key:'ALL',label:'Tutte',Icon:CarFront},
 {key:'BOOKED',label:'Prenotate',Icon:LockKeyhole},
 {key:'DUE',label:'In scadenza',Icon:CalendarClock},
 {key:'OVERDUE',label:'Scadute',Icon:ClockAlert}
] as const

const dateLabel=(iso?:string|null)=>{
 if(!iso)return 'Da definire'
 const d=new Date(iso)
 return Number.isNaN(d.getTime())?'Da definire':new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric'}).format(d)
}

export function GaragePage({data,session,onRefresh,onVehicle,onCreate,onOpenSale,writable}:{data:TenantData;session:SessionPayload;onRefresh:()=>Promise<void>;onVehicle:(id:string)=>void;onCreate:()=>void;onOpenSale:(id:string)=>void;writable:boolean}){
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('ALL')
 const [reservationFilter,setReservationFilter]=useState<GarageReservationFilter>('ALL')
 const [reviewOnly,setReviewOnly]=useState(false)
 const garageSync=useSalesOperationsSync(data,session,false,onRefresh)
 const nowIso=new Date().toISOString()
 const activeVehicles=data.vehicles.filter(v=>!v.deleted_at)
 const mediaByVehicle=useMemo(()=>{
  const m=new Map<string,TenantData['media']>()
  for(const x of data.media){const arr=m.get(x.vehicle_id)||[];arr.push(x);m.set(x.vehicle_id,arr)}
  return m
 },[data.media])
 const reservationByVehicle=useMemo(()=>{
  const result=new Map<string,ReturnType<typeof vehicleReservation>>()
  for(const c of data.contracts){
   if(!result.has(c.vehicle_id)){
    const reserve=vehicleReservation(data.contracts,c.vehicle_id)
    if(reserve)result.set(c.vehicle_id,reserve)
   }
  }
  return result
 },[data.contracts])
 const counts=garageReservationCounts(activeVehicles,data.contracts,nowIso)
 // Reuse Mod47 operational alerts; only this dealer's visible, non-deleted vehicles qualify.
 const reviewVehicleIds=new Set(activeVehicles
  .filter(v=>v.dealer_id===session.dealer.id&&vehicleAvailabilityAlert(v,data.contracts,session.dealer.id)?.kind==='UNAVAILABLE')
  .map(v=>v.id))
 const statuses=[...new Set(activeVehicles.map(v=>v.status).filter(Boolean))] as string[]
 const normalized=query.trim().toLocaleLowerCase('it')
 const rows=activeVehicles
  .filter(v=>status==='ALL'||v.status===status)
  .filter(v=>garageReservationFilterMatch(v,data.contracts,reservationFilter,nowIso))
  .filter(v=>!reviewOnly||reviewVehicleIds.has(v.id))
  .filter(v=>{
   const reserve=reservationByVehicle.get(v.id)
   const label=reserve?reservationLabel(data,reserve):''
   return `${vehicleName(v)} ${v.plate||''} ${v.vin||''} ${label} ${reserve?.contract_number||''}`.toLocaleLowerCase('it').includes(normalized)
  })
  .sort((a,b)=>{
   if(reviewOnly)return compareGarageReviewPriority(a,b)
   if(reservationFilter==='ALL')return 0
   const aDue=reservationByVehicle.get(a.id)?.reservation_expires_at||'9999'
   const bDue=reservationByVehicle.get(b.id)?.reservation_expires_at||'9999'
   return aDue.localeCompare(bDue)
  })

 return <>
  <div className="page-heading garage-heading">
   <div><p className="eyebrow">INVENTARIO OPERATIVO</p><h1>Garage</h1><p>Auto, prenotazioni e scadenze in un solo colpo d’occhio.</p></div>
   <div className="garage-heading-actions">
    <div className="mini-stat"><span>AUTO</span><b>{activeVehicles.length}</b></div>
    {writable&&<button data-testid="new-vehicle" className="primary garage-new" onClick={onCreate}><Plus/>Nuova auto</button>}
   </div>
  </div>
  <div className={'garage-availability-sync '+garageSync.status} data-testid="garage-availability-sync" role="status" aria-live="polite">
   <span>{garageSync.status==='updated'?'Disponibilità aggiornata da un altro operatore':garageSync.status==='offline'?'Sincronizzazione non disponibile · verifica prima di proporre':garageSync.status==='checking'?'Controllo disponibilità auto…':'Disponibilità sincronizzata'}</span>
   <button type="button" data-testid="garage-availability-refresh" onClick={()=>void garageSync.refresh()}>Aggiorna ora</button>
  </div>
  <div className="garage-reservation-filters" role="group" aria-label="Filtra auto Garage" data-testid="garage-reservation-filters">
   {BOOKING_TABS.map(({key,label,Icon})=>
    <button type="button" key={key} data-testid={`garage-filter-${key.toLowerCase()}`}
     className={'garage-reservation-filter'+(!reviewOnly&&reservationFilter===key?' active':'')+(key==='OVERDUE'&&counts.OVERDUE?' warning':'')}
     aria-pressed={!reviewOnly&&reservationFilter===key}
     onClick={()=>{setReviewOnly(false);setReservationFilter(key)}}>
     <Icon size={18}/><span>{label}</span><b>{counts[key]}</b>
    </button>
   )}
   <button type="button" data-testid="garage-filter-review"
    className={'garage-reservation-filter garage-review-filter'+(reviewOnly?' active':'')+(reviewVehicleIds.size?' review-warning':'')}
    aria-pressed={reviewOnly} aria-label={`Disponibilità da verificare: ${reviewVehicleIds.size} auto`}
    onClick={()=>{setReservationFilter('ALL');setReviewOnly(previous=>!previous)}}>
    <AlertTriangle size={18}/><span>Da verificare</span><b>{reviewVehicleIds.size}</b>
   </button>
  </div>
  <div className="toolbar">
   <label className="search-input"><Search/><input id="global-search" aria-label="Cerca nel Garage" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Targa, modello, cliente o vendita…"/></label>
   <select aria-label="Filtra per stato auto" value={status} onChange={e=>setStatus(e.target.value)}>
    <option value="ALL">Tutti gli stati</option>{statuses.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}
   </select>
  </div>
  <div className="vehicle-grid garage-photo-grid">
   {rows.map(v=>{
    const media=(mediaByVehicle.get(v.id)||[]).filter(x=>(x.kind||'PHOTO')==='PHOTO')
    const cover=media.find(x=>x.is_cover)||media[0]
    const age=vehicleAgeDays(v),completeness=vehicleCompleteness(v,media.length)
    const issues=[...completeness.missing.slice(0,2),age>=60&&v.status==='IN_VENDITA'?`${age} gg in stock`:null].filter(Boolean)
    const reserve=reservationByVehicle.get(v.id)
    const alert=reserve?reservationAlert(reserve,nowIso):'NONE'
    const availability=vehicleAvailabilityAlert(v,data.contracts,session.dealer.id)
    const guidance=availability?.kind==='UNAVAILABLE'?vehicleAvailabilityReviewGuide(v,data.contracts,session.dealer.id):null
    const reviewPriority=guidance?garageReviewPriority(v):null
    const recentlyChanged=garageSync.recentlyChangedVehicleIds.has(v.id)
    return <article key={v.id} data-recent-remote={recentlyChanged?'true':undefined} className={'vehicle-card-v2 garage-photo-card'+(recentlyChanged?' remote-status-recent':'')+(availability?' alert-'+availability.kind.toLowerCase():'')+(alert==='OVERDUE'?' garage-reservation-overdue':'')+(alert==='SOON'?' garage-reservation-soon':'')}>
     <button data-testid={`vehicle-card-${v.id}`} className="garage-card-open" onClick={()=>onVehicle(v.id)} aria-label={`Apri auto ${vehicleName(v)}`}>
      <div className="garage-card-media">
       <PrivateImage objectKey={cover?.object_key||v.cover_object_key} alt={vehicleName(v)} className="garage-card-photo"/>
       <span className="status-pill media-status">{(v.status||'—').replaceAll('_',' ')}</span>
       {recentlyChanged&&<span className="remote-status-recent-chip" data-testid="garage-recent-change" role="status">STATO AGGIORNATO ORA</span>}
       <span className={`completeness-badge ${completeness.percent===100?'complete':''}`}>{completeness.percent}%</span>
      </div>
      <div className="garage-card-copy">
       <div><h3>{vehicleName(v)}</h3><p>{v.plate||'Targa —'} · {v.year||'—'} · {integer(v.mileage)} km</p></div>
       {issues.length>0&&<span className="issue-pill"><AlertCircle/> {issues.join(' · ')}</span>}
      </div>
      <AvailabilityAlert alert={availability} testId="garage-availability-alert"/>
      {reserve&&<div className="vehicle-reservation-owner" data-testid="garage-reservation-owner"><LockKeyhole size={14}/> <span>Prenotata · {reservationLabel(data,reserve)} · {reserve.contract_number}</span></div>}
      <div className="vehicle-card-bottom">
       <div><span>PREZZO</span><b>{v.asking_price?money(v.asking_price):'Da impostare'}</b></div>
       <div><span><Camera size={14}/> FOTO</span><b>{media.length}</b></div>
       <ChevronRight/>
      </div>
     </button>
     {guidance&&<div className="garage-review-guidance" data-testid={`garage-review-guide-${v.id}`}>
      <strong className="garage-review-priority" data-testid={`garage-review-priority-${v.id}`} data-review-priority={reviewPriority?.kind}>{reviewPriority?.label}</strong>
      <p>{guidance.reason}</p>
      <small>{guidance.instruction}</small>
      <button type="button" data-testid={`garage-review-open-${v.id}`}
       onClick={()=>guidance.contractId?onOpenSale(guidance.contractId):onVehicle(v.id)}>
       {guidance.actionLabel}<ArrowUpRight size={15} aria-hidden="true"/>
      </button>
     </div>}
     {reserve&&<div className="garage-booking-actions">
      <div className={'garage-booking-due '+alert.toLowerCase()} data-testid="garage-booking-due">
       <CalendarClock size={15}/>
       <span><b>{garageReservationDueLabel(reserve,nowIso)}</b><small>{dateLabel(reserve.reservation_expires_at)}</small></span>
      </div>
      <button type="button" data-testid={`garage-open-sale-${v.id}`} onClick={()=>onOpenSale(reserve.id)} aria-label={`Apri vendita ${reserve.contract_number}`}>
       Apri vendita <ArrowUpRight size={16}/>
      </button>
     </div>}
    </article>
   })}
  </div>
  {!rows.length&&<div className="empty-state" data-testid="garage-filter-empty">{reviewOnly?'Nessuna auto da verificare corrisponde ai filtri.':'Nessuna auto corrisponde ai filtri.'} <button type="button" className="garage-clear-filters" onClick={()=>{setReviewOnly(false);setReservationFilter('ALL');setStatus('ALL');setQuery('')}}>Mostra tutte le auto</button></div>}
 </>}
