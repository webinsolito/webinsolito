// Runtime configuration for GestionaleJo.
// Public values only. NEVER place service_role, bot token or admin secrets here.
window.DEALER_CONFIG = Object.freeze({
  version: '1.9.3',
  supabaseUrl: 'https://jnofezlhptbrkoxhdenx.supabase.co',
  supabasePublishableKey: 'sb_publishable_m5NZjT_wkqfbMLT1kN7kJg_U9u8YzDR',
  workerUrl: 'https://jnofezlhptbrkoxhdenx.supabase.co/functions/v1/gestionalejo-router',
  defaultDealerSlug: 'malu23',
  demoMode: false
});

// Shared readability/touch layer. Loaded from the same origin and contains no user data.
try{
  if(!document.querySelector('link[data-m23-readability]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='./readability.css?v=1.9.3';link.dataset.m23Readability='1';
    document.head.appendChild(link);
  }
}catch{}

try{
  const raw=localStorage.getItem('dealer-platform-session');
  const saved=raw?JSON.parse(raw):null;
  if(saved?.profile?.force_password_change===true){
    sessionStorage.setItem('dealer-platform-forced-session',raw);
    localStorage.removeItem('dealer-platform-session');
  }
}catch{}

window.DEALER_SECURITY_READY=Promise.all([
  import('./account-security.js?v=1.6.6'),
  import('./session-security.js?v=1.9.0')
]).catch(err=>{console.warn('Sicurezza locale non caricata completamente',err);throw err});

try{
  const raw=localStorage.getItem('dealer-platform-session');
  const saved=raw?JSON.parse(raw):null;
  const staleDemo=!window.DEALER_CONFIG.demoMode&&(saved?.access_token==='demo'||saved?.dealer?.id==='demo-malu23');
  if(staleDemo){
    localStorage.removeItem('dealer-platform-session');
    sessionStorage.setItem('gestionalejo-session-reset','1');
  }
}catch{
  localStorage.removeItem('dealer-platform-session');
}

window.addEventListener('DOMContentLoaded',async()=>{
  try{await window.DEALER_SECURITY_READY}catch{
    const msg=document.getElementById('loginMsg');
    if(msg)msg.textContent='Controllo sicurezza locale non completato. Ricarica la pagina.';
    return;
  }
  const demo=document.getElementById('demoBtn');if(demo)demo.hidden=true;
  if(sessionStorage.getItem('gestionalejo-session-reset')==='1'){
    const msg=document.getElementById('loginMsg');
    if(msg)msg.textContent='Sessione demo rimossa. Accedi a MALÙ23 per caricare i dati reali.';
    sessionStorage.removeItem('gestionalejo-session-reset');
  }
  const legacy=document.getElementById('clientList');
  if(legacy&&!document.getElementById('clientsApp')){
    const root=document.createElement('div');root.id='clientsApp';legacy.hidden=true;legacy.before(root);
  }
  import('./clients.js?v=1.6.1').catch(err=>console.warn('CRM Clienti non caricato',err));
  import('./calendar.js?v=1.6.1').catch(err=>console.warn('Calendario non caricato',err));
  import('./documents.js?v=1.6.1').catch(err=>console.warn('Documenti non caricato',err));
  import('./contracts.js?v=1.6.1').catch(err=>console.warn('Contratti non caricato',err));
  import('./invoices.js?v=1.6.1').catch(err=>console.warn('Fatture non caricate',err));
  import('./sales.js?v=1.6.1').catch(err=>console.warn('Vendite non caricate',err));
  import('./finances.js?v=1.6.1').catch(err=>console.warn('Finanze non caricate',err));
  import('./autoscout.js?v=1.6.2').catch(err=>console.warn('AutoScout non caricato',err));
  import('./autoscout-safety.js?v=1.6.3').catch(err=>console.warn('Controllo qualità AutoScout non caricato',err));
  import('./instagram.js?v=1.6.1').catch(err=>console.warn('Instagram non caricato',err));
  import('./instagram-safety.js?v=1.6.4').catch(err=>console.warn('Controllo qualità Instagram non caricato',err));
  import('./reports.js?v=1.6.5').catch(err=>console.warn('Report non caricati',err));
  import('./admin.js?v=1.6.1').catch(err=>console.warn('Admin non caricato',err));
  import('./admin-safety.js?v=1.6.6').catch(err=>console.warn('Sicurezza Admin non caricata',err));
  import('./backup.js?v=1.6.1').catch(err=>console.warn('Backup non caricato',err));
  import('./data-quality.js?v=1.9.2').catch(err=>console.warn('Controllo qualità dati non caricato',err));
  import('./operational-quality.js?v=1.9.3').catch(err=>console.warn('Controlli operativi non caricati',err));
  import('./mobile-shell.js?v=1.9.3').catch(err=>console.warn('Navigazione mobile non caricata',err));
});
