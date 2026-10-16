import {useEffect,useMemo,useState,type FormEvent} from 'react'
import {ArrowLeft,Check,Copy,KeyRound,Plus,RefreshCw,Search,ShieldCheck,UserRoundCheck,UserRoundX,X} from 'lucide-react'
import {createDealerMember,getAdminOverview,resetDealerMemberPassword,updateDealerMember} from '../lib/adminApi'
import type {AdminMember,AdminOverview,MemberDraft,MemberUpdate,Role,SessionPayload} from '../types'

const ROLE_OPTIONS:[Role,string,string][]=[
  ['VENDITORE','Venditore','Garage, clienti, calendario e vendite. Nessun costo o margine.'],
  ['AMMINISTRAZIONE','Amministrazione','Documenti, fatture, incassi, costi e report.'],
  ['OPERATORE','Operatore','Garage, documenti e calendario operativo.'],
  ['ADMIN','Amministratore','Controllo completo, compresa la gestione utenti.']
]

const blank:MemberDraft={display_name:'',email:'',username:'',role:'VENDITORE'}
const roleLabel=(role:string)=>ROLE_OPTIONS.find(([id])=>id===role)?.[1]||role
const fmtDate=(value?:string|null)=>value?new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Mai'

type Credentials={display_name:string;email:string;username:string;temp_password:string}

