const DAY=86_400_000;

function dayStart(value){const d=new Date(value);d.setHours(0,0,0,0);return d.getTime()}
function active(rows=[]){return rows.filter(row=>row&&!row.deleted_at)}
function balance(invoice){return Math.max(0,Number(invoice.total_amount||0)-Number(invoice.paid_amount||0))}

export function chooseTodayPriority(data={},now=new Date()){
  const nowMs=new Date(now).getTime(),today=dayStart(nowMs),tomorrow=today+2*DAY,soon=today+4*DAY;
  const invoices=active(data.invoices).filter(i=>i.invoice_type==='SALE'&&i.payment_status!=='PAID'&&balance(i)>0);
  const overdueInvoices=invoices.filter(i=>i.due_date&&dayStart(`${i.due_date}T12:00:00`)<today);
  const overdueAmount=overdueInvoices.reduce((sum,i)=>sum+balance(i),0);
  if(overdueInvoices.length)return {tone:'money',icon:'€',eyebrow:'INCASSO PRIORITARIO',title:`${overdueInvoices.length} ${overdueInvoices.length===1?'incasso scaduto':'incassi scaduti'}`,subtitle:'Recupera prima i saldi già oltre la scadenza.',meta:overdueAmount,metaLabel:'da incassare',action:'Apri fatture',view:'fatture'};

  const callbacks=active(data.customers).filter(c=>c.next_contact_at&&new Date(c.next_contact_at).getTime()<=tomorrow);
  if(callbacks.length)return {tone:'call',icon:'↗',eyebrow:'CONTATTO PRIORITARIO',title:`${callbacks.length} ${callbacks.length===1?'cliente da richiamare':'clienti da richiamare'}`,subtitle:callbacks.length===1?(callbacks[0].next_step||'Chiudi il prossimo passo senza rimandare.'):'Parti dai contatti con il prossimo passo più vicino.',meta:callbacks.length,metaLabel:callbacks.length===1?'richiamo pronto':'richiami pronti',action:'Apri clienti',view:'clients'};

  const deliveries=active(data.vehicles).filter(v=>v.status==='DA_CONSEGNARE');
  if(deliveries.length)return {tone:'delivery',icon:'✓',eyebrow:'CONSEGNA PRIORITARIA',title:`${deliveries.length} ${deliveries.length===1?'auto da consegnare':'auto da consegnare'}`,subtitle:'Controlla documenti, saldo e checklist prima dell’appuntamento.',meta:deliveries.length,metaLabel:deliveries.length===1?'consegna aperta':'consegne aperte',action:'Apri vendite',view:'vendite'};

  const dueInvoices=invoices.filter(i=>i.due_date&&dayStart(`${i.due_date}T12:00:00`)>=today&&dayStart(`${i.due_date}T12:00:00`)<soon);
  const dueAmount=dueInvoices.reduce((sum,i)=>sum+balance(i),0);
  if(dueInvoices.length)return {tone:'money',icon:'€',eyebrow:'INCASSO IN ARRIVO',title:`${dueInvoices.length} ${dueInvoices.length===1?'saldo in scadenza':'saldi in scadenza'}`,subtitle:'Verifica l’incasso prima che diventi insoluto.',meta:dueAmount,metaLabel:'da incassare',action:'Apri fatture',view:'fatture'};

  const overdueWorks=active(data.workItems).filter(w=>!['DONE','CANCELLED'].includes(w.status)&&w.due_date&&dayStart(`${w.due_date}T12:00:00`)<today);
  if(overdueWorks.length)return {tone:'work',icon:'!',eyebrow:'LAVORO PRIORITARIO',title:`${overdueWorks.length} ${overdueWorks.length===1?'lavoro in ritardo':'lavori in ritardo'}`,subtitle:'Sblocca l’auto più urgente e aggiorna la checklist.',meta:overdueWorks.length,metaLabel:overdueWorks.length===1?'attività aperta':'attività aperte',action:'Apri garage',view:'garage'};

  return {tone:'calm',icon:'✓',eyebrow:'TUTTO SOTTO CONTROLLO',title:'Nessuna urgenza',subtitle:'Puoi dedicarti allo stock e alle nuove opportunità.',meta:active(data.vehicles).length,metaLabel:'auto in parco',action:'Apri garage',view:'garage'};
}

