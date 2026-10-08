const ACTIVE_STOCK=new Set(['IN_ARRIVO','DA_CONTROLLARE','IN_PREPARAZIONE','DA_FOTOGRAFARE','DA_PUBBLICARE','IN_VENDITA']);

export function stockDays(vehicle,now=new Date()){
  const raw=vehicle?.purchase_date||vehicle?.created_at;
  if(!raw)return 0;
  const time=new Date(raw).getTime();
  return Number.isFinite(time)?Math.max(0,Math.floor((now.getTime()-time)/86400000)):0;
}

function roundHundred(value){return Math.max(0,Math.round(Number(value||0)/100)*100)}
function ceilHundred(value){return Math.max(0,Math.ceil(Number(value||0)/100)*100)}

export function suggestAutoScoutPrice(vehicle,financials=[],costs=[],now=new Date()){
  const finance=financials.find(x=>x.vehicle_id===vehicle?.id)||{};
  const extras=costs.filter(x=>x.vehicle_id===vehicle?.id).reduce((sum,x)=>sum+Number(x.amount||0),0);
  const investment=Number(finance.purchase_price||0)+extras;
  const current=Number(vehicle?.asking_price||vehicle?.sale_price||0);
  const minimum=Math.max(Number(finance.minimum_price||0),investment?investment+1500:0);
  const days=stockDays(vehicle,now);
  const discount=days>=90?.05:days>=60?.03:days>=30?.02:0;
  let suggested=current;
  let reason=days>=30?'Rinfresca l’annuncio senza perdere margine.':'Prezzo stabile: aggiorna foto e descrizione.';
  if(!current){suggested=ceilHundred(Math.max(minimum,investment*1.18));reason='Manca il prezzo: proposta prudente sopra il costo reale.'}
  else if(current<minimum){suggested=ceilHundred(minimum);reason='Il prezzo attuale è sotto la soglia minima impostata.'}
  else if(discount){suggested=Math.max(ceilHundred(minimum),roundHundred(current*(1-discount)));reason=`Stock da ${days} giorni: riduzione controllata del ${Math.round(discount*100)}%.`}
  return {days,current,suggested,investment,minimum,margin:suggested-investment,discount,reason};
}

export function chooseAutoScoutPriority({vehicles=[],financials=[],costs=[]}={},now=new Date()){
  const rows=vehicles.filter(v=>!v.deleted_at&&ACTIVE_STOCK.has(v.status)).map(vehicle=>({vehicle,advice:suggestAutoScoutPrice(vehicle,financials,costs,now)})).sort((a,b)=>b.advice.days-a.advice.days||String(a.vehicle.brand||'').localeCompare(String(b.vehicle.brand||'')));
  if(!rows.length)return {kind:'calm',tone:'calm',eyebrow:'STOCK SOTTO CONTROLLO',title:'Nessuna auto da pubblicare',detail:'Il Garage non contiene veicoli disponibili per AutoScout.',action:{kind:'none',label:''},vehicleId:null};
  const top=rows[0],name=`${top.vehicle.brand||''} ${top.vehicle.model||''}`.trim();
  return {kind:top.advice.days>=60?'urgent':top.advice.days>=30?'due':'ready',tone:top.advice.days>=60?'urgent':top.advice.days>=30?'attention':'ready',eyebrow:top.advice.days>=60?'STOCK FERMO · AGISCI ORA':'PROSSIMO ANNUNCIO',title:name||'Auto da pubblicare',detail:top.advice.reason,timing:`${top.advice.days} giorni in stock`,price:top.advice.suggested,margin:top.advice.margin,vehicleId:top.vehicle.id,action:{kind:'prepare_listing',label:'Prepara annuncio'}};
}

export function buildAutoScoutCopy(vehicle,advice,{photoCount=0}={}){
  const name=[vehicle?.brand,vehicle?.model,vehicle?.version].filter(Boolean).join(' ');
  const lines=[name||'Veicolo usato',vehicle?.year?`Anno: ${vehicle.year}`:null,Number(vehicle?.mileage||0)?`Chilometri: ${Number(vehicle.mileage).toLocaleString('it-IT')} km`:null,advice?.suggested?`Prezzo: ${Number(advice.suggested).toLocaleString('it-IT')} €`:null,vehicle?.notes?`Note: ${String(vehicle.notes).trim()}`:null,'Disponibile presso MALÙ23 CARS. Contattaci per informazioni e appuntamento.'];
  return {title:name||'Veicolo usato',text:lines.filter(Boolean).join('\n'),photoCount:Number(photoCount||0),ready:Boolean(name&&vehicle?.year&&vehicle?.mileage&&advice?.suggested),missing:[!name?'marca e modello':null,!vehicle?.year?'anno':null,!vehicle?.mileage?'chilometri':null,!advice?.suggested?'prezzo':null,!photoCount?'foto':null].filter(Boolean)};
}
