const DAY=86_400_000;
const active=rows=>(rows||[]).filter(row=>row&&!row.deleted_at);
const moneyValue=v=>Math.max(0,Number(v||0));

function localDayKey(value){
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function when(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.getTime():Number.POSITIVE_INFINITY}
function shortDate(value){
  if(!value)return '';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function shortTime(value){
  if(!value)return '';
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function customerName(customer){return customer?`${customer.first_name||''} ${customer.last_name||''}`.trim():''}
function vehicleName(vehicle){return vehicle?`${vehicle.brand||''} ${vehicle.model||''}${vehicle.plate?` · ${vehicle.plate}`:''}`.trim():''}

export function buildTodayActions(data={},now=new Date(),{includeFinance=true,limit=6}={}){
  const today=localDayKey(now),nowMs=new Date(now).getTime(),actions=[];
  const vehicles=active(data.vehicles),customers=active(data.customers),contracts=active(data.contracts),workItems=active(data.workItems),calendar=active(data.calendarEvents),invoices=includeFinance?active(data.invoices):[];
  const byCustomer=new Map(customers.map(c=>[c.id,c])),byVehicle=new Map(vehicles.map(v=>[v.id,v]));

  const overdue=invoices.filter(i=>i.invoice_type==='SALE'&&i.payment_status!=='PAID'&&moneyValue(i.total_amount)-moneyValue(i.paid_amount)>0&&i.due_date&&String(i.due_date).slice(0,10)<today);
  if(overdue.length){
    const amount=overdue.reduce((sum,i)=>sum+Math.max(0,moneyValue(i.total_amount)-moneyValue(i.paid_amount)),0);
    actions.push({kind:'invoice',priority:100,title:`${overdue.length} ${overdue.length===1?'saldo scaduto':'saldi scaduti'}`,detail:`€ ${Math.round(amount).toLocaleString('it-IT')} da recuperare`,view:'fatture'});
  }

  customers.filter(c=>c.next_contact_at&&when(c.next_contact_at)<=nowMs+DAY&&localDayKey(c.next_contact_at)<=today)
    .sort((a,b)=>when(a.next_contact_at)-when(b.next_contact_at)).slice(0,3).forEach(c=>{
      actions.push({kind:'callback',priority:90,title:`Richiama ${customerName(c)||'cliente'}`,detail:c.next_step||'Definisci il prossimo passo',view:'clients',customerId:c.id,at:c.next_contact_at});
    });

  calendar.filter(e=>!['DONE','CANCELLED'].includes(e.status)&&e.starts_at&&localDayKey(e.starts_at)===today)
    .sort((a,b)=>when(a.starts_at)-when(b.starts_at)).slice(0,3).forEach(e=>{
      actions.push({kind:'calendar',priority:80,title:e.title||'Appuntamento',detail:`Oggi ${shortTime(e.starts_at)}`,view:'calendar',customerId:e.customer_id||null,vehicleId:e.vehicle_id||null,at:e.starts_at});
    });

  vehicles.filter(v=>v.status==='DA_CONSEGNARE').slice(0,3).forEach(v=>{
    const contract=contracts.filter(c=>c.template_code==='VENDITA'&&c.vehicle_id===v.id&&c.sale_stage!=='CANCELLED').sort((a,b)=>String(b.updated_at||b.contract_date||'').localeCompare(String(a.updated_at||a.contract_date||'')))[0]||null;
    const buyer=contract?byCustomer.get(contract.customer_id):null,planned=contract?.planned_delivery_at;
    actions.push({kind:'delivery',priority:75,title:`Consegna ${vehicleName(v)||'auto'}`,detail:[customerName(buyer),planned?`prevista ${shortDate(planned)}`:'checklist da completare'].filter(Boolean).join(' · '),view:'vendite',vehicleId:v.id,customerId:buyer?.id||null,at:planned||null});
  });

  workItems.filter(w=>!['DONE','CANCELLED'].includes(w.status)&&w.due_date&&String(w.due_date).slice(0,10)<=today)
    .sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))).slice(0,3).forEach(w=>{
      const vehicle=byVehicle.get(w.vehicle_id);
      actions.push({kind:'work',priority:60,title:w.title||'Lavoro da chiudere',detail:vehicleName(vehicle)||'Garage',view:'garage',vehicleId:w.vehicle_id||null,at:w.due_date});
    });

  const dueToday=invoices.filter(i=>i.invoice_type==='SALE'&&i.payment_status!=='PAID'&&Math.max(0,moneyValue(i.total_amount)-moneyValue(i.paid_amount))>0&&String(i.due_date||'').slice(0,10)===today);
  if(dueToday.length&&!overdue.length){
    const amount=dueToday.reduce((sum,i)=>sum+Math.max(0,moneyValue(i.total_amount)-moneyValue(i.paid_amount)),0);
    actions.push({kind:'invoice',priority:55,title:`${dueToday.length} ${dueToday.length===1?'saldo in scadenza':'saldi in scadenza'}`,detail:`€ ${Math.round(amount).toLocaleString('it-IT')} da verificare oggi`,view:'fatture'});
  }

  return actions.sort((a,b)=>b.priority-a.priority||(when(a.at)-when(b.at))).slice(0,Math.max(1,limit));
}

export function garageGlance(vehicle,{contracts=[],customers=[]}={}){
  if(!vehicle)return null;
  const contract=active(contracts).filter(c=>c.template_code==='VENDITA'&&c.vehicle_id===vehicle.id&&c.sale_stage!=='CANCELLED').sort((a,b)=>String(b.updated_at||b.contract_date||'').localeCompare(String(a.updated_at||a.contract_date||'')))[0]||null;
  const customer=contract?active(customers).find(c=>c.id===contract.customer_id)||null:null;
  const price=moneyValue(contract?.price||vehicle.sale_price||vehicle.asking_price);
  const deliveryAt=contract?.delivered_at||contract?.planned_delivery_at||null;
  return {price,status:vehicle.status||'',customerId:customer?.id||contract?.customer_id||null,customer:customerName(customer),deliveryAt,delivered:Boolean(contract?.delivered_at),contractId:contract?.id||null};
}

export function clientGlance(customer,{interactions=[],interests=[],vehicles=[]}={}){
  if(!customer)return null;
  const last=active(interactions).filter(i=>i.customer_id===customer.id).sort((a,b)=>String(b.happened_at||b.created_at||'').localeCompare(String(a.happened_at||a.created_at||'')))[0]||null;
  const interest=active(interests).filter(i=>i.customer_id===customer.id).sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0]||null;
  const vehicle=interest?active(vehicles).find(v=>v.id===interest.vehicle_id)||null:null;
  return {nextStep:String(customer.next_step||'').trim()||'Prossima azione da definire',nextAt:customer.next_contact_at||null,lastContact:last?`${last.type||last.channel||'Contatto'}${last.happened_at||last.created_at?` · ${shortDate(last.happened_at||last.created_at)}`:''}`:'Nessun contatto registrato',vehicleId:vehicle?.id||interest?.vehicle_id||null,vehicle:vehicleName(vehicle)||'Nessuna auto collegata',phone:String(customer.phone||'').trim()};
}
