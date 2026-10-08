const CLOSED=new Set(['CHIUSO_VINTO','CHIUSO_PERSO']);

function validDate(value){
  const ms=new Date(value||'').getTime();
  return Number.isFinite(ms)?ms:null;
}

function timingLabel(deltaMs){
  const abs=Math.abs(deltaMs),hours=Math.max(1,Math.round(abs/3600000));
  if(deltaMs<0)return hours<24?`Scaduto da ${hours} ${hours===1?'ora':'ore'}`:`Scaduto da ${Math.ceil(hours/24)} giorni`;
  if(deltaMs<=2*3600000)return 'Da fare ora';
  if(deltaMs<=24*3600000)return `Tra ${hours} ${hours===1?'ora':'ore'}`;
  return `Tra ${Math.ceil(hours/24)} giorni`;
}

export function chooseClientFollowup(customers=[],now=new Date()){
  const nowMs=new Date(now).getTime();
  const rows=customers.filter(c=>!c?.deleted_at&&!CLOSED.has(c?.status)&&validDate(c?.next_contact_at)!==null)
    .sort((a,b)=>validDate(a.next_contact_at)-validDate(b.next_contact_at)||String(a.id).localeCompare(String(b.id)));
  if(!rows.length)return {kind:'calm',tone:'calm',eyebrow:'RICHIAMI IN ORDINE',title:'Tutto sotto controllo',detail:'Nessun cliente richiede un contatto programmato.',actionLabel:'',customerId:null};
  const customer=rows[0],delta=validDate(customer.next_contact_at)-nowMs;
  const overdue=delta<0,dueToday=delta<=24*3600000;
  return {
    kind:overdue?'overdue':dueToday?'due':'upcoming',
    tone:overdue?'urgent':dueToday?'today':'upcoming',
    eyebrow:overdue?'RICHIAMO SCADUTO':dueToday?'RICHIAMO PRIORITARIO':'PROSSIMO RICHIAMO',
    title:`${customer.first_name||''} ${customer.last_name||''}`.trim()||'Cliente',
    detail:customer.next_step||'Contatto programmato',
    timing:timingLabel(delta),
    customerId:customer.id,
    actionLabel:'Gestisci richiamo'
  };
}

export function clientContactAction(customer={},vehicleLabel=''){
  const first=String(customer.first_name||'').trim();
  const subject=vehicleLabel?` riguardo ${vehicleLabel}`:'';
  const message=`Ciao${first?` ${first}`:''}, ti contatto da MALÙ23 CARS${subject}. Quando possiamo sentirci?`;
  const phone=String(customer.phone||'').replace(/\D/g,'');
  if(phone)return {kind:'whatsapp',label:'Apri WhatsApp',href:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`};
  const email=String(customer.email||'').trim();
  if(email)return {kind:'email',label:'Scrivi email',href:`mailto:${email}?subject=${encodeURIComponent('MALÙ23 CARS · Richiamo')}`};
  return {kind:'missing',label:'Aggiungi un contatto',href:''};
}

export function snoozeUntil(now=new Date(),hours=24){
  const base=new Date(now);if(!Number.isFinite(base.getTime()))throw new TypeError('invalid_date');
  return new Date(base.getTime()+Math.max(1,Number(hours)||24)*3600000).toISOString();
}
