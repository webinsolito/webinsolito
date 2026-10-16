import {FormEvent,useState} from 'react'
import {ArrowLeft,KeyRound,LockKeyhole,ShieldCheck} from 'lucide-react'
import {loginOwner} from '../lib/ownerAuthApi'
import {setSession} from '../lib/api'
import type {SessionPayload} from '../types'

export function OwnerLogin({onLogin,onBack}:{onLogin:(session:SessionPayload)=>void;onBack:()=>void}){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const session=await loginOwner(email,password);setSession(session);setPassword('');onLogin(session)}catch(err){setError(err instanceof Error?err.message:'Accesso proprietario non riuscito')}finally{setBusy(false)}}
  return <main className="login-page owner-login-page"><section className="login-card owner-login-card"><button className="owner-login-back" type="button" onClick={onBack}><ArrowLeft/>Accesso concessionaria</button><div className="login-mark owner-login-mark"><ShieldCheck/></div><p className="eyebrow">OWNER · DEALER COCKPIT</p><h1>Accesso proprietario.</h1><p className="muted">Entra nel pannello centrale senza codice concessionaria. Le password dei clienti non servono mai.</p><form onSubmit={submit}><label>EMAIL PROPRIETARIO<input aria-label="EMAIL PROPRIETARIO" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="email"/></label><label>PASSWORD<input aria-label="PASSWORD PROPRIETARIO" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••••••"/></label>{error&&<div className="error-box"><LockKeyhole size={16}/>{error}</div>}<button className="primary owner-login-submit" disabled={busy}>{busy?<><KeyRound/>Accesso…</>:<><ShieldCheck/>Entra come proprietario</>}</button></form><p className="login-hint">Questo accesso è riservato al proprietario della piattaforma.</p></section></main>
}
