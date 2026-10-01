import {VERSION,APP_VERSION,scan,fixtures,decisionModel,autoCostPreset,stageLabel,COST_KEYS,COST_LABELS,DEEP_FIELDS,DEEP_LABELS} from './core.mjs?v=2.4.0';

const $=id=>document.getElementById(id);
let cars=[],filter='shortlist',selected=null,connected=false,currentDecision=null,currentSource='NESSUNA SCANSIONE',persistTimer=null;
const money=n=>n===null||n===undefined?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
const pct=n=>n===null||n===undefined?'—':new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(n)+'%';
const integer=n=>n===null||n===undefined?'—':Math.round(n).toLocaleString('it-IT');
const numeric=id=>$(id).value.trim()===''?null:Number($(id).value);
const setStep=(id,state)=>{$(id).dataset.state=state||''};

function buildCosts(){
 const grid=$('costGrid');
 for(const key of COST_KEYS){const label=document.createElement('label'),title=document.createElement('span'),origin=document.createElement('small'),input=document.createElement('input');title.textContent=COST_LABELS[key];origin.id='origin-'+key;origin.className='cost-origin';input.id='cost-'+key;input.type='number';input.min='0';input.step='0.01';input.inputMode='decimal';input.addEventListener('input',()=>{if(!selected)return;selected._costOrigins??={};selected._costOrigins[key]='manuale';renderCostOrigins()});label.append(title,origin,input);grid.append(label)}
}
function renderCostOrigins(){for(const key of COST_KEYS){const el=$('origin-'+key),origin=selected?._costOrigins?.[key]||'';el.textContent=origin?origin.toUpperCase():'';el.dataset.origin=origin}}
buildCosts();

function evidence(){
 const grid=$('evidenceGrid');grid.replaceChildren();
 if(!selected){$('deepState').textContent='—';return}
 let known=0;
 for(const key of DEEP_FIELDS){const item=document.createElement('div'),k=document.createElement('span'),v=document.createElement('strong');k.textContent=DEEP_LABELS[key];const value=selected[key];if(value!==null&&value!==undefined&&value!==''){known++;v.textContent=String(value)}else{v.textContent='UNKNOWN';v.className='unknown'}item.append(k,v);grid.append(item)}
 $('deepState').textContent=known===DEEP_FIELDS.length?'Completo':known+'/'+DEEP_FIELDS.length+' verificati';
 setStep('step-deep',known===DEEP_FIELDS.length?'ok':known?'review':'');
}

function comparableRows(){
 return [1,2,3,4,5].map(i=>({price:numeric('comp'+i+'Price'),km:numeric('comp'+i+'Km'),year:numeric('comp'+i+'Year')}));
}
function inputs(){
 return {currentBid:numeric('currentBid'),resale:numeric('resale'),desiredMargin:numeric('margin'),comparables:comparableRows(),damage:{state:$('damageState').value,estimate:numeric('damageEstimate')},costs:Object.fromEntries(COST_KEYS.map(k=>[k,numeric('cost-'+k)])),costOrigins:{...(selected?._costOrigins||{})}};
}
function clearInputs(){
 for(const id of ['currentBid','resale','margin','damageEstimate'])$(id).value='';
 $('damageState').value='unknown';
 for(let i=1;i<=5;i++)for(const s of ['Price','Km','Year'])$('comp'+i+s).value='';
 for(const k of COST_KEYS){$('cost-'+k).value='';$('origin-'+k).textContent='';$('origin-'+k).dataset.origin=''}
}
function fillComparables(rows=[]){
 for(let i=1;i<=5;i++){const row=rows[i-1]||{};$('comp'+i+'Price').value=row.price??'';$('comp'+i+'Km').value=row.km??'';$('comp'+i+'Year').value=row.year??''}
}
function fillAnalysis(source={}){
 if(source.currentBid!==null&&source.currentBid!==undefined)$('currentBid').value=source.currentBid;
 if(source.resale!==null&&source.resale!==undefined)$('resale').value=source.resale;
 if(source.desiredMargin!==null&&source.desiredMargin!==undefined)$('margin').value=source.desiredMargin;
 fillComparables(source.comparables||[]);
 for(const [k,v] of Object.entries(source.costs||{}))if($('cost-'+k)&&v!==null&&v!==undefined)$('cost-'+k).value=v;
 if(selected){selected._costOrigins={...(selected._costOrigins||{}),...(source.costOrigins||{})};renderCostOrigins()}
 const damage=source.damage||{};$('damageState').value=damage.state||selected?.damageState||'unknown';if(damage.estimate!==null&&damage.estimate!==undefined)$('damageEstimate').value=damage.estimate;
}
function refreshCarDecision(car){if(car?._inputs)car._decision=decisionModel(car,car._inputs);return car}

