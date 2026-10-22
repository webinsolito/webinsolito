import {useCallback,useEffect,useState} from 'react'
import {DoorOpen,RefreshCw,ShieldCheck} from 'lucide-react'
import {Login} from './components/Login'
import {OwnerLogin} from './components/OwnerLogin'
import {Shell} from './components/Shell'
import {PasswordChangeGate,RenewalControl} from './components/AccessGate'
import {VehicleDrawer} from './components/VehicleDrawer'
import {VehicleFormModal} from './components/VehicleFormModal'
import {CalendarPage} from './pages/CalendarPage'
import {ClientsPage} from './pages/ClientsPage'
import {CollectionsPage} from './pages/CollectionsPage'
import {DocumentsPage} from './pages/DocumentsPage'
import {DeadlinesPage} from './pages/DeadlinesPage'
import {GaragePage} from './pages/GaragePage'
import {MorePage} from './pages/MorePage'
import {InvoicesPage} from './pages/InvoicesPage'
import {OnboardingPage} from './pages/OnboardingPage'
import {OwnerPage} from './pages/OwnerPage'
import {SalesPage} from './pages/SalesPage'
import {StaffPage} from './pages/StaffPage'
import {TodayPage} from './pages/TodayPage'
import {canSeeFinance,canWriteCalendar,canWriteCustomers,canWriteGarage,fetchTenantData,getSession,logout} from './lib/api'
import {getOnboardingStatus} from './lib/onboardingApi'
import {enterOwnerSupport,exitOwnerSupport,getOwnerMe} from './lib/ownerApi'
import {getAccessStatus} from './lib/renewalApi'
import type {AccessStatus,OnboardingStatus,SessionPayload,TenantData,Vehicle,View} from './types'

const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
const isLocalHarness=()=>['localhost','127.0.0.1'].includes(window.location.hostname)
const initialOwnerMode=()=>new URLSearchParams(window.location.search).get('owner')==='1'
function updateOwnerQuery(enabled:boolean,dealerSlug?:string){const u=new URL(window.location.href);if(enabled)u.searchParams.set('owner','1');else u.searchParams.delete('owner');if(dealerSlug)u.searchParams.set('dealer',dealerSlug);window.history.replaceState({},'',`${u.pathname}${u.search}${u.hash}`)}

