import {CalendarClock,Car,MessageCircle,ShoppingBag} from 'lucide-react'
import {buildCustomer360} from '../domain/customer360'
import type {Customer,TenantData} from '../types'

const stage=(value?:string|null)=>({OPEN:'Aperta',AGREED:'Accordo',DEPOSIT:'Caparra',BALANCE_PENDING:'Saldo da chiudere',READY:'Pronta consegna',DELIVERED:'Consegnata',CANCELLED:'Annullata'}[String(value||'')]||String(value||'Nessuna').replaceAll('_',' '))
const dateTime=(value?:string|null)=>{if(!value)return 'Da definire';const d=new Date(value);return Number.isNaN(d.getTime())?'Da definire':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
const vehicleName=(v?:TenantData['vehicles'][number])=>v?[v.brand,v.model,v.version].filter(Boolean).join(' ')||'Auto':'Nessuna auto'
const nowIso=()=>new Date().toISOString()

export function Customer360Overview({customer,data,onOpenVehicle,onOpenCalendar,onOpenSales}:{customer:Customer;data:TenantData;onOpenVehicle:(id:string)=>void;onOpenCalendar:(id:string)=>void;onOpenSales:(id:string)=>void}){
 const summary=buildCustomer360(data,customer.id,nowIso())
 const primary=summary.activeInterests[0]
 const saleVehicle=summary.sale?data.vehicles.find(v=>v.id===summary.sale?.vehicle_id):undefined
 const lastContact=summary.lastInteraction?['Ultimo contatto',summary.lastInteraction.title||summary.lastInteraction.channel||'contatto',dateTime(summary.lastInteraction.happened_at||summary.lastInteraction.created_at)].join(' · '):'Nessun contatto registrato'
 return <section className="customer360" data-testid="customer-360">
   <div className="customer360-head"><div><span>CLIENTE 360°</span><b>Tutto quello che conta, subito</b></div><small>{lastContact}</small></div>
   <div className="customer360-grid">
     <article><span>PROSSIMA AZIONE</span><b>{customer.next_step||'Da impostare'}</b><small>{dateTime(customer.next_contact_at)}</small></article>
     <button disabled={!primary?.vehicle} onClick={()=>primary?.vehicle&&onOpenVehicle(primary.vehicle.id)}><Car/><span><small>TRATTATIVA</small><b>{primary?.vehicle?vehicleName(primary.vehicle):'Nessuna attiva'}</b><em>{primary?.interest.status?.replaceAll('_',' ')||'—'}</em></span></button>
     <button onClick={()=>onOpenCalendar(customer.id)}><CalendarClock/><span><small>APPUNTAMENTO</small><b>{summary.nextEvent?.title||'Nessun prossimo'}</b><em>{dateTime(summary.nextEvent?.starts_at)}</em></span></button>
     <button onClick={()=>onOpenSales(customer.id)}><ShoppingBag/><span><small>VENDITA</small><b>{summary.sale?vehicleName(saleVehicle):'Nessuna aperta'}</b><em>{summary.sale?stage(summary.sale.sale_stage):'Apri pratica'}</em></span></button>
   </div>
   <div className="customer360-actions">
     <button disabled={!primary?.vehicle} onClick={()=>primary?.vehicle&&onOpenVehicle(primary.vehicle.id)}><Car/> Apri auto</button>
     <button onClick={()=>onOpenCalendar(customer.id)}><CalendarClock/> Nuovo appuntamento</button>
     <button onClick={()=>onOpenSales(customer.id)}><ShoppingBag/> {summary.sale?'Apri vendita':'Nuova vendita'}</button>
     <span><MessageCircle/> {summary.activeInterests.length} {summary.activeInterests.length===1?'auto attiva':'auto attive'}</span>
   </div>
 </section>
}