function budget(){
 currentDecision=decisionModel(selected,inputs());
 if(selected){selected._decision=currentDecision;selected._inputs=inputs()}
 const d=currentDecision;
 $('marketMedian').textContent=money(d.market.median);$('marketLow').textContent=money(d.market.low);$('marketHigh').textContent=money(d.market.high);$('marketAvgKm').textContent=d.market.avgKm===null?'—':integer(d.market.avgKm)+' km';$('marketAvgYear').textContent=d.market.avgYear??'—';
 $('costTotal').textContent=money(d.costTotal);$('landedCost').textContent=money(d.landedCost);$('projectedMargin').textContent=money(d.projectedMargin);$('roi').textContent=pct(d.roi);$('maxbid').textContent=money(d.maxBid);
 $('readinessLabel').textContent=d.readiness+'% pronto';$('readinessBar').style.width=d.readiness+'%';$('readinessBar').dataset.ready=d.readiness===100?'true':'false';$('bidHeadroom').textContent=money(d.bidHeadroom);$('bidHeadroom').className=d.bidHeadroom!==null&&d.bidHeadroom<0?'bad':d.bidHeadroom!==null?'good':'';$('marginBuffer').textContent=money(d.marginBuffer);$('marginBuffer').className=d.marginBuffer!==null&&d.marginBuffer<0?'bad':d.marginBuffer!==null?'good':'';$('marketSpread').textContent=pct(d.marketSpreadPct);$('marketSpread').className=d.marketSpreadPct!==null&&d.marketSpreadPct>20?'warn':'';$('decisionBlockers').textContent=d.blockers.length?'Blocchi candidatura: '+d.blockers.join(', '):'Nessun blocco di candidatura rilevato.';$('snapshot').disabled=!selected||d.currentBid===null;$('deepCoverage').textContent=d.deepCoverage+'%';$('stressResale').textContent=money(d.stress.resale);$('stressCosts').textContent=money(d.stress.costTotal);$('stressMargin').textContent=money(d.stress.projectedMargin);$('stressRoi').textContent=pct(d.stress.roi);$('stressMaxBid').textContent=money(d.stress.maxBid);$('stressGate').textContent=d.stress.withinMax===true?'Anche nello scenario prudente il prezzo resta entro il MAX BID.':d.stress.withinMax===false?'Attenzione: nello scenario prudente il prezzo supera il MAX BID.':'Scenario prudente disponibile quando i dati economici sono completi.';$('stressGate').className='hint '+(d.stress.withinMax===false?'bad':d.stress.withinMax===true?'good':'');$('decisionWarnings').hidden=!d.warnings.length;$('decisionWarnings').textContent=d.warnings.length?'Attenzione: '+d.warnings.join(' · '):'';
 $('marketState').textContent=d.market.robust?d.market.count+' comparabili · robusto':d.market.partial?d.market.count+' comparabili · parziale':'Servono 5 comparabili';
 $('costState').textContent=d.costUnknown.length?'Mancano '+d.costUnknown.length:'Completo';
 $('damageStateText').textContent=d.damage.complete?(d.damage.state==='clear'?'Verificato · pulito':'Danni quantificati'):'Da verificare';
 $('purchaseStage').textContent=stageLabel(d.stage);$('purchaseStage').dataset.stage=d.stage;
 setStep('step-market',d.market.robust?'ok':d.market.partial?'review':'');setStep('step-cost',d.costUnknown.length?'review':'ok');setStep('step-damage',d.damage.complete?'ok':'review');setStep('step-decision',d.stage==='buy_candidate'?'ok':d.complete?'review':'');
 $('report').disabled=!d.complete;
 if(d.withinMax===true){$('bidGate').textContent=d.stage==='buy_candidate'?'CANDIDATA: prezzo entro MAX BID':'Prezzo entro MAX BID · completa documenti chiave';$('bidGate').className='good'}else if(d.withinMax===false){$('bidGate').textContent='Prezzo corrente oltre il MAX BID';$('bidGate').className='bad'}else{$('bidGate').textContent='Completa i dati per la decisione.';$('bidGate').className=''}
 const missing=[];
 if(!selected)missing.push('veicolo');if(!d.market.robust)missing.push('5 comparabili mercato');if(d.costUnknown.length)missing.push('costi: '+d.costUnknown.map(k=>COST_LABELS[k]).join(', '));if(!d.damage.complete)missing.push('condition report/danni');if(d.currentBid===null)missing.push('prezzo corrente');if(d.resale===null)missing.push('rivendita');if(d.desiredMargin===null)missing.push('margine obiettivo');
 if(missing.length)$('budgetState').textContent='Da completare: '+missing.join(' · ');
 else if(!d.deep.docsReady)$('budgetState').textContent='Analisi economica completa, ma VIN / COC / regime IVA non sono tutti verificati: non passa ancora a “Candidata all’acquisto”.';
 else if(!d.deep.complete)$('budgetState').textContent='Candidata all’acquisto con alcuni campi deep ancora UNKNOWN: controllali prima dell’acquisto.';
 else $('budgetState').textContent='Analisi completa e verificata · candidata all’acquisto.';
 render();schedulePersist();
}