export function StaffPage({session,onBack}:{session:SessionPayload;onBack:()=>void}){
  const [overview,setOverview]=useState<AdminOverview|null>(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [newOpen,setNewOpen]=useState(false)
  const [draft,setDraft]=useState<MemberDraft>(blank)
  const [savingNew,setSavingNew]=useState(false)
  const [actionUser,setActionUser]=useState<string|null>(null)
  const [credentials,setCredentials]=useState<Credentials|null>(null)
  const [copied,setCopied]=useState(false)

  const load=async()=>{
    setBusy(true);setError('')
    try{setOverview(await getAdminOverview(session))}
    catch(err){setError(err instanceof Error?err.message:'Impossibile caricare i dipendenti')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  const members=useMemo(()=>{
    const q=query.trim().toLowerCase()
    const rows=overview?.members||[]
    if(!q)return rows
    return rows.filter(m=>[m.display_name,m.username,m.email,roleLabel(m.role)].some(v=>String(v||'').toLowerCase().includes(q)))
  },[overview,query])

  const create=async(e:FormEvent)=>{
    e.preventDefault();setSavingNew(true);setError('')
    try{
      const result=await createDealerMember(session,draft)
      setCredentials({...draft,temp_password:result.temp_password})
      setDraft(blank);setNewOpen(false);await load()
    }catch(err){setError(err instanceof Error?err.message:'Creazione non riuscita')}
    finally{setSavingNew(false)}
  }

  const save=async(member:AdminMember,update:MemberUpdate)=>{
    setActionUser(member.user_id);setError('')
    try{await updateDealerMember(session,member,update);await load()}
    catch(err){setError(err instanceof Error?err.message:'Modifica non riuscita')}
    finally{setActionUser(null)}
  }

  const toggle=async(member:AdminMember)=>{
    const next=member.status==='ACTIVE'?'SUSPENDED':'ACTIVE'
    const verb=next==='SUSPENDED'?'sospendere':'riattivare'
    if(!window.confirm(`Vuoi ${verb} ${member.display_name||member.username}?`))return
    await save(member,{display_name:member.display_name||member.username,role:member.role,status:next})
  }

  const reset=async(member:AdminMember)=>{
    if(!window.confirm(`Generare una nuova password temporanea per ${member.display_name||member.username}? Le sessioni attive verranno chiuse.`))return
    setActionUser(member.user_id);setError('')
    try{
      const result=await resetDealerMemberPassword(session,member.user_id)
      setCredentials({display_name:member.display_name||member.username,email:member.email||'',username:member.username,temp_password:result.temp_password})
      await load()
    }catch(err){setError(err instanceof Error?err.message:'Reset accesso non riuscito')}
    finally{setActionUser(null)}
  }

  const copyCredentials=async()=>{
    if(!credentials)return
    const text=`Dealer Cockpit\nCodice concessionaria: ${session.dealer.slug}\nUtente: ${credentials.username}\nPassword temporanea: ${credentials.temp_password}`
    try{await navigator.clipboard.writeText(text);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}
  }

  if(session.profile.role!=='ADMIN')return <section className="staff-denied"><ShieldCheck/><h1>Area amministratore</h1><p>Solo gli amministratori possono gestire i dipendenti.</p><button onClick={onBack}>Torna indietro</button></section>

  const active=(overview?.members||[]).filter(m=>m.status==='ACTIVE').length
  const suspended=(overview?.members||[]).filter(m=>m.status==='SUSPENDED').length
  const passwordPending=(overview?.members||[]).filter(m=>m.force_password_change&&m.status==='ACTIVE').length

  return <>
    <div className="staff-heading">
      <div className="staff-heading-copy"><button className="staff-back" onClick={onBack}><ArrowLeft/>Altro</button><p className="eyebrow">ACCESSI CONCESSIONARIA</p><h1>Dipendenti</h1><p>Crea gli accessi del team e decidi chi può fare cosa. Le finanze restano sempre escluse per Venditori e Operatori.</p></div>
      <button className="primary staff-new" onClick={()=>setNewOpen(true)}><Plus/>Nuovo dipendente</button>
    </div>

    {error&&<div className="staff-error">{error}<button onClick={()=>void load()}><RefreshCw/>Riprova</button></div>}

    {credentials&&<section className="staff-credentials" data-testid="temporary-credentials">
      <div className="staff-credentials-icon"><KeyRound/></div>
      <div><b>Accesso temporaneo pronto per {credentials.display_name}</b><p>Mostralo o copialo adesso. Al primo ingresso dovrà creare una nuova password.</p><div className="staff-secret"><span>{credentials.username}</span><strong>{credentials.temp_password}</strong></div></div>
      <div className="staff-credentials-actions"><button onClick={()=>void copyCredentials()}>{copied?<Check/>:<Copy/>}{copied?'Copiato':'Copia accesso'}</button><button className="icon-only" aria-label="Chiudi credenziali" onClick={()=>setCredentials(null)}><X/></button></div>
    </section>}

    <div className="staff-stats">
      <article><span>UTENTI ATTIVI</span><strong>{active}</strong><UserRoundCheck/></article>
      <article><span>SOSPESI</span><strong>{suspended}</strong><UserRoundX/></article>
      <article><span>PASSWORD DA CAMBIARE</span><strong>{passwordPending}</strong><KeyRound/></article>
    </div>

    <div className="staff-toolbar"><label><Search/><input aria-label="CERCA DIPENDENTE" placeholder="Cerca nome, email o ruolo…" value={query} onChange={e=>setQuery(e.target.value)}/></label><span>{members.length} {members.length===1?'utente':'utenti'}</span></div>

    {busy&&!overview?<div className="staff-loading"><RefreshCw className="spin"/>Caricamento dipendenti…</div>:<div className="staff-list">
      {members.map(member=><MemberCard key={member.user_id} member={member} self={member.user_id===overview?.current_user_id} busy={actionUser===member.user_id} onSave={update=>void save(member,update)} onToggle={()=>void toggle(member)} onReset={()=>void reset(member)}/>) }
      {!members.length&&<div className="staff-empty">Nessun dipendente trovato.</div>}
    </div>}

    {newOpen&&<div className="staff-modal-backdrop" role="presentation"><section className="staff-modal" role="dialog" aria-modal="true" aria-labelledby="new-member-title">
      <button className="staff-modal-close" aria-label="Chiudi" onClick={()=>setNewOpen(false)}><X/></button>
      <p className="eyebrow">NUOVO ACCESSO</p><h2 id="new-member-title">Aggiungi dipendente</h2><p className="staff-modal-copy">Gli verrà creata una password temporanea e dovrà cambiarla al primo accesso.</p>
      <form onSubmit={create}>
        <label>NOME E COGNOME<input aria-label="NOME DIPENDENTE" required minLength={2} maxLength={80} value={draft.display_name} onChange={e=>setDraft({...draft,display_name:e.target.value})}/></label>
        <label>EMAIL<input aria-label="EMAIL DIPENDENTE" required type="email" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label>
        <label>USERNAME<input aria-label="USERNAME DIPENDENTE" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})}/></label>
        <label>RUOLO<select aria-label="RUOLO DIPENDENTE" value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value as Role})}>{ROLE_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <div className="staff-role-help"><b>{roleLabel(draft.role)}</b><span>{ROLE_OPTIONS.find(([id])=>id===draft.role)?.[2]}</span></div>
        <button className="primary" type="submit" disabled={savingNew}>{savingNew?<><RefreshCw className="spin"/>Creazione…</>:<><Plus/>Crea accesso</>}</button>
      </form>
    </section></div>}
  </>
}

