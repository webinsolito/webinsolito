import {useCallback,useEffect,useState} from 'react'
import {DoorOpen,RefreshCw,ShieldCheck} from 'lucide-react'
import {Login} from './components/Login'
import {Shell} from './components/Shell'
import {PasswordChangeGate,RenewalControl} from './components/AccessGate'
import {VehicleDrawer} from './components/VehicleDrawer'
import {VehicleFormModal} from './components/VehicleFormModal'
import {CalendarPage} from './pages/CalendarPage'
import {ClientsPage} from './pages/ClientsPage'
import {GaragePage} from './pages/GaragePage'
import {MorePage} from './pages/MorePage'
import {OwnerPage} from './pages/OwnerPage'
import {SalesPage} from './pages/SalesPage'
import {StaffPage} from './pages/StaffPage'
import {TodayPage} from './pages/TodayPage'
import {canWriteCalendar,canWriteCustomers,canWriteGarage,fetchTenantData,getSession,logout} from './lib/api'
import {enterOwnerSupport,exitOwnerSupport,getOwnerMe} from './lib/ownerApi'
import {getAccessStatus} from './lib/renewalApi'
import type {AccessStatus,SessionPayload,TenantData,Vehicle,View} from './types'

const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
const isLocalHarness=()=>['localhost','127.0.0.1'].includes(window.location.hostname)
const initialOwnerMode=()=>new URLSearchParams(window.location.search).get('owner')==='1'
function updateOwnerQuery(enabled:boolean,dealerSlug?:string){const u=new URL(window.location.href);if(enabled)u.searchParams.set('owner','1');else u.searchParams.delete('owner');if(dealerSlug)u.searchParams.set('dealer',dealerSlug);window.history.replaceState({},'',`${u.pathname}${u.search}${u.hash}`)}