function render(){
 for(const status of ['shortlist','review','excluded'])$('n-'+status).textContent=cars.filter(c=>c.status===status).length;
 const container=$('cars');container.replaceChildren();const visible=cars.filter(c=>c.status===filter);
 if(!visible.length){const p=document.createElement('div');p.className='empty compact';p.innerHTML='<h3>Nessun veicolo in questa sezione.</h3>';container.append(p)}
 for(const car of visible){
  const card=document.createElement('article');card.className='vehicle'+(selected===car?' selected':'');
  const stage=car._decision?.stage||(car.status==='shortlist'?'filter_ok':car.status);
  const meta=document.createElement('div');meta.className='meta';const id=document.createElement('span');id.textContent=car.id||'ID SCONOSCIUTO';const badge=document.createElement('strong');badge.className='vehicle-stage';badge.dataset.stage=stage;badge.textContent=stageLabel(stage);meta.append(id,badge);
  const title=document.createElement('h3');title.textContent=car.name||'Veicolo senza nome';
  const details=document.createElement('p');details.textContent=(car.km===null||car.km===undefined?'Km sconosciuti':car.km.toLocaleString('it-IT')+' km')+' · '+(car.registered||'Immatricolazione sconosciuta');
  card.append(meta,title,details);
  if(car._decision?.complete){const strip=document.createElement('div');strip.className='car-metrics';strip.innerHTML='<span>Prezzo <b>'+money(car._decision.currentBid)+'</b></span><span>MAX <b>'+money(car._decision.maxBid)+'</b></span><span>Margine <b>'+money(car._decision.projectedMargin)+'</b></span><span>ROI <b>'+pct(car._decision.roi)+'</b></span>';card.append(strip)}
  if(car.reasons?.length){const reason=document.createElement('p');reason.className='reason';reason.textContent=car.reasons.join(' · ');card.append(reason)}
  if(car.status==='shortlist'){const actions=document.createElement('div');actions.className='vehicle-actions';const button=document.createElement('button');button.textContent=selected===car?'Selezionato':'Analizza →';button.onclick=()=>selectCar(car);const reportButton=document.createElement('button');reportButton.className='vehicle-report';reportButton.textContent='Report veicolo';reportButton.onclick=()=>renderReports([car],'shortlist');actions.append(button,reportButton);card.append(actions)}
  container.append(card);
 }
 const shortlist=cars.filter(c=>c.status==='shortlist'),candidates=cars.filter(c=>c._decision?.stage==='buy_candidate');
 $('acceptedReport').disabled=!shortlist.length;$('buyReport').disabled=!candidates.length;renderPurchaseDashboard();
}

