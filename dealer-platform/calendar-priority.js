function validTime(value){const ms=new Date(value||'').getTime();return Number.isFinite(ms)?ms:null}

function timing(deltaMs){
  const abs=Math.abs(deltaMs),minutes=Math.max(1,Math.round(abs/60000));
  if(deltaMs<0)return minutes<60?`Scaduto da ${minutes} min`:`Scaduto da ${Math.ceil(minutes/60)} ore`;
  if(deltaMs<=60*60000)return minutes<=5?'Adesso':`Tra ${minutes} min`;
  if(deltaMs<=24*3600000)return `Tra ${Math.ceil(deltaMs/3600000)} ore`;
  return `Tra ${Math.ceil(deltaMs/86400000)} giorni`;
}

export function calendarAction(event={}){
  if(event.customer_id)return {kind:'open_customer',label:'Apri cliente'};
  if(event.vehicle_id)return {kind:'open_vehicle',label:'Apri auto'};
  if(!event.virtual)return {kind:'complete',label:'Segna fatto'};
  return {kind:'none',label:''};
}

export function chooseCalendarPriority(events=[],now=new Date()){
  const nowMs=new Date(now).getTime();
  const rows=events.filter(e=>!['DONE','CANCELLED'].includes(e?.status)&&validTime(e?.starts_at)!==null)
    .sort((a,b)=>validTime(a.starts_at)-validTime(b.starts_at)||(Number(b.priority==='HIGH')-Number(a.priority==='HIGH')));
  if(!rows.length)return {kind:'calm',tone:'calm',eyebrow:'AGENDA IN ORDINE',title:'Nessuna scadenza aperta',detail:'Il calendario non richiede azioni.',timing:'',eventId:null,action:{kind:'none',label:''}};
  const event=rows[0],delta=validTime(event.starts_at)-nowMs,overdue=delta<0,withinDay=delta<=86400000;
  return {
    kind:overdue?'overdue':withinDay?'today':'upcoming',tone:overdue?'urgent':withinDay?'today':'upcoming',
    eyebrow:overdue?'SCADENZA SUPERATA':withinDay?'PROSSIMA AZIONE':'PROSSIMO IMPEGNO',
    title:event.title||'Impegno',detail:[event.event_type,event.priority==='HIGH'?'Priorità alta':''].filter(Boolean).join(' · '),
    timing:timing(delta),eventId:event.id,action:calendarAction(event)
  };
}
