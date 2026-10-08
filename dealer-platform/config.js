// Runtime configuration for Dealer Platform.
// Public values only. NEVER place service_role, bot token or admin secrets here.
window.DEALER_CONFIG = Object.freeze({
  version: '1.5.2',
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
  import('./clients.js?v=1.5.2').catch(err=>console.warn('CRM Clienti non caricato',err));
  import('./calendar.js?v=1.5.2').catch(err=>console.warn('Calendario non caricato',err));
  import('./documents.js?v=1.5.2').catch(err=>console.warn('Documenti non caricato',err));
  import('./contracts.js?v=1.5.2').catch(err=>console.warn('Contratti non caricato',err));
  import('./invoices.js?v=1.5.2').catch(err=>console.warn('Fatture non caricate',err));
  import('./sales.js?v=1.5.2').catch(err=>console.warn('Vendite non caricate',err));
  import('./finances.js?v=1.5.2').catch(err=>console.warn('Finanze non caricate',err));
  import('./autoscout.js?v=1.5.2').catch(err=>console.warn('AutoScout non caricato',err));
  import('./instagram.js?v=1.5.2').catch(err=>console.warn('Instagram non caricato',err));
});