function selectCar(car){
 selected=car;$('selected').textContent=car.name||'Veicolo';clearInputs();
 const saved=car._inputs||car.demoDecision||{};
 if(saved.currentBid===undefined&&car.currentBid!==undefined)saved.currentBid=car.currentBid;
 fillAnalysis(saved);applyAutoCosts(false);evidence();budget();
}
function load(rows,source){
 const old=new Map(cars.filter(c=>c.id).map(c=>[c.id,c]));const result=scan(rows);
 cars=result.cars.map(car=>{const prev=old.get(car.id);return refreshCarDecision(prev?{...car,_inputs:prev._inputs}:car)});
 selected=null;clearInputs();currentSource=source;$('selected').textContent='Seleziona un veicolo idoneo.';$('source').textContent=source;$('summary').textContent=rows.length+' record · '+cars.length+' veicoli · '+result.duplicates+' duplicati rimossi';
 setStep('step-scan','ok');setStep('step-shortlist',cars.some(c=>c.status==='shortlist')?'ok':'review');for(const id of ['step-deep','step-damage','step-cost','step-market','step-decision','step-report'])setStep(id,'');
 evidence();render();schedulePersist();
 if(source.startsWith('DEMO')){const first=cars.find(c=>c.status==='shortlist');if(first)selectCar(first)}
}

$('demo').onclick=()=>load(fixtures,'DEMO · DATI FITTIZI · E2E');
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render()});
$('budget').onsubmit=e=>e.preventDefault();$('budget').oninput=budget;
$('damageState').onchange=()=>{if($('damageState').value==='clear'){$('damageEstimate').value=0;$('cost-damage').value=0}else if($('damageState').value==='costed'&&$('damageEstimate').value==='')$('damageEstimate').focus();budget()};
$('damageEstimate').oninput=()=>{if($('damageState').value==='costed')$('cost-damage').value=$('damageEstimate').value;budget()};
function applyAutoCosts(overwrite=false){if(!selected)return 0;const preset=autoCostPreset(selected,numeric('currentBid'));selected._costOrigins??={};let filled=0;for(const [k,v] of Object.entries(preset)){const field=$('cost-'+k);if(v!==null&&v!==undefined&&(overwrite||field.value==='')){field.value=v;selected._costOrigins[k]='stimato';filled++}}if($('damageState').value==='clear'&&(overwrite||$('cost-damage').value==='')){$('cost-damage').value=0;selected._costOrigins.damage='verificato'}renderCostOrigins();return filled}
$('autoCosts').onclick=()=>{const filled=applyAutoCosts(true);$('costState').textContent=filled+' stime precompilate';budget()};

