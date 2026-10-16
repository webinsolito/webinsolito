import {useEffect,useMemo,useState,type FormEvent} from 'react'
import {AlertTriangle,ArrowLeft,Building2,Check,ChevronRight,Clock3,Copy,DoorOpen,KeyRound,PauseCircle,PlayCircle,Plus,RefreshCw,ShieldCheck,UsersRound,X} from 'lucide-react'
import {approveOwnerRegistration,approveOwnerRenewal,createOwnerMember,getOwnerDealerDetail,getOwnerOverview,rejectOwnerRegistration,rejectOwnerRenewal,resetOwnerMemberPassword,setOwnerDealerStatus,updateOwnerMember,type OwnerDealer,type OwnerDealerDetail,type OwnerOverview} from '../lib/ownerApi'
import type {AdminMember,Role} from '../types'

const ROLE_OPTIONS:[Role,string][]=[['VENDITORE','Venditore'],['AMMINISTRAZIONE','Amministrazione'],['OPERATORE','Operatore'],['ADMIN','Amministratore']]
const fmtDate=(value?:string|null,time=false)=>value?new Intl.DateTimeFormat('it-IT',time?{dateStyle:'medium',timeStyle:'short'}:{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)):'—'
const daysTo=(value?:string|null)=>value?Math.ceil((new Date(value).getTime()-Date.now())/86400000):null
const roleLabel=(value:string)=>ROLE_OPTIONS.find(([id])=>id===value)?.[1]||value

type Credentials={dealerSlug:string;displayName:string;username:string;tempPassword:string}

