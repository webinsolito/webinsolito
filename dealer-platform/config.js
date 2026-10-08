// Runtime configuration for GestionaleJo.
// Public values only. NEVER place service_role, bot token or admin secrets here.
window.DEALER_CONFIG = Object.freeze({
  version: '1.6.1',
  supabaseUrl: 'https://jnofezlhptbrkoxhdenx.supabase.co',
  supabasePublishableKey: 'sb_publishable_m5NZjT_wkqfbMLT1kN7kJg_U9u8YzDR',
  workerUrl: 'https://jnofezlhptbrkoxhdenx.supabase.co/functions/v1/gestionalejo-router',
  defaultDealerSlug: 'malu23',
  demoMode: false
});

// A legacy demo session must never survive once the real backend is enabled.
// Otherwise the PWA keeps showing the three local demo cars and every live request uses demo-malu23.
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

// Keep feature modules isolated from the core app so each section can evolve without regressions.
window.addEventListener('DOMContentLoaded',()=>{
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
  import('./autoscout.js?v=1.6.1').catch(err=>console.warn('AutoScout non caricato',err));
  import('./instagram.js?v=1.6.1').catch(err=>console.warn('Instagram non caricato',err));
  import('./reports.js?v=1.6.1').catch(err=>console.warn('Report non caricati',err));
  import('./admin.js?v=1.6.1').catch(err=>console.warn('Admin non caricato',err));
  import('./backup.js?v=1.6.1').catch(err=>console.warn('Backup non caricato',err));
  import('./data-quality.js?v=1.6.2').catch(err=>console.warn('Controllo qualità dati non caricato',err));
});

