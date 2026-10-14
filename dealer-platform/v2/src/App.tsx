import {useCallback,useEffect,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {Login} from './components/Login'
import {Shell} from './components/Shell'
import {VehicleDrawer} from './components/VehicleDrawer'
import {CalendarPage} from './pages/CalendarPage'
import {ClientsPage} from './pages/ClientsPage'
import {GaragePage} from './pages/GaragePage'
import {MorePage} from './pages/MorePage'
import {TodayPage} from './pages/TodayPage'
import {fetchTenantData,getSession,logout} from './lib/api'
import type {SessionPayload,TenantData,View} from './types'
const empty:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
export default function App(){const [session,setSessionState]=useState<SessionPayload|null>(()=>getSession());const [view,setView]=useState<View>('today');const [data,setData]=useState<TenantData>(empty);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [vehicleId,setVehicleId]=useState<string|null>(null);const load=useCallback(async()=>{if(!session)return;setBusy(true);setError('');try{setData(await fetchTenantData(session))}catch(err){setError(err instanceof Error?err.message:'Errore caricamento dati')}finally{setBusy(false)}},[session]);useEffect(()=>{void load()},[load]);useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('global-search')?.focus()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);if(!session)return <Login onLogin={setSessionState}/>;const vehicle=vehicleId?data.vehicles.find(v=>v.id===vehicleId):undefined;const openVehicle=(id:string)=>{setView('garage');setVehicleId(id)};return <Shell view={view} onView={setView} profile={session.profile} dealerName={session.dealer.display_name||session.dealer.name||'MALÙ23 CARS'} onLogout={()=>{logout();setSessionState(null);setData(empty)}}>{error&&<div className="load-error">{error}<button onClick={()=>void load()}><RefreshCw/>Riprova</button></div>}{busy&&<div className="loading-bar"/>}{view==='today'&&<TodayPage data={data} onVehicle={openVehicle}/>} {view==='garage'&&<GaragePage data={data} onVehicle={setVehicleId}/>} {view==='clients'&&<ClientsPage data={data}/>} {view==='calendar'&&<CalendarPage data={data}/>} {view==='more'&&<MorePage/>}{vehicle&&<VehicleDrawer vehicle={vehicle} data={data} session={session} onClose={()=>setVehicleId(null)}/>}</Shell>}