export default function App(){
  const [session,setSessionState]=useState<SessionPayload|null>(()=>getSession())
  const [currentPassword,setCurrentPassword]=useState<string|undefined>()
  const [access,setAccess]=useState<AccessStatus|null>(null)
  const [accessBusy,setAccessBusy]=useState(Boolean(session))
  const [onboarding,setOnboarding]=useState<OnboardingStatus|null>(null)
  const [onboardingBusy,setOnboardingBusy]=useState(false)
  const [onboardingError,setOnboardingError]=useState('')
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
  const [customerFocus,setCustomerFocus]=useState<{id:string;key:number}|null>(null)
  const [invoiceFocus,setInvoiceFocus]=useState<{id:string;key:number}|null>(null)
  const [salesFocus,setSalesFocus]=useState<{contractId?:string;vehicleId?:string;customerId?:string;key:number}|null>(null)
  const [calendarFocus,setCalendarFocus]=useState<{vehicleId?:string;customerId?:string;eventType?:string;title?:string;key:number}|null>(null)

  const clearLocal=useCallback(()=>{setAccess(null);setAccessBusy(false);setCurrentPassword(undefined);setOnboarding(null);setOnboardingBusy(false);setOnboardingError('');setData(empty);setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setSalesFocus(null);setCalendarFocus(null);setOwnerMode(false);setIsOwner(false);setOwnerChecked(false)},[])
  const leave=useCallback(()=>{const finish=()=>{logout();setSessionState(null);clearLocal();updateOwnerQuery(false)};if(session?.support_mode)void exitOwnerSupport().finally(finish);else finish()},[session,clearLocal])

  useEffect(()=>{
    if(!session){setIsOwner(false);setOwnerChecked(false);return}
    let active=true
    setOwnerChecked(false)
    void getOwnerMe().then(()=>{if(active)setIsOwner(true)}).catch(()=>{if(active)setIsOwner(false)}).finally(()=>{if(active)setOwnerChecked(true)})
    return()=>{active=false}
  },[session?.user?.id])

  const checkAccess=useCallback(async()=>{
    if(!session){setAccess(null);setAccessBusy(false);return}
    if(ownerMode){setAccessBusy(false);return}
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
  },[session,leave,ownerMode])

  const refreshOnboarding=useCallback(async():Promise<OnboardingStatus|void>=>{
    const needsCheck=Boolean(session&&access?.active&&session.profile.role==='ADMIN'&&!session.support_mode&&!ownerMode)
    if(!needsCheck){setOnboarding(null);setOnboardingBusy(false);setOnboardingError('');return}
    setOnboardingBusy(true);setOnboardingError('')
    try{const next=await getOnboardingStatus(session!);setOnboarding(next);return next}
    catch(err){
      const message=err instanceof Error?err.message:''
      if(isLocalHarness()&&/http_404|not_found|Failed to fetch/i.test(message)){
        const fallback:OnboardingStatus={ok:true,completed:true,dealer:session!.dealer,primary_branch:null,vehicle_count:0,member_count:1};setOnboarding(fallback);return fallback
      }
      if(/Sessione scaduta|unauthorized|session_revoked/i.test(message)){leave();return}
      setOnboardingError(message||'Impossibile verificare la configurazione iniziale')
    }finally{setOnboardingBusy(false)}
  },[session,access?.active,ownerMode,leave])

  const adminNeedsOnboarding=Boolean(session?.profile.role==='ADMIN'&&!session?.support_mode)
  const onboardingReady=!adminNeedsOnboarding||onboarding?.completed===true
  const load=useCallback(async()=>{
    if(!session||!access?.active||ownerMode||!onboardingReady)return
    setBusy(true);setError('')
    try{setData(await fetchTenantData(session))}
    catch(err){setError(err instanceof Error?err.message:'Errore caricamento dati')}
    finally{setBusy(false)}
  },[session,access?.active,ownerMode,onboardingReady])

  useEffect(()=>{void checkAccess()},[checkAccess])
  useEffect(()=>{if(access?.active&&!ownerMode)void refreshOnboarding();else{setOnboarding(null);setOnboardingBusy(false)}},[access?.active,ownerMode,refreshOnboarding])
  useEffect(()=>{if(access?.active&&!ownerMode&&onboardingReady)void load();else setData(empty)},[load,access?.active,ownerMode,onboardingReady])
  useEffect(()=>{document.title=ownerMode&&isOwner?'Owner · Dealer Cockpit':session?`${session.dealer.display_name||session.dealer.name||'Concessionaria'} · Dealer Cockpit`:'Dealer Cockpit'},[session,ownerMode,isOwner])

  const openOwner=()=>{setOwnerMode(true);setVehicleId(null);updateOwnerQuery(true,session?.dealer.slug)}
  const closeOwner=()=>{setOwnerMode(false);updateOwnerQuery(false,session?.dealer.slug)}
  const enterSupport=async(dealerId:string)=>{const next=await enterOwnerSupport(dealerId);setSessionState(next);setOwnerMode(false);setAccess(null);setAccessBusy(true);setOnboarding(null);setData(empty);setView('today');setVehicleId(null);updateOwnerQuery(false,next.dealer.slug)}
  const stopSupport=async()=>{setBusy(true);setError('');try{const restored=await exitOwnerSupport();if(!restored){leave();return}setSessionState(restored);setAccess(null);setAccessBusy(true);setOnboarding(null);setData(empty);setView('today');setOwnerMode(true);setIsOwner(true);setOwnerChecked(true);updateOwnerQuery(true,restored.dealer.slug)}catch(err){setError(err instanceof Error?err.message:'Impossibile chiudere il supporto')}finally{setBusy(false)}}
  const backToDealerLogin=()=>{setOwnerMode(false);updateOwnerQuery(false)}
  const openOwnerLogin=()=>{setOwnerMode(true);updateOwnerQuery(true)}

  if(!session){
    if(ownerMode)return <OwnerLogin onBack={backToDealerLogin} onLogin={next=>{setSessionState(next);setOwnerMode(true);setAccess(null);setAccessBusy(false)}}/>
    return <div className="login-owner-wrapper"><Login onLogin={(next,password)=>{setSessionState(next);setCurrentPassword(password);setAccess(null);setAccessBusy(true);setOnboarding(null)}}/><button className="owner-entry-button" type="button" onClick={openOwnerLogin}><ShieldCheck/>Accesso proprietario</button></div>
  }
  if(ownerMode){
    if(!ownerChecked)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Verifica accesso proprietario…</h1></section></main>
    if(isOwner)return <OwnerPage onClose={closeOwner} onLogout={leave} onEnterSupport={enterSupport}/>
    return <main className="access-page"><section className="access-card"><ShieldCheck className="access-large-icon"/><h1>Area non disponibile</h1><p className="access-copy">Questo account non dispone dell’accesso proprietario.</p><button className="primary" onClick={closeOwner}>Torna al gestionale</button></section></main>
  }
  if(accessBusy&&!access)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Verifica accesso…</h1></section></main>
  if(!access)return <main className="access-page"><section className="access-card"><h1>Accesso non verificato</h1><p className="access-copy">{error||'Riprova la verifica.'}</p><button className="primary" onClick={()=>void checkAccess()}>Riprova</button><button className="access-secondary" onClick={leave}>Esci</button></section></main>
  if(access.expired)return <RenewalControl session={session} access={access} full onApproved={leave}/>
  if(access.force_password_change)return <PasswordChangeGate session={session} currentPassword={currentPassword} onLogout={leave} onChanged={next=>{setSessionState(next);setCurrentPassword(undefined);setAccess(prev=>prev?{...prev,active:true,force_password_change:false,profile:{...prev.profile,force_password_change:false,password_changed_at:new Date().toISOString()}}:prev)}}/>
  if(adminNeedsOnboarding&&onboardingBusy&&!onboarding)return <main className="access-page"><section className="access-card access-loading"><RefreshCw className="spin"/><h1>Preparazione concessionaria…</h1></section></main>
  if(adminNeedsOnboarding&&!onboarding&&onboardingError)return <main className="access-page"><section className="access-card"><h1>Configurazione non verificata</h1><p className="access-copy">{onboardingError}</p><button className="primary" onClick={()=>void refreshOnboarding()}>Riprova</button><button className="access-secondary" onClick={leave}>Esci</button></section></main>
  if(adminNeedsOnboarding&&onboarding&&!onboarding.completed)return <OnboardingPage session={session} status={onboarding} onRefresh={refreshOnboarding} onLogout={leave} onComplete={target=>{const completedAt=new Date().toISOString();setOnboarding(prev=>prev?{...prev,completed:true,dealer:{...prev.dealer,onboarding_completed_at:completedAt}}:prev);setSessionState(prev=>prev?{...prev,dealer:{...prev.dealer,onboarding_completed_at:completedAt}}:prev);setView(target)}}/>

  const vehicle=vehicleId?data.vehicles.find(v=>v.id===vehicleId):undefined
  const editingVehicle=editingId?data.vehicles.find(v=>v.id===editingId):undefined
  const openVehicle=(id:string)=>{setCustomerFocus(null);setInvoiceFocus(null);setSalesFocus(null);setCalendarFocus(null);setView('garage');setVehicleId(id)}
  const saved=async(v:Vehicle)=>{setNewVehicleOpen(false);setEditingId(null);setView('garage');setVehicleId(v.id);await load()}
  const openCustomerSearch=(id:string)=>{setVehicleId(null);setInvoiceFocus(null);setSalesFocus(null);setCustomerFocus(prev=>({id,key:(prev?.key||0)+1}));setView('clients')}
  const openInvoiceSearch=(id:string)=>{setVehicleId(null);setCustomerFocus(null);setSalesFocus(null);setInvoiceFocus(prev=>({id,key:(prev?.key||0)+1}));setView('invoices')}
  const openVehicleSales=(id:string)=>{setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setCalendarFocus(null);setSalesFocus(prev=>({vehicleId:id,key:(prev?.key||0)+1}));setView('sales')}
  const openVehicleAppointment=(id:string)=>{const customerId=data.customerInterests.find(i=>i.vehicle_id===id&&String(i.status||'').toUpperCase()!=='PERSA')?.customer_id;setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setSalesFocus(null);setCalendarFocus(prev=>({vehicleId:id,customerId,key:(prev?.key||0)+1}));setView('calendar')}
  const openCustomerSales=(id:string)=>{setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setCalendarFocus(null);setSalesFocus(prev=>({customerId:id,key:(prev?.key||0)+1}));setView('sales')}
  const openSaleContract=(id:string)=>{setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setCalendarFocus(null);setSalesFocus(prev=>({contractId:id,key:(prev?.key||0)+1}));setView('sales')}
  const openCustomerAppointment=(id:string)=>{const vehicleId=data.customerInterests.find(i=>i.customer_id===id&&String(i.status||'').toUpperCase()!=='PERSA')?.vehicle_id;setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setSalesFocus(null);setCalendarFocus(prev=>({customerId:id,vehicleId,key:(prev?.key||0)+1}));setView('calendar')}
  const openSaleDeliveryAppointment=(customerId:string,vehicleId:string)=>{const vehicle=data.vehicles.find(v=>v.id===vehicleId);setVehicleId(null);setCustomerFocus(null);setInvoiceFocus(null);setSalesFocus(null);setCalendarFocus(prev=>({customerId,vehicleId,eventType:'DELIVERY',title:'Consegna '+([vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||'veicolo'),key:(prev?.key||0)+1}));setView('calendar')}
  const dealerName=session.dealer.display_name||session.dealer.name||'Concessionaria'
  const isAdmin=session.profile.role==='ADMIN'&&!session.support_mode
  const financeVisible=canSeeFinance(session)
  const more=<MorePage isAdmin={isAdmin} financeVisible={financeVisible} isOwner={isOwner&&!session.support_mode} onOpenStaff={()=>setView('staff')} onOpenDocuments={()=>setView('documents')} onOpenInvoices={()=>{setInvoiceFocus(null);setView('invoices')}} onOpenCollections={()=>setView('collections')} onOpenDeadlines={()=>setView('deadlines')} onOpenOwner={openOwner}/>
  return <Shell view={view} onView={setView} profile={session.profile} dealerName={dealerName} onLogout={leave} searchData={data} financeVisible={financeVisible} onSearchVehicle={openVehicle} onSearchCustomer={openCustomerSearch} onSearchInvoice={openInvoiceSearch}>
    {session.support_mode&&<div className="owner-live-support"><DoorOpen/><div><b>SUPPORTO OWNER · {dealerName}</b><span>Accesso temporaneo e tracciato · scade {session.support_expires_at?new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date(session.support_expires_at)):'automaticamente'}</span></div><button onClick={()=>void stopSupport()}>Esci dal supporto</button></div>}
    {access.renewal_available&&!session.support_mode&&<RenewalControl session={session} access={access} onApproved={leave}/>} 
    {error&&<div className="load-error">{error}<button onClick={()=>void load()}><RefreshCw/>Riprova</button></div>}
    {busy&&<div className="loading-bar"/>}
    {view==='today'&&<TodayPage data={data} financeVisible={financeVisible} onVehicle={openVehicle} onSale={openSaleContract} onView={setView} onCollections={()=>setView('collections')} onDeadlines={()=>setView('deadlines')}/>}   
    {view==='garage'&&<GaragePage data={data} session={session} onRefresh={load} onVehicle={setVehicleId} onOpenSale={openSaleContract} onCreate={()=>setNewVehicleOpen(true)} writable={canWriteGarage(session)}/>} 
    {view==='clients'&&<ClientsPage data={data} writable={canWriteCustomers(session)} onRefresh={load} focusCustomerId={customerFocus?.id} focusKey={customerFocus?.key} onFocusConsumed={()=>setCustomerFocus(null)} onOpenVehicle={openVehicle} onOpenCalendar={openCustomerAppointment} onOpenSales={openCustomerSales}/>}  
    {view==='calendar'&&<CalendarPage data={data} writable={canWriteCalendar(session)} onRefresh={load} focusVehicleId={calendarFocus?.vehicleId} focusCustomerId={calendarFocus?.customerId} focusEventType={calendarFocus?.eventType} focusTitle={calendarFocus?.title} focusKey={calendarFocus?.key} onFocusConsumed={()=>setCalendarFocus(null)}/>}  
    {view==='sales'&&<SalesPage data={data} session={session} onRefresh={load} focusContractId={salesFocus?.contractId} focusVehicleId={salesFocus?.vehicleId} focusCustomerId={salesFocus?.customerId} focusKey={salesFocus?.key} onFocusConsumed={()=>setSalesFocus(null)} onOpenCustomer={openCustomerSearch} onOpenVehicle={openVehicle} onOpenDeliveryAppointment={openSaleDeliveryAppointment} onOpenInvoices={id=>{if(id)openInvoiceSearch(id);else{setVehicleId(null);setCustomerFocus(null);setSalesFocus(null);setView('invoices')}}} onOpenDeadlines={()=>setView('deadlines')}/>}  
    {view==='documents'&&(financeVisible?<DocumentsPage session={session} vehicles={data.vehicles} onBack={()=>setView('more')} onCostsChanged={load}/>:more)}
    {view==='collections'&&(financeVisible?<CollectionsPage onBack={()=>setView('more')}/>:more)}
    {view==='invoices'&&(financeVisible?<InvoicesPage onBack={()=>setView('more')} focusInvoiceId={invoiceFocus?.id} focusKey={invoiceFocus?.key} onFocusConsumed={()=>setInvoiceFocus(null)}/>:more)}
    {view==='deadlines'&&<DeadlinesPage data={data} financeVisible={financeVisible} onBack={()=>setView('today')} onVehicle={openVehicle} onCustomer={openCustomerSearch} onSale={openSaleContract} onCalendar={()=>setView('calendar')} onCollections={()=>setView('collections')}/>} 
    {view==='staff'&&(isAdmin?<StaffPage session={session} onBack={()=>setView('more')}/>:more)}
    {view==='more'&&more} 
    {vehicle&&<VehicleDrawer vehicle={vehicle} data={data} session={session} onClose={()=>setVehicleId(null)} onEdit={()=>setEditingId(vehicle.id)} onRefresh={load} onOpenCustomer={openCustomerSearch} onOpenCalendar={()=>{setVehicleId(null);setCalendarFocus(null);setView('calendar')}} onQuickAppointment={()=>openVehicleAppointment(vehicle.id)} onOpenDeadlines={()=>{setVehicleId(null);setView('deadlines')}} onOpenSales={()=>openVehicleSales(vehicle.id)} onOpenInvoices={id=>{if(id)openInvoiceSearch(id);else{setVehicleId(null);setView('invoices')}}}/>}  
    {(newVehicleOpen||editingVehicle)&&<VehicleFormModal vehicle={editingVehicle} onClose={()=>{setNewVehicleOpen(false);setEditingId(null)}} onSaved={v=>void saved(v)}/>} 
  </Shell>
}
