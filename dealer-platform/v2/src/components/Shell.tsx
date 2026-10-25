import type {ReactNode} from 'react'
import {CalendarDays,CarFront,LayoutDashboard,LogOut,Menu,ShoppingBag,UsersRound} from 'lucide-react'
import {GlobalSearch} from './GlobalSearch'
import type {Profile,TenantData,View} from '../types'

const nav:[View,string,typeof LayoutDashboard][]=[
 ['today','Oggi',LayoutDashboard],
 ['garage','Garage',CarFront],
 ['clients','Clienti',UsersRound],
 ['calendar','Calendario',CalendarDays],
 ['sales','Vendite',ShoppingBag],
 ['more','Altro',Menu]
]

export function Shell({
 view,onView,profile,dealerName,onLogout,searchData,financeVisible,
 onSearchVehicle,onSearchCustomer,onSearchInvoice,children
}:{
 view:View;onView:(v:View)=>void;profile:Profile;dealerName:string;
 onLogout:()=>void;searchData:TenantData;financeVisible:boolean;
 onSearchVehicle:(id:string)=>void;onSearchCustomer:(id:string)=>void;
 onSearchInvoice:(id:string)=>void;children:ReactNode
}){
 // Secondary modules are reached from Altro; the menu always shows one active destination.
 const currentNav:View=nav.some(([id])=>id===view)?view:'more'
 const currentLabel=nav.find(([id])=>id===currentNav)?.[1]||'Altro'
 const active=(id:View)=>id===currentNav

 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand">
    <div className="brand-icon"><CarFront aria-hidden="true"/></div>
    <div><b>{dealerName}</b><span>Dealer Cockpit</span></div>
   </div>
   <nav aria-label="Sezioni principali">
    {nav.map(([id,label,Icon])=><button key={id} type="button"
     className={active(id)?'active':''} aria-current={active(id)?'page':undefined}
     onClick={()=>onView(id)}>
      <Icon aria-hidden="true"/><span>{label}</span>
     </button>)}
   </nav>
   <div className="side-bottom">
    <small>Spazio concessionaria</small>
    <button type="button" onClick={onLogout}><LogOut aria-hidden="true"/>Esci</button>
   </div>
  </aside>
  <main className="workspace">
   <header className="topbar">
    <GlobalSearch data={searchData} financeVisible={financeVisible}
     onVehicle={onSearchVehicle} onCustomer={onSearchCustomer} onInvoice={onSearchInvoice}/>
    <span className="mobile-view-label">{currentLabel}</span>
    <div className="identity" aria-label={profile.display_name||profile.username||'Utente'}>
     <div className="avatar" aria-hidden="true">{(profile.display_name||profile.username||'U').slice(0,1).toUpperCase()}</div>
     <div><b>{profile.display_name||profile.username||'Utente'}</b><span>{profile.role}</span></div>
    </div>
   </header>
   <div className="page">{children}</div>
  </main>
  <nav className="mobile-nav" aria-label="Navigazione mobile">
   {nav.map(([id,label,Icon])=><button key={id} type="button"
    className={active(id)?'active':''} aria-current={active(id)?'page':undefined}
    onClick={()=>onView(id)}>
    <Icon aria-hidden="true"/><small>{label}</small>
   </button>)}
  </nav>
 </div>
}