export function OwnerPage({onClose,onLogout,onEnterSupport}:{onClose:()=>void;onLogout:()=>void;onEnterSupport:(dealerId:string)=>Promise<void>}){
  const [overview,setOverview]=useState<OwnerOverview|null>(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [action,setAction]=useState('')
  const [detail,setDetail]=useState<OwnerDealerDetail|null>(null)
  const [detailBusy,setDetailBusy]=useState(false)
  const [newMemberOpen,setNewMemberOpen]=useState(false)
  const [credentials,setCredentials]=useState<Credentials|null>(null)

  const load=async()=>{setBusy(true);setError('');try{setOverview(await getOwnerOverview())}catch(err){setError(err instanceof Error?err.message:'Impossibile caricare il pannello proprietario')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])

  const registrations=useMemo(()=>(overview?.registrations||[]).filter(r=>r.status==='PENDING'),[overview])
  const renewals=useMemo(()=>(overview?.renewals||[]).filter(r=>r.status==='PENDING'),[overview])
  const dealerById=(id:string)=>overview?.dealers.find(d=>d.id===id)

  const run=async(key:string,fn:()=>Promise<unknown>,reload=true)=>{setAction(key);setError('');try{await fn();if(reload)await load()}catch(err){setError(err instanceof Error?err.message:'Operazione non riuscita')}finally{setAction('')}}

  const decideRegistration=(id:string,approve:boolean)=>void run(`reg-${id}`,async()=>{if(!approve&&!window.confirm('Rifiutare questa richiesta di registrazione?'))return;await (approve?approveOwnerRegistration(id):rejectOwnerRegistration(id))})
  const decideRenewal=(id:string,approve:boolean)=>void run(`renew-${id}`,async()=>{if(!approve&&!window.confirm('Rifiutare questo rinnovo? La concessionaria verrà bloccata alla scadenza.'))return;await (approve?approveOwnerRenewal(id):rejectOwnerRenewal(id))})
  const toggleDealer=(dealer:OwnerDealer)=>void run(`dealer-${dealer.id}`,async()=>{const next=dealer.status==='ACTIVE'?'SUSPENDED':'ACTIVE';const verb=next==='SUSPENDED'?'sospendere':'riattivare';if(!window.confirm(`Vuoi ${verb} ${dealer.display_name||dealer.slug}?`))return;await setOwnerDealerStatus(dealer.id,next);if(detail?.dealer.id===dealer.id)await openDetail(dealer.id)})

  const openDetail=async(id:string)=>{setDetailBusy(true);setError('');try{setDetail(await getOwnerDealerDetail(id));setNewMemberOpen(false)}catch(err){setError(err instanceof Error?err.message:'Dettagli non disponibili')}finally{setDetailBusy(false)}}
  const enterSupport=async(dealer:OwnerDealer)=>{setAction(`support-${dealer.id}`);setError('');try{await onEnterSupport(dealer.id)}catch(err){setError(err instanceof Error?err.message:'Accesso supporto non riuscito');setAction('')}}

  const activeDealers=(overview?.dealers||[]).filter(d=>d.status==='ACTIVE').length
  const expiring=(overview?.dealers||[]).filter(d=>{const x=daysTo(d.access_expires_at);return d.status==='ACTIVE'&&x!==null&&x<=7}).length
  const activeUsers=(overview?.dealers||[]).reduce((n,d)=>n+(d.members?.active||0),0)

  return <main className="owner-page">
    <header className="owner-topbar"><div className="owner-brand"><div className="owner-mark"><ShieldCheck/></div><div><span>OWNER · DEALER COCKPIT</span><strong>Pannello proprietario</strong></div></div><div className="owner-top-actions"><button onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?'spin':''}/>Aggiorna</button><button onClick={onClose}><ArrowLeft/>Gestionale</button><button className="owner-logout" onClick={onLogout}>Esci</button></div></header>
    <div className="owner-content">
      <section className="owner-hero"><div><p className="eyebrow">CONTROLLO CENTRALE</p><h1>Le tue concessionarie, da un solo posto.</h1><p>Approva nuovi clienti, controlla scadenze e utenti, intervieni in assistenza senza conoscere nessuna password.</p></div><div className="owner-identity"><ShieldCheck/><span>Accesso proprietario verificato</span><b>{overview?.owner.label||'OWNER'}</b></div></section>

      {error&&<div className="owner-error"><AlertTriangle/>{error}<button onClick={()=>setError('')}><X/></button></div>}
      {overview?.support_session&&<div className="owner-support-notice"><Clock3/><div><b>Sessione supporto ancora attiva</b><span>Scade alle {fmtDate(overview.support_session.expires_at,true)}. Entrando in un’altra concessionaria verrà chiusa automaticamente.</span></div></div>}

      <section className="owner-stats"><article><span>CONCESSIONARIE ATTIVE</span><strong>{activeDealers}</strong><Building2/></article><article><span>RICHIESTE DA DECIDERE</span><strong>{registrations.length+renewals.length}</strong><Clock3/></article><article className={expiring?'warning':''}><span>IN SCADENZA / SCADUTE</span><strong>{expiring}</strong><AlertTriangle/></article><article><span>UTENTI ATTIVI</span><strong>{activeUsers}</strong><UsersRound/></article></section>

      {(registrations.length>0||renewals.length>0)&&<section className="owner-queue"><div className="owner-section-title"><div><p className="eyebrow">DA APPROVARE</p><h2>Richieste</h2></div><span>{registrations.length+renewals.length}</span></div><div className="owner-request-grid">
        {registrations.map(r=><article className="owner-request" key={r.id}><div className="owner-request-icon"><Building2/></div><div className="owner-request-copy"><span>NUOVA CONCESSIONARIA</span><h3>{r.dealer_name}</h3><p>{r.legal_name} · {r.city||'Città non indicata'}</p><small>{r.owner_display_name} · {r.email} · {r.phone||'—'}</small><em>P.IVA {r.vat_number||'—'} · @{r.username}</em></div><div className="owner-request-actions"><button className="accept" disabled={action===`reg-${r.id}`} onClick={()=>decideRegistration(r.id,true)}><Check/>Approva</button><button className="reject" disabled={action===`reg-${r.id}`} onClick={()=>decideRegistration(r.id,false)}><X/>Rifiuta</button></div></article>)}
        {renewals.map(r=>{const d=dealerById(r.dealer_id);return <article className="owner-request renewal" key={r.id}><div className="owner-request-icon"><Clock3/></div><div className="owner-request-copy"><span>RINNOVO 30 GIORNI</span><h3>{d?.display_name||'Concessionaria'}</h3><p>Codice {d?.slug||'—'} · scadenza {fmtDate(r.previous_expires_at)}</p><small>L’approvazione estende di 30 giorni, chiude le sessioni e forza il cambio password.</small></div><div className="owner-request-actions"><button className="accept" disabled={action===`renew-${r.id}`} onClick={()=>decideRenewal(r.id,true)}><Check/>Approva</button><button className="reject" disabled={action===`renew-${r.id}`} onClick={()=>decideRenewal(r.id,false)}><X/>Rifiuta</button></div></article>})}
      </div></section>}

      <section className="owner-dealers"><div className="owner-section-title"><div><p className="eyebrow">CLIENTI</p><h2>Concessionarie</h2></div><span>{overview?.dealers.length||0}</span></div>
        {busy&&!overview?<div className="owner-loading"><RefreshCw className="spin"/>Caricamento concessionarie…</div>:<div className="owner-dealer-grid">{(overview?.dealers||[]).map(d=><DealerCard key={d.id} dealer={d} action={action} onDetail={()=>void openDetail(d.id)} onSupport={()=>void enterSupport(d)} onToggle={()=>toggleDealer(d)}/>) }{!overview?.dealers.length&&<div className="owner-empty">Nessuna concessionaria registrata.</div>}</div>}
      </section>
    </div>

    {(detail||detailBusy)&&<div className="owner-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}>{detailBusy&&!detail?<div className="owner-detail-loading"><RefreshCw className="spin"/>Caricamento…</div>:detail&&<OwnerDealerDrawer detail={detail} busyKey={action} credentials={credentials} newMemberOpen={newMemberOpen} onClose={()=>{setDetail(null);setCredentials(null)}} onToggleNew={()=>setNewMemberOpen(v=>!v)} onCredentials={setCredentials} onRefresh={()=>void openDetail(detail.dealer.id)} onRun={run}/>}</div>}
  </main>
}

function DealerCard({dealer,action,onDetail,onSupport,onToggle}:{dealer:OwnerDealer;action:string;onDetail:()=>void;onSupport:()=>void;onToggle:()=>void}){
  const days=daysTo(dealer.access_expires_at),expired=days!==null&&days<=0,warning=days!==null&&days<=7
  return <article className={`owner-dealer-card ${dealer.status!=='ACTIVE'?'suspended':''}`} data-testid={`owner-dealer-${dealer.slug}`}><div className="owner-dealer-head"><div className="owner-dealer-logo"><Building2/></div><div><h3>{dealer.display_name||dealer.slug}</h3><span>{dealer.legal_name||dealer.slug}</span></div><em className={dealer.status==='ACTIVE'?'active':'suspended'}>{dealer.status==='ACTIVE'?'ATTIVA':'SOSPESA'}</em></div><div className="owner-dealer-code">Codice <b>{dealer.slug}</b></div><div className="owner-dealer-meta"><span className={expired?'danger':warning?'warning':''}><Clock3/>Scadenza <b>{fmtDate(dealer.access_expires_at)}</b>{days!==null&&<small>{expired?'scaduta':`${days} gg`}</small>}</span><span><UsersRound/><b>{dealer.members.active}</b> attivi / {dealer.members.total}</span></div><div className="owner-dealer-actions"><button className="support" disabled={action===`support-${dealer.id}`} onClick={onSupport}><DoorOpen/>{action===`support-${dealer.id}`?'Apertura…':'Entra come supporto'}</button><button onClick={onDetail}>Dettagli<ChevronRight/></button><button className={dealer.status==='ACTIVE'?'suspend':'reactivate'} disabled={action===`dealer-${dealer.id}`} onClick={onToggle}>{dealer.status==='ACTIVE'?<><PauseCircle/>Sospendi</>:<><PlayCircle/>Riattiva</>}</button></div></article>
}

function OwnerDealerDrawer({detail,busyKey,credentials,newMemberOpen,onClose,onToggleNew,onCredentials,onRefresh,onRun}:{detail:OwnerDealerDetail;busyKey:string;credentials:Credentials|null;newMemberOpen:boolean;onClose:()=>void;onToggleNew:()=>void;onCredentials:(v:Credentials|null)=>void;onRefresh:()=>void;onRun:(key:string,fn:()=>Promise<unknown>,reload?:boolean)=>Promise<void>}){
  const [draft,setDraft]=useState({display_name:'',email:'',username:'',role:'VENDITORE' as Role})
  const dealer=detail.dealer
  const create=async(e:FormEvent)=>{e.preventDefault();await onRun('member-create',async()=>{const result=await createOwnerMember(dealer.id,draft);onCredentials({dealerSlug:dealer.slug,displayName:draft.display_name,username:draft.username,tempPassword:result.temp_password});setDraft({display_name:'',email:'',username:'',role:'VENDITORE'});onToggleNew();onRefresh()},false)}
  return <aside className="owner-drawer" role="dialog" aria-modal="true"><header><div><p className="eyebrow">DETTAGLIO CLIENTE</p><h2>{dealer.display_name||dealer.slug}</h2><span>Codice {dealer.slug} · {detail.members.filter(m=>m.status==='ACTIVE').length} utenti attivi</span></div><button aria-label="Chiudi dettaglio" onClick={onClose}><X/></button></header>
    {credentials&&<div className="owner-credentials"><KeyRound/><div><b>Accesso temporaneo pronto</b><span>{credentials.displayName} · @{credentials.username}</span><strong>{credentials.tempPassword}</strong></div><button onClick={()=>void navigator.clipboard.writeText(`Dealer Cockpit\nCodice concessionaria: ${credentials.dealerSlug}\nUtente: ${credentials.username}\nPassword temporanea: ${credentials.tempPassword}`)}><Copy/>Copia</button><button className="icon" onClick={()=>onCredentials(null)}><X/></button></div>}
    <div className="owner-drawer-toolbar"><h3>Utenti</h3><button onClick={onToggleNew}><Plus/>{newMemberOpen?'Chiudi':'Nuovo dipendente'}</button></div>
    {newMemberOpen&&<form className="owner-member-form" onSubmit={create}><input aria-label="NOME OWNER DIPENDENTE" required placeholder="Nome e cognome" value={draft.display_name} onChange={e=>setDraft({...draft,display_name:e.target.value})}/><input aria-label="EMAIL OWNER DIPENDENTE" required type="email" placeholder="email@azienda.it" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/><input aria-label="USERNAME OWNER DIPENDENTE" required minLength={3} placeholder="username" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})}/><select aria-label="RUOLO OWNER DIPENDENTE" value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value as Role})}>{ROLE_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button className="primary" disabled={busyKey==='member-create'}>{busyKey==='member-create'?<RefreshCw className="spin"/>:<Plus/>}Crea accesso</button></form>}
    <div className="owner-member-list">{detail.members.map(member=><OwnerMemberRow key={member.user_id} dealerId={dealer.id} member={member} self={member.user_id===detail.owner_user_id} busy={busyKey===`member-${member.user_id}`} onCredentials={onCredentials} dealerSlug={dealer.slug} onRefresh={onRefresh} onRun={onRun}/>)}</div>
    <div className="owner-audit"><h3>Ultime attività</h3>{detail.audit_logs.slice(0,12).map(log=><div key={log.id}><span>{log.action||'ATTIVITÀ'}</span><time>{fmtDate(log.created_at,true)}</time></div>)}{!detail.audit_logs.length&&<p>Nessuna attività registrata.</p>}</div>
  </aside>
}

