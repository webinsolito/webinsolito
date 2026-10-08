import {passwordPolicy} from './admin-policy.js';

const SESSION_KEY='dealer-platform-session';

export function forcedPasswordSession(storage){
  try{
    const raw=storage?.getItem?.(SESSION_KEY);if(!raw)return null;
    const session=JSON.parse(raw);return session?.profile?.force_password_change===true?session:null;
  }catch{return null}
}

export function updateForcedPasswordSession(storage,session){
  const next={...session,profile:{...(session?.profile||{}),force_password_change:false}};
  storage.setItem(SESSION_KEY,JSON.stringify(next));
  return next;
}

function config(){return window.DEALER_CONFIG||{}}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function submitPassword(session,password){
  const policy=passwordPolicy(password);if(!policy.ok)throw new Error('password_policy');
  const c=config();if(!c.workerUrl)throw new Error('worker_not_configured');
  const res=await fetch(`${c.workerUrl}/account/change-password`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`,'x-dealer-id':session.dealer?.id||''},body:JSON.stringify({password})});
  const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}
  if(!res.ok)throw new Error(data.error||`http_${res.status}`);
  updateForcedPasswordSession(localStorage,session);return data;
}

function renderGate(session){
  if(document.getElementById('forcedPasswordGate'))return;
  document.documentElement.dataset.forcePasswordChange='1';
  const style=document.createElement('style');style.id='forcedPasswordGateStyle';style.textContent=`html[data-force-password-change="1"] #appShell,html[data-force-password-change="1"] #loginScreen{visibility:hidden!important;pointer-events:none!important}.fp-gate{position:fixed;inset:0;z-index:10000;background:radial-gradient(circle at 75% 10%,#263959 0,transparent 34%),linear-gradient(145deg,#070b13,#111c30 55%,#0b1220);display:grid;place-items:center;padding:20px;color:#fff}.fp-card{width:min(460px,100%);background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(22px);border-radius:26px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.4)}.fp-card h1{font-size:24px;margin:10px 0 8px}.fp-card p{font-size:11px;line-height:1.6;color:#b7c3d3}.fp-card label{display:grid;gap:6px;margin-top:12px;font-size:8px;font-weight:900;color:#aeb9c9}.fp-card input{width:100%;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px;background:rgba(255,255,255,.1);color:#fff}.fp-actions{display:flex;gap:8px;margin-top:14px}.fp-actions button{border:0;border-radius:12px;padding:11px 14px;font-weight:900}.fp-save{background:#fff;color:#111827;flex:1}.fp-exit{background:rgba(255,255,255,.1);color:#fff}.fp-msg{min-height:18px;margin-top:10px;font-size:9px;color:#ffb7ba}.fp-rules{margin-top:11px;font-size:9px;color:#91a0b4;line-height:1.55}`;document.head.appendChild(style);
  const gate=document.createElement('div');gate.id='forcedPasswordGate';gate.className='fp-gate';gate.innerHTML=`<div class="fp-card"><div style="font-size:12px;font-weight:1000;color:#e5bd68">MALÙ23 · SICUREZZA ACCOUNT</div><h1>Imposta la tua password</h1><p>Stai usando una password temporanea. Prima di accedere al gestionale devi sostituirla con una password personale.</p><form id="forcedPasswordForm"><label>NUOVA PASSWORD<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label>RIPETI PASSWORD<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><div class="fp-rules">Almeno 12 caratteri, con maiuscola, minuscola, numero e simbolo.</div><div class="fp-actions"><button class="fp-save" type="submit">Salva e continua</button><button class="fp-exit" id="forcedPasswordLogout" type="button">Esci</button></div><div class="fp-msg" id="forcedPasswordMsg"></div></form></div>`;document.body.appendChild(gate);
  document.getElementById('forcedPasswordLogout').onclick=()=>{localStorage.removeItem(SESSION_KEY);location.reload()};
  document.getElementById('forcedPasswordForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,msg=document.getElementById('forcedPasswordMsg'),password=String(new FormData(form).get('password')||''),confirm=String(new FormData(form).get('confirm')||'');if(password!==confirm){msg.textContent='Le due password non coincidono.';return}const policy=passwordPolicy(password);if(!policy.ok){msg.textContent='La password non rispetta tutti i requisiti.';return}const button=form.querySelector('.fp-save');button.disabled=true;msg.textContent='Salvataggio…';try{await submitPassword(session,password);msg.style.color='#8ce0ae';msg.textContent='Password aggiornata. Accesso in corso…';location.reload()}catch(err){button.disabled=false;msg.style.color='';msg.textContent=err.message==='unauthorized'?'Sessione scaduta: esci e accedi di nuovo.':err.message==='password_policy'?'La password non rispetta i requisiti.':'Cambio password non riuscito.'}};
}

export function initForcedPasswordGate(){
  if(typeof window==='undefined'||typeof document==='undefined')return false;
  const session=forcedPasswordSession(localStorage);if(!session)return false;
  const start=()=>renderGate(session);document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();return true;
}

if(typeof window!=='undefined')initForcedPasswordGate();
