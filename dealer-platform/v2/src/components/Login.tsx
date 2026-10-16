import {FormEvent,useState} from 'react'
import {Building2,CarFront,LockKeyhole} from 'lucide-react'
import {login} from '../lib/api'
import type {SessionPayload} from '../types'

const initialDealer=()=>{
  const fromUrl=new URLSearchParams(window.location.search).get('dealer')?.trim().toLowerCase()
  if(fromUrl)return fromUrl
  return (localStorage.getItem('dealer-platform-last-dealer')||'').trim().toLowerCase()
}

export function Login({onLogin}:{onLogin:(session:SessionPayload)=>void}){
  const [dealerSlug,setDealerSlug]=useState(initialDealer)
  const [identifier,setIdentifier]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('')
    try{
      const slug=dealerSlug.trim().toLowerCase()
      const session=await login(identifier,password,slug)
      localStorage.setItem('dealer-platform-last-dealer',slug)
      onLogin(session)
    }catch(err){setError(err instanceof Error?err.message:'Accesso non riuscito')}finally{setBusy(false)}
  }
  return <main className="login-page"><section className="login-card"><div className="login-mark"><CarFront/></div><p className="eyebrow">DEALER COCKPIT</p><h1>La concessionaria, organizzata.</h1><p className="muted">Garage, clienti, appuntamenti e vendite nello stesso spazio. Ogni concessionaria accede solo ai propri dati.</p><form onSubmit={submit}><label>CODICE CONCESSIONARIA<div className="login-field-icon"><Building2 size={16}/><input aria-label="CODICE CONCESSIONARIA" autoCapitalize="none" autoCorrect="off" value={dealerSlug} onChange={e=>setDealerSlug(e.target.value)} required placeholder="es. autosalone-rossi"/></div></label><label>UTENTE O EMAIL<input autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} required placeholder="nome utente"/></label><label>PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••••••"/></label>{error&&<div className="error-box"><LockKeyhole size={16}/>{error}</div>}<button className="primary" disabled={busy}>{busy?'Accesso…':'Entra'}</button></form><p className="login-hint">Il codice concessionaria può essere precompilato nel link di accesso.</p></section></main>
}