function OwnerMemberRow({dealerId,member,self,busy,onCredentials,dealerSlug,onRefresh,onRun}:{dealerId:string;member:AdminMember;self:boolean;busy:boolean;onCredentials:(v:Credentials|null)=>void;dealerSlug:string;onRefresh:()=>void;onRun:(key:string,fn:()=>Promise<unknown>,reload?:boolean)=>Promise<void>}){
  const [role,setRole]=useState<Role>(member.role)
  useEffect(()=>setRole(member.role),[member.role])
  const saveRole=()=>void onRun(`member-${member.user_id}`,async()=>{await updateOwnerMember(dealerId,member,{display_name:member.display_name||member.username,role,status:member.status});onRefresh()},false)
  const toggle=()=>void onRun(`member-${member.user_id}`,async()=>{const next=member.status==='ACTIVE'?'SUSPENDED':'ACTIVE';if(!window.confirm(`${next==='SUSPENDED'?'Sospendere':'Riattivare'} ${member.display_name||member.username}?`))return;await updateOwnerMember(dealerId,member,{display_name:member.display_name||member.username,role:member.role,status:next});onRefresh()},false)
  const reset=()=>void onRun(`member-${member.user_id}`,async()=>{if(!window.confirm(`Generare una nuova password temporanea per ${member.display_name||member.username}?`))return;const r=await resetOwnerMemberPassword(dealerId,member.user_id);onCredentials({dealerSlug,displayName:member.display_name||member.username,username:member.username,tempPassword:r.temp_password});onRefresh()},false)
  return <article className={`owner-member ${member.status!=='ACTIVE'?'suspended':''}`} data-testid={`owner-member-${member.username}`}><div className="owner-member-person"><div>{(member.display_name||member.username).slice(0,1).toUpperCase()}</div><span><b>{member.display_name||member.username}</b><small>{member.email||'Email non disponibile'} · @{member.username}</small><em>Ultimo accesso: {fmtDate(member.last_sign_in_at,true)} {member.force_password_change?'· password da cambiare':''}</em></span><strong>{member.status==='ACTIVE'?'ATTIVO':'SOSPESO'}</strong></div><div className="owner-member-actions"><select value={role} disabled={busy||self} onChange={e=>setRole(e.target.value as Role)}>{ROLE_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button disabled={busy||self||role===member.role} onClick={saveRole}><Check/>Salva ruolo</button>{!self&&<button disabled={busy} onClick={toggle}>{member.status==='ACTIVE'?<PauseCircle/>:<PlayCircle/>}{member.status==='ACTIVE'?'Sospendi':'Riattiva'}</button>}{!self&&<button disabled={busy} onClick={reset}><KeyRound/>Reset accesso</button>}<span className="owner-role-label">{roleLabel(role)}</span></div></article>
}
