// Runtime configuration for Dealer Platform.
// Public values only. NEVER place service_role, bot token or admin secrets here.
window.DEALER_CONFIG = Object.freeze({
  version: '0.8.0',
  supabaseUrl: '',
  supabasePublishableKey: '',
  workerUrl: '',
  defaultDealerSlug: 'malu23',
  demoMode: true
});

// Keep feature modules isolated from the core app so each section can evolve without regressions.
window.addEventListener('DOMContentLoaded',()=>{
  const legacy=document.getElementById('clientList');
  if(legacy&&!document.getElementById('clientsApp')){
    const root=document.createElement('div');root.id='clientsApp';legacy.hidden=true;legacy.before(root);
  }
  import('./clients.js').catch(err=>console.warn('CRM Clienti non caricato',err));
  import('./calendar.js').catch(err=>console.warn('Calendario non caricato',err));
  import('./documents.js').catch(err=>console.warn('Documenti non caricati',err));
  import('./contracts.js').catch(err=>console.warn('Contratti non caricati',err));
  import('./invoices.js').catch(err=>console.warn('Fatture non caricate',err));
});