function addLine(parent,name,value,strong=false){const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement(strong?'b':'strong');a.textContent=name;b.textContent=value;row.append(a,b);parent.append(row)}
function vehicleReportSection(car,index,total,mode){
 const d=car._decision||null,wrap=document.createElement('section');wrap.className='accepted-vehicle-report';
 const brand=document.createElement('div');brand.className='report-brand';brand.textContent='AUTOBID / '+(mode==='buy'?'AUTO DA COMPRARE':mode==='analysis'?'REPORT ANALISI':'SHORTLIST')+' · '+APP_VERSION+(total>1?' · '+(index+1)+'/'+total:'');
 if(car.imageUrl){const img=document.createElement('img');img.className='report-photo';img.src=car.imageUrl;img.alt=car.name||'Veicolo';wrap.append(img)}
 const h=document.createElement('h2');h.textContent=car.name||'Veicolo';
 const meta=document.createElement('p');meta.className='report-meta';meta.textContent=(car.id||'ID UNKNOWN')+' · '+(car.km===null||car.km===undefined?'Km UNKNOWN':car.km.toLocaleString('it-IT')+' km')+' · '+(car.registered||'Data UNKNOWN');
 const status=document.createElement('p');status.className='accepted-badge';status.textContent=d?stageLabel(d.stage):'IDONEA AI FILTRI';
 const auction=document.createElement('div');auction.className='report-lines';addLine(auction,'Fine asta',car.endsAt||'UNKNOWN');addLine(auction,'Paese',car.country||'UNKNOWN');if(car.url){const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('a');a.textContent='Link AutoProff';b.href=car.url;b.target='_blank';b.rel='noopener';b.textContent='Apri asta ↗';b.className='report-auction-link';row.append(a,b);auction.append(row)}else addLine(auction,'Link AutoProff','UNKNOWN');
 const checks=document.createElement('div');checks.className='report-lines';addLine(checks,'Chilometraggio',car.km===null||car.km===undefined?'UNKNOWN':car.km.toLocaleString('it-IT')+' km');addLine(checks,'Prima immatricolazione',car.registered||'UNKNOWN');addLine(checks,'Incidente confermato',car.accident===false?'NO':car.accident===true?'SÌ':'UNKNOWN');
 const deep=document.createElement('div');deep.className='report-lines';for(const key of DEEP_FIELDS)addLine(deep,DEEP_LABELS[key],String(car[key]??'UNKNOWN'));
 const damage=document.createElement('div');damage.className='report-lines';addLine(damage,'Condition report',d?.damage.complete?(d.damage.state==='clear'?'Verificato · nessun danno rilevante':'Danni quantificati'):'DA VERIFICARE');addLine(damage,'Costo danni',d?money(d.damage.estimate):'UNKNOWN');
 const market=document.createElement('div');market.className='report-lines';addLine(market,'Comparabili Italia',d?String(d.market.count):'0');addLine(market,'Prezzo minimo',d?money(d.market.low):'UNKNOWN');addLine(market,'Mediana',d?money(d.market.median):'UNKNOWN');addLine(market,'Prezzo massimo',d?money(d.market.high):'UNKNOWN');addLine(market,'Km medi',d?.market.avgKm!==null&&d?.market.avgKm!==undefined?integer(d.market.avgKm)+' km':'UNKNOWN');addLine(market,'Anno medio',d?.market.avgYear??'UNKNOWN');
 const costs=document.createElement('div');costs.className='report-lines';for(const key of COST_KEYS){const origin=car._inputs?.costOrigins?.[key]||car._costOrigins?.[key]||'';addLine(costs,COST_LABELS[key]+(origin?' · '+origin:''),d?money(d.costs[key]):'UNKNOWN')}
 const econ=document.createElement('div');econ.className='report-lines';addLine(econ,'Prezzo / offerta corrente',d?money(d.currentBid):money(car.currentBid??null));addLine(econ,'Costi totali',d?money(d.costTotal):'UNKNOWN');addLine(econ,'Costo landed',d?money(d.landedCost):'UNKNOWN');addLine(econ,'Rivendita prevista',d?money(d.resale):'UNKNOWN');addLine(econ,'Margine previsto',d?money(d.projectedMargin):'UNKNOWN');addLine(econ,'ROI',d?pct(d.roi):'UNKNOWN');addLine(econ,'Margine obiettivo',d?money(d.desiredMargin):'UNKNOWN');addLine(econ,'Buffer margine',d?money(d.marginBuffer):'UNKNOWN');addLine(econ,'Margine al MAX BID',d?money(d.bidHeadroom):'UNKNOWN');addLine(econ,'Dispersione mercato',d?pct(d.marketSpreadPct):'UNKNOWN');addLine(econ,'Readiness candidatura',d?d.readiness+'%':'UNKNOWN');addLine(econ,'Copertura dati deep',d?d.deepCoverage+'%':'UNKNOWN');addLine(econ,'Blocchi',d&&d.blockers.length?d.blockers.join(', '):'Nessuno');addLine(econ,'Avvisi',d&&d.warnings.length?d.warnings.join(', '):'Nessuno');addLine(econ,'Scenario prudente · rivendita',d?money(d.stress.resale):'UNKNOWN');addLine(econ,'Scenario prudente · costi',d?money(d.stress.costTotal):'UNKNOWN');addLine(econ,'Scenario prudente · margine',d?money(d.stress.projectedMargin):'UNKNOWN');addLine(econ,'Scenario prudente · ROI',d?pct(d.stress.roi):'UNKNOWN');addLine(econ,'Scenario prudente · MAX BID',d?money(d.stress.maxBid):'UNKNOWN');addLine(econ,'MAX BID',d?money(d.maxBid):'UNKNOWN',true);
 const gate=document.createElement('p');gate.className='report-gate '+(d?.stage==='buy_candidate'?'good':d?.withinMax===false?'bad':'');gate.textContent=d?stageLabel(d.stage):'IDONEA AI FILTRI';
 const note=document.createElement('p');note.className='report-note';note.textContent='I dati non verificati restano UNKNOWN. Le stime automatiche dei costi sono modificabili e devono essere confermate prima dell’acquisto. AutoBid non invia offerte.';
 wrap.append(brand,h,meta,status,auction,checks,deep,damage,market,costs,econ,gate,note);return wrap;
}
async function renderReports(list,mode='shortlist'){
 let chosen=(list||[]).filter(car=>car.status==='shortlist');if(mode==='buy')chosen=chosen.filter(car=>car._decision?.stage==='buy_candidate');if(!chosen.length)return;
 const report=$('reportSheet');report.replaceChildren();report.classList.toggle('accepted-report-pack',chosen.length>1);
 chosen.forEach((car,i)=>report.append(vehicleReportSection(car,i,chosen.length,mode)));report.hidden=false;$('printReport').hidden=false;setStep('step-report','ok');
 for(const car of chosen)if(car._decision?.complete)await saveSnapshot(car);
 await renderHistory();report.scrollIntoView({behavior:'smooth',block:'start'});
}
$('acceptedReport').onclick=()=>renderReports(cars,'shortlist');$('buyReport').onclick=()=>renderReports(cars,'buy');
$('report').onclick=()=>{if(currentDecision?.complete&&selected)renderReports([selected],'analysis')};$('printReport').onclick=()=>print();

