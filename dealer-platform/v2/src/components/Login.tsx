import {FormEvent,useState} from 'react'
import {Building2,CarFront,LockKeyhole,UserPlus} from 'lucide-react'
import {loginWithAccess} from '../lib/accessApi'
import type {SessionPayload} from '../types'
import {RegistrationFlow} from './RegistrationFlow'

const initialDealer=()=>{
  const fromUrl=new URLSearchParams(window.location.search).get('dealer')?.trim().toLowerCase()
  if(fromUrl)return fromUrl
  return (localStorage.getItem('dealer-platform-last-dealer')||'').trim().toLowerCase()
}

const initialMode=()=>localStorage.getItem('dealer-cockpit-registration')?'register':'login'

export function Login({onLogin}:{onLogin:(session:SessionPayload,currentPassword?:string)=>void}){
  const [mode,setMode]=useState<'login'|'register'>(initialMode)
  const [dealerSlug,setDealerSlug]=useState(initialDealer)
  const [identifier,setIdentifier]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('')
    try{
      const slug=dealerSlug.trim().toLowerCase()
      const currentPassword=password
      const session=await loginWithAccess(identifier,currentPassword,slug)
      localStorage.setItem('dealer-platform-last-dealer',slug)
      setPassword('')
      onLogin(session,currentPassword)
    }catch(err){setError(err instanceof Error?err.message:'Accesso non riuscito')}finally{setBusy(false)}
  }

  if(mode==='register')return <main className="login-page"><RegistrationFlow onBack={()=>setMode('login')} onLogin={session=>onLogin(session)}/></main>

  return <main className="login-page"><section className="login-card"><div className="login-mark"><CarFront/></div><p className="eyebrow">DEALER COCKPIT</p><h1>La concessionaria, organizzata.</h1><p className="muted">Garage, clienti, appuntamenti e vendite nello stesso spazio. Ogni concessionaria accede solo ai propri dati.</p><form onSubmit={submit}><label>CODICE CONCESSIONARIA<div className="login-field-icon"><Building2 size={16}/><input aria-label="CODICE CONCESSIONARIA" autoCapitalize="none" autoCorrect="off" value={dealerSlug} onChange={e=>setDealerSlug(e.target.value)} required placeholder="es. autosalone-rossi"/></div></label><label>UTENTE O EMAIL<input aria-label="UTENTE O EMAIL" autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} required placeholder="nome utente"/></label><label>PASSWORD<input aria-label="PASSWORD" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••••••"/></label>{error&&<div className="error-box"><LockKeyhole size={16}/>{error}</div>}<button className="primary" disabled={busy}>{busy?'Accesso…':'Entra'}</button></form><div className="login-mode-switch"><button type="button" onClick={()=>setMode('register')}><UserPlus size={16}/> Registra concessionaria</button></div><p className="login-hint">Il codice concessionaria può essere precompilato nel link di accesso.</p></section></main>
}