export default function App(){
  const [session,setSessionState]=useState<SessionPayload|null>(()=>getSession())
  const [currentPassword,setCurrentPassword]=useState<string|undefined>()
  const [access,setAccess]=useState<AccessStatus|null>(null)
  const [accessBusy,setAccessBusy]=useState(Boolean(session))
  const [ownerMode,setOwnerMode]=useState(initialOwnerMode)
  const [isOwner,setIsOwner]=useState(false)
  const [ownerChecked,setOwnerChecked]=useState(false)
  const [view,setView]=useState<View>('today')
  const [data,setData]=useState<TenantData>(empty)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [vehicleId,setVehicleId]=useState<string|null>(null)
  const [newVehicleOpen,setNewVehicleOpen]=useState(false)
  const [editingId,setEditingId]=useState<string|null>(null)

  const clearLocal=useCallback(()=>{setAccess(null);setAccessBusy(false);setCurrentPassword(undefined);setData(empty);setVehicleId(null);setOwnerMode(false);setIsOwner(false);setOwnerChecked(false)},[])
  const leave=useCallback(()=>{const finish=()=>{logout();setSessionState(null);clearLocal()};if(session?.support_mode)void exitOwnerSupport().finally(finish);else finish()},[session,clearLocal])

  useEffect(()=>{
    if(!session){setIsOwner(false);setOwnerChecked(false);return}
    let active=true
    setOwnerChecked(false)
    void getOwnerMe().then(()=>{if(active)setIsOwner(true)}).catch(()=>{if(active)setIsOwner(false)}).finally(()=>{if(active)setOwnerChecked(true)})
    return()=>{active=false}
  },[session?.user?.id])

  const checkAccess=useCallback(async()=>{
    if(!session){setAccess(null);setAccessBusy(false);return}
    if(session.support_mode){
      const expiry=session.support_expires_at?new Date(session.support_expires_at).getTime():0
      if(!expiry||expiry<=Date.now()){
        const restored=await exitOwnerSupport()
        setSessionState(restored);setAccess(null);setData(empty);setOwnerMode(Boolean(restored));updateOwnerQuery(Boolean(restored),restored?.dealer.slug);setAccessBusy(Boolean(restored));return
      }
      setAccess({ok:true,dealer:session.dealer,profile:session.profile,expired:false,force_password_change:false,days_remaining:1,renewal_available:false,active:true})
      setAccessBusy(false);return
    }
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
    if(!session||!access?.active||ownerMode)return
    setBusy(true);setError('')
    try{setData(await fetchTenantData(session))}
    catch(err){setError(err instanceof Error?err.message:'Errore caricamento dati')}
    finally{setBusy(false)}
  },[session,access?.active,ownerMode])

  useEffect(()=>{void checkAccess()},[checkAccess])
  useEffect(()=>{if(access?.active&&!ownerMode)void load();else setData(empty)},[load,access?.active,ownerMode])
  useEffect(()=>{document.title=ownerMode&&isOwner?'Owner · Dealer Cockpit':session?`${session.dealer.display_name||session.dealer.name||'Concessionaria'} · Dealer Cockpit`:'Dealer Cockpit'},[session,ownerMode,isOwner])
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('global-search')?.focus()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])

  const openOwner=()=>{setOwnerMode(true);setVehicleId(null);updateOwnerQuery(true,session?.dealer.slug)}
  const closeOwner=()=>{setOwnerMode(false);updateOwnerQuery(false,session?.dealer.slug)}
  const enterSupport=async(dealerId:string)=>{const next=await enterOwnerSupport(dealerId);setSessionState(next);setOwnerMode(false);setAccess(null);setAccessBusy(true);setData(empty);setView('today');setVehicleId(null);updateOwnerQuery(false,next.dealer.slug)}
  const stopSupport=async()=>{setBusy(true);setError('');try{const restored=await exitOwnerSupport();if(!restored){leave();return}setSessionState(restored);setAccess(null);setAccessBusy(true);setData(empty);setView('today');setOwnerMode(true);setIsOwner(true);setOwnerChecked(true);updateOwnerQuery(true,restored.dealer.slug)}catch(err){setError(err instanceof Error?err.message:'Impossibile chiudere il supporto')}finally{setBusy(false)}}

  if(!session)return <Login onLogin={(next,password)=>{setSessionState(next);setCurrentPassword(password);setAccess(null);setAccessBusy(true)}}/>
  if(ownerMode){
    if(!ownerChecked)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Verifica accesso proprietario…</h1></section></main>
    if(isOwner)return <OwnerPage onClose={closeOwner} onLogout={leave} onEnterSupport={enterSupport}/>
    return <main className="access-page"><section className="access-card"><ShieldCheck className="access-large-icon"/><h1>Area non disponibile</h1><p className="access-copy">Questo account non dispone dell’accesso proprietario.</p><button className="primary" onClick={closeOwner}>Torna al gestionale</button></section></main>
  }
  if(accessBusy&&!access)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Verifica accesso…</h1></section></main>
  if(!access)return <main className="access-page"><section className="access-card"><h1>Accesso non verificato</h1><p className="access-copy">{error||'Riprova la verifica.'}</p><button className="primary" onClick={()=>void checkAccess()}>Riprova</button><button className="access-secondary" onClick={leave}>Esci</button></section></main>
  if(access.expired)return <RenewalControl session={session} access={access} full onApproved={leave}/>
  if(access.force_password_change)return <PasswordChangeGate session={session} currentPassword={currentPassword} onLogout={leave} onChanged={next=>{setSessionState(next);setCurrentPassword(undefined);setAccess(prev=>prev?{...prev,active:true,force_password_change:false,profile:{...prev.profile,force_password_change:false,password_changed_at:new Date().toISOString()}}:prev)}}/>

  const vehicle=vehicleId?data.vehicles.find(v=>v.id===vehicleId):undefined
  const editingVehicle=editingId?data.vehicles.find(v=>v.id===editingId):undefined
  const openVehicle=(id:string)=>{setView('garage');setVehicleId(id)}
  const saved=async(v:Vehicle)=>{setNewVehicleOpen(false);setEditingId(null);setView('garage');setVehicleId(v.id);await load()}
  const dealerName=session.dealer.display_name||session.dealer.name||'Concessionaria'
  const isAdmin=session.profile.role==='ADMIN'&&!session.support_mode
  return <Shell view={view} onView={setView} profile={session.profile} dealerName={dealerName} onLogout={leave}>
    {session.support_mode&&<div className="owner-live-support"><DoorOpen/><div><b>SUPPORTO OWNER · {dealerName}</b><span>Accesso temporaneo e tracciato · scade {session.support_expires_at?new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(session.support_expires_at)):'automaticamente'}</span></div><button onClick={()=>void stopSupport()}>Esci dal supporto</button></div>}
    {access.renewal_available&&!session.support_mode&&<RenewalControl session={session} access={access} onApproved={leave}/>} 
    {error&&<div className="load-error">{error}<button onClick={()=>void load()}><RefreshCw/>Riprova</button></div>}
    {busy&&<div className="loading-bar"/>}
    {view==='today'&&<TodayPage data={data} onVehicle={openVehicle} onView={setView}/>} 
    {view==='garage'&&<GaragePage data={data} onVehicle={setVehicleId} onCreate={()=>setNewVehicleOpen(true)} writable={canWriteGarage(session)}/>} 
    {view==='clients'&&<ClientsPage data={data} writable={canWriteCustomers(session)} onRefresh={load}/>} 
    {view==='calendar'&&<CalendarPage data={data} writable={canWriteCalendar(session)} onRefresh={load}/>} 
    {view==='sales'&&<SalesPage data={data} session={session} onRefresh={load}/>} 
    {view==='staff'&&(isAdmin?<StaffPage session={session} onBack={()=>setView('more')}/>:<MorePage isAdmin={false} isOwner={isOwner&&!session.support_mode} onOpenStaff={()=>{}} onOpenOwner={openOwner}/>)}
    {view==='more'&&<MorePage isAdmin={isAdmin} isOwner={isOwner&&!session.support_mode} onOpenStaff={()=>setView('staff')} onOpenOwner={openOwner}/>} 
    {vehicle&&<VehicleDrawer vehicle={vehicle} data={data} session={session} onClose={()=>setVehicleId(null)} onEdit={()=>setEditingId(vehicle.id)} onRefresh={load}/>} 
    {(newVehicleOpen||editingVehicle)&&<VehicleFormModal vehicle={editingVehicle} onClose={()=>{setNewVehicleOpen(false);setEditingId(null)}} onSaved={v=>void saved(v)}/>} 
  </Shell>
}