function renderPurchaseDashboard(){
 const list=$('purchaseList');list.replaceChildren();const mode=$('purchaseSort').value;const candidates=cars.filter(c=>c._decision?.stage==='buy_candidate').sort((a,b)=>{const da=a._decision,db=b._decision;if(mode==='headroom')return (db.bidHeadroom??-Infinity)-(da.bidHeadroom??-Infinity);if(mode==='roi')return (db.roi??-Infinity)-(da.roi??-Infinity);if(mode==='ending'){const ta=Date.parse(a.endsAt||'')||Infinity,tb=Date.parse(b.endsAt||'')||Infinity;return ta-tb}return (db.projectedMargin??-Infinity)-(da.projectedMargin??-Infinity)});
 $('purchaseCount').textContent=candidates.length+' '+(candidates.length===1?'candidata':'candidate');
 if(!candidates.length){const e=document.createElement('div');e.className='empty compact';e.innerHTML='<h3>Nessuna candidata ancora.</h3><p>Servono mercato robusto, costi completi, danni gestiti, documenti chiave e prezzo entro MAX BID.</p>';list.append(e);return}
 for(const car of candidates){const d=car._decision,card=document.createElement('article');card.className='purchase-card';const top=document.createElement('div');top.className='purchase-top';const h=document.createElement('h3');h.textContent=car.name;const badge=document.createElement('strong');badge.textContent='CANDIDATA';top.append(h,badge);const metrics=document.createElement('div');metrics.className='purchase-metrics';for(const [label,value] of [['Prezzo',money(d.currentBid)],['MAX BID',money(d.maxBid)],['Headroom',money(d.bidHeadroom)],['Margine',money(d.projectedMargin)],['ROI',pct(d.roi)],['Stress MAX',money(d.stress.maxBid)],['Readiness',d.readiness+'%']]){const x=document.createElement('div');x.innerHTML='<span>'+label+'</span><b>'+value+'</b>';metrics.append(x)}const info=document.createElement('p');info.textContent=(car.vin||'VIN UNKNOWN')+' · '+(car.cocStatus||'COC UNKNOWN')+' · '+(car.vatRegime||'IVA UNKNOWN');const actions=document.createElement('div');actions.className='vehicle-actions';const report=document.createElement('button');report.textContent='Report';report.onclick=()=>renderReports([car],'buy');actions.append(report);if(car.url){const a=document.createElement('a');a.href=car.url;a.target='_blank';a.rel='noopener';a.textContent='Apri AutoProff ↗';actions.append(a)}card.append(top,metrics,info,actions);list.append(card)}
}

