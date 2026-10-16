import {useCallback,useEffect,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {Login} from './components/Login'
import {Shell} from './components/Shell'
import {PasswordChangeGate,RenewalControl} from './components/AccessGate'
import {VehicleDrawer} from './components/VehicleDrawer'
import {VehicleFormModal} from './components/VehicleFormModal'
import {CalendarPage} from './pages/CalendarPage'
import {ClientsPage} from './pages/ClientsPage'
import {GaragePage} from './pages/GaragePage'
import {MorePage} from './pages/MorePage'
import {SalesPage} from './pages/SalesPage'
import {StaffPage} from './pages/StaffPage'
import {TodayPage} from './pages/TodayPage'
import {canWriteCalendar,canWriteCustomers,canWriteGarage,fetchTenantData,getSession,logout} from './lib/api'
import {getAccessStatus} from './lib/renewalApi'
import type {AccessStatus,SessionPayload,TenantData,Vehicle,View} from './types'

const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
const isLocalHarness=()=>['localhost','127.0.0.1'].includes(window.location.hostname)

export default function App(){
  const [session,setSessionState]=useState<SessionPayload|null>(()=>getSession())
  const [currentPassword,setCurrentPassword]=useState<string|undefined>()
  const [access,setAccess]=useState<AccessStatus|null>(null)
  const [accessBusy,setAccessBusy]=useState(Boolean(session))
  const [view,setView]=useState<View>('today')
  const [data,setData]=useState<TenantData>(empty)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [vehicleId,setVehicleId]=useState<string|null>(null)
  const [newVehicleOpen,setNewVehicleOpen]=useState(false)
  const [editingId,setEditingId]=useState<string|null>(null)

  const leave=useCallback(()=>{logout();setSessionState(null);setAccess(null);setAccessBusy(false);setCurrentPassword(undefined);setData(empty);setVehicleId(null)},[])
  const checkAccess=useCallback(async()=>{
    if(!session){setAccess(null);setAccessBusy(false);return}
    setAccessBusy(true);setError('')
    try{setAccess(await getAccessStatus(session))}
    catch(err){
      const message=err instanceof Error?err.message:''
      if(isLocalHarness()&&/http_404|not_found/i.test(message)){
        setAccess({ok:true,dealer:{...session.dealer,access_expires_at:new Date(Date.now()+30*86400000).toISOString()},profile:session.profile,expired:false,force_password_change:!!session.profile.force_password_change,days_remaining:30,renewal_available:false,active:!session.profile.force_password_change})
      }else if(/Sessione scaduta|unauthorized|session_revoked/i.test(message))leave()
      else setError(message||'Impossibile verificare lo stato accesso')
    }
    finally{setAccessBusy(false)}
  },[session,leave])

  const load=useCallback(async()=>{
    if(!session||!access?.active)return
    setBusy(true);setError('')
    try{setData(await fetchTenantData(session))}
    catch(err){setError(err instanceof Error?err.message:'Errore caricamento dati')}
    finally{setBusy(false)}
  },[session,access?.active])

  useEffect(()=>{void checkAccess()},[checkAccess])
  useEffect(()=>{if(access?.active)void load();else setData(empty)},[load,access?.active])
  useEffect(()=>{document.title=session?`${session.dealer.display_name||session.dealer.name||'Concessionaria'} · Dealer Cockpit`:'Dealer Cockpit'},[session])
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('global-search')?.focus()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])

  if(!session)return <Login onLogin={(next,password)=>{setSessionState(next);setCurrentPassword(password);setAccess(null);setAccessBusy(true)}}/>
  if(accessBusy&&!access)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Verifica accesso…</h1></section></main>
  if(!access)return <main className="access-page"><section className="access-card"><h1>Accesso non verificato</h1><p className="access-copy">{error||'Riprova la verifica.'}</p><button className="primary" onClick={()=>void checkAccess()}>Riprova</button><button className="access-secondary" onClick={leave}>Esci</button></section></main>
  if(access.expired)return <RenewalControl session={session} access={access} full onApproved={leave}/>
  if(access.force_password_change)return <PasswordChangeGate session={session} currentPassword={currentPassword} onLogout={leave} onChanged={next=>{setSessionState(next);setCurrentPassword(undefined);setAccess(prev=>prev?{...prev,active:true,force_password_change:false,profile:{...prev.profile,force_password_change:false,password_changed_at:new Date().toISOString()}}:prev)}}/>

  const vehicle=vehicleId?data.vehicles.find(v=>v.id===vehicleId):undefined
  const editingVehicle=editingId?data.vehicles.find(v=>v.id===editingId):undefined
  const openVehicle=(id:string)=>{setView('garage');setVehicleId(id)}
  const saved=async(v:Vehicle)=>{setNewVehicleOpen(false);setEditingId(null);setView('garage');setVehicleId(v.id);await load()}
  const dealerName=session.dealer.display_name||session.dealer.name||'Concessionaria'
  const isAdmin=session.profile.role==='ADMIN'
  return <Shell view={view} onView={setView} profile={session.profile} dealerName={dealerName} onLogout={leave}>
    {access.renewal_available&&<RenewalControl session={session} access={access} onApproved={leave}/>} 
    {error&&<div className="load-error">{error}<button onClick={()=>void load()}><RefreshCw/>Riprova</button></div>}
    {busy&&<div className="loading-bar"/>}
    {view==='today'&&<TodayPage data={data} onVehicle={openVehicle} onView={setView}/>} 
    {view==='garage'&&<GaragePage data={data} onVehicle={setVehicleId} onCreate={()=>setNewVehicleOpen(true)} writable={canWriteGarage(session)}/>} 
    {view==='clients'&&<ClientsPage data={data} writable={canWriteCustomers(session)} onRefresh={load}/>} 
    {view==='calendar'&&<CalendarPage data={data} writable={canWriteCalendar(session)} onRefresh={load}/>} 
    {view==='sales'&&<SalesPage data={data} session={session} onRefresh={load}/>} 
    {view==='staff'&&(isAdmin?<StaffPage session={session} onBack={()=>setView('more')}/>:<MorePage isAdmin={false} onOpenStaff={()=>{}}/>)}
    {view==='more'&&<MorePage isAdmin={isAdmin} onOpenStaff={()=>setView('staff')}/>} 
    {vehicle&&<VehicleDrawer vehicle={vehicle} data={data} session={session} onClose={()=>setVehicleId(null)} onEdit={()=>setEditingId(vehicle.id)} onRefresh={load}/>} 
    {(newVehicleOpen||editingVehicle)&&<VehicleFormModal vehicle={editingVehicle} onClose={()=>{setNewVehicleOpen(false);setEditingId(null)}} onSaved={v=>void saved(v)}/>} 
  </Shell>
}