function MemberCard({member,self,busy,onSave,onToggle,onReset}:{member:AdminMember;self:boolean;busy:boolean;onSave:(u:MemberUpdate)=>void;onToggle:()=>void;onReset:()=>void}){
  const [name,setName]=useState(member.display_name||member.username)
  const [role,setRole]=useState<Role>(member.role)
  useEffect(()=>{setName(member.display_name||member.username);setRole(member.role)},[member.display_name,member.username,member.role])
  const dirty=name.trim()!==(member.display_name||member.username)||role!==member.role
  const roleDesc=ROLE_OPTIONS.find(([id])=>id===role)?.[2]
  return <article className={`staff-card ${member.status==='SUSPENDED'?'is-suspended':''}`} data-testid={`member-${member.username}`}>
    <div className="staff-card-main">
      <div className="staff-avatar">{(member.display_name||member.username||'U').slice(0,1).toUpperCase()}</div>
      <div className="staff-person"><div className="staff-person-title"><strong>{member.display_name||member.username}</strong>{self&&<span className="staff-you">TU</span>}<span className={`staff-status ${member.status==='ACTIVE'?'active':'suspended'}`}>{member.status==='ACTIVE'?'ATTIVO':'SOSPESO'}</span></div><span>{member.email||'Email non disponibile'} · @{member.username}</span><small>Ultimo accesso: {fmtDate(member.last_sign_in_at)} {member.telegram_linked?'· Telegram collegato':''}</small></div>
      <div className={`staff-password-state ${member.force_password_change?'pending':'ok'}`}>{member.force_password_change?<><KeyRound/>Deve cambiare password</>:<><Check/>Password aggiornata</>}</div>
    </div>
    <div className="staff-editor">
      <label>NOME<input aria-label={`NOME ${member.username}`} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
      <label>RUOLO<select aria-label={`RUOLO ${member.username}`} value={role} disabled={busy||self} onChange={e=>setRole(e.target.value as Role)}>{ROLE_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <div className="staff-role-desc"><b>{roleLabel(role)}</b><span>{roleDesc}</span></div>
      <div className="staff-card-actions">
        <button className="staff-save" disabled={busy||!dirty||!name.trim()} onClick={()=>onSave({display_name:name.trim(),role,status:member.status})}>{busy?<RefreshCw className="spin"/>:<Check/>}Salva</button>
        {!self&&<button className={member.status==='ACTIVE'?'staff-suspend':'staff-reactivate'} disabled={busy} onClick={onToggle}>{member.status==='ACTIVE'?<><UserRoundX/>Sospendi</>:<><UserRoundCheck/>Riattiva</>}</button>}
        {!self&&<button className="staff-reset" disabled={busy} onClick={onReset}><KeyRound/>Reimposta accesso</button>}
      </div>
    </div>
  </article>
}