function state(title,detail,ready=false){$('connection').textContent=title;$('detail').textContent=detail;connected=ready;$('live').disabled=!ready}
async function request(type){const id=$('extensionId').value.trim();if(!/^[a-p]{32}$/.test(id))throw Error('ID estensione non valido: usa le 32 lettere mostrate in chrome://extensions.');if(!globalThis.chrome?.runtime?.sendMessage)throw Error('Apri in Chrome desktop e installa l’estensione AutoBid.');return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>reject(Error('EXTENSION_TIMEOUT: estensione non raggiungibile.')),7000);chrome.runtime.sendMessage(id,{type,protocol:1,version:VERSION,requestId},response=>{clearTimeout(timer);if(chrome.runtime.lastError)return reject(Error('CHROME_RUNTIME: '+chrome.runtime.lastError.message));if(!response||response.requestId!==requestId||response.protocol!==1)return reject(Error('PROTOCOL_ERROR: risposta non valida.'));if(response.error)return reject(Error(response.error));if(response.version!==VERSION)return reject(Error('VERSION_MISMATCH: aggiorna PWA ed estensione a '+VERSION));resolve(response)})})}
$('connect').onclick=async()=>{state('Collegamento…','Verifica versione e protocollo.');try{const r=await request('AUTOBID_HELLO');state('Collegata · '+r.version,'AutoProff: '+(r.autoProffTabs?'scheda rilevata':'apri una scheda e accedi')+'.',true)}catch(e){state('Connessione non riuscita',e.message)}};
$('live').onclick=async()=>{if(!connected)return;$('live').disabled=true;try{const r=await request('AUTOBID_SCAN');if(!Array.isArray(r.rows)||r.rows.length>5000)throw Error('PAYLOAD_INVALID: risultati scanner non validi.');load(r.rows,'AUTOPROFF · LETTURA ESTENSIONE');state('Collegata · '+VERSION,r.rows.length+' record ricevuti.',true)}catch(e){state('Scansione non riuscita',e.message,false)}};

function openDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in globalThis))return reject(Error('IndexedDB non disponibile'));const req=indexedDB.open('autobid-local',2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('analyses'))db.createObjectStore('analyses',{keyPath:'id'});if(!db.objectStoreNames.contains('workspace'))db.createObjectStore('workspace',{keyPath:'id'});if(!db.objectStoreNames.contains('vehicleStates'))db.createObjectStore('vehicleStates',{keyPath:'vehicleId'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function putStore(name,value){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function getStore(name,key){const db=await openDb();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),req=tx.objectStore(name).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();return value}
async function allStore(name){const db=await openDb();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),req=tx.objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return rows}
function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>persistWorkspace(),250)}
async function persistWorkspace(){try{await putStore('workspace',{id:'latest',updatedAt:new Date().toISOString(),source:currentSource,cars})}catch{}}
async function restoreWorkspace(){try{const saved=await getStore('workspace','latest');if(!saved?.cars?.length)return;cars=saved.cars.map(refreshCarDecision);currentSource=(saved.source||'SESSIONE')+' · RIPRISTINATA';$('source').textContent=currentSource;$('summary').textContent=cars.length+' veicoli ripristinati dal dispositivo';setStep('step-scan','ok');setStep('step-shortlist',cars.some(c=>c.status==='shortlist')?'ok':'review');render()}catch{}}
async function saveSnapshot(car){const d=car._decision;if(!d)return;try{await putStore('analyses',{id:crypto.randomUUID(),createdAt:new Date().toISOString(),vehicle:car.name,vehicleId:car.id||car.vin||crypto.randomUUID(),vin:car.vin||null,currentBid:d.currentBid,maxBid:d.maxBid,bidHeadroom:d.bidHeadroom,projectedMargin:d.projectedMargin,marginBuffer:d.marginBuffer,roi:d.roi,stage:d.stage,withinMax:d.withinMax,readiness:d.readiness,blockers:d.blockers,marketMedian:d.market.median,marketSpreadPct:d.marketSpreadPct,costTotal:d.costTotal,stressMaxBid:d.stress.maxBid,stressMargin:d.stress.projectedMargin,warnings:d.warnings})}catch{$('historyState').textContent='Storico non disponibile'}}
async function setLifecycle(vehicleId,lifecycle){try{await putStore('vehicleStates',{vehicleId,lifecycle,updatedAt:new Date().toISOString()});await renderHistory()}catch{}}
async function exportBackup(){try{await persistWorkspace();const payload={autobidBackup:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),workspace:await getStore('workspace','latest'),analyses:await allStore('analyses'),vehicleStates:await allStore('vehicleStates')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='autobid-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('historyState').textContent='Backup esportato'}catch{$('historyState').textContent='Errore esportazione backup'}}
async function importBackupFile(file){try{const payload=JSON.parse(await file.text());if(payload?.autobidBackup!==1||!payload.workspace||!Array.isArray(payload.analyses)||!Array.isArray(payload.vehicleStates))throw Error('INVALID_BACKUP');await putStore('workspace',{...payload.workspace,id:'latest'});for(const row of payload.analyses)if(row?.id)await putStore('analyses',row);for(const row of payload.vehicleStates)if(row?.vehicleId)await putStore('vehicleStates',row);cars=Array.isArray(payload.workspace.cars)?payload.workspace.cars.map(refreshCarDecision):[];currentSource=(payload.workspace.source||'BACKUP')+' · IMPORTATO';selected=null;clearInputs();$('source').textContent=currentSource;$('summary').textContent=cars.length+' veicoli importati dal backup';render();await renderHistory();$('historyState').textContent='Backup importato'}catch{$('historyState').textContent='Backup non valido o non leggibile'}}
async function renderHistory(){
 const list=$('historyList');try{const rows=(await allStore('analyses')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),states=await allStore('vehicleStates'),stateMap=new Map(states.map(s=>[s.vehicleId,s]));list.replaceChildren();$('historyState').textContent=rows.length+' snapshot · locale';if(!rows.length){const p=document.createElement('p');p.className='hint';p.textContent='Nessuna analisi salvata.';list.append(p);return}
 const grouped=new Map();for(const row of rows){if(!grouped.has(row.vehicleId))grouped.set(row.vehicleId,[]);grouped.get(row.vehicleId).push(row)}
 for(const group of [...grouped.values()].slice(0,20)){const latest=group[0],previous=group[1],item=document.createElement('article'),h=document.createElement('strong');h.textContent=latest.vehicle;const delta=previous&&latest.currentBid!==null&&previous.currentBid!==null?latest.currentBid-previous.currentBid:null;const p=document.createElement('p');p.textContent=new Date(latest.createdAt).toLocaleString('it-IT')+' · prezzo '+money(latest.currentBid)+' · MAX '+money(latest.maxBid)+' · headroom '+money(latest.bidHeadroom)+' · margine '+money(latest.projectedMargin)+' · ROI '+pct(latest.roi)+' · readiness '+(latest.readiness??'—')+'%'+(delta===null?'':' · variazione '+(delta>0?'+':'')+money(delta));const badge=document.createElement('span');const lifecycle=stateMap.get(latest.vehicleId)?.lifecycle||'attiva';badge.className=lifecycle==='acquistata'?'good':lifecycle==='attiva'?'':'bad';badge.textContent=lifecycle.toUpperCase();const actions=document.createElement('div');actions.className='history-actions';for(const [value,label] of [['acquistata','Acquistata'],['persa','Persa'],['scaduta','Scaduta'],['attiva','Attiva']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>setLifecycle(latest.vehicleId,value);actions.append(b)}item.append(h,p,badge,actions);list.append(item)}
 }catch{$('historyState').textContent='Storico non disponibile'}
}

$('snapshot').onclick=async()=>{if(!selected||currentDecision?.currentBid===null)return;await saveSnapshot(selected);await renderHistory();const original=$('snapshot').textContent;$('snapshot').textContent='Snapshot salvato ✓';setTimeout(()=>$('snapshot').textContent=original,1200)};
$('exportBackup').onclick=exportBackup;$('importBackup').onclick=()=>$('importBackupFile').click();$('importBackupFile').onchange=async e=>{const file=e.target.files?.[0];if(file)await importBackupFile(file);e.target.value=''};$('purchaseSort').onchange=renderPurchaseDashboard;
budget();renderHistory();restoreWorkspace();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
