export const VERSION='2.1.0';
export const APP_VERSION='2.2.0';

export function number(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null}
export function classify(car,now=new Date()){
 const reasons=[],km=number(car.km);
 const date=typeof car.registered==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(car.registered)?new Date(car.registered+'T00:00:00Z'):null;
 const valid=date&&!Number.isNaN(+date)&&date.toISOString().slice(0,10)===car.registered&&date<=now;
 const cutoff=new Date(now);cutoff.setUTCHours(0,0,0,0);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-6);
 if(km!==null&&km>150000)reasons.push('Oltre 150.000 km');
 if(valid&&date<cutoff)reasons.push('Oltre 6 anni');
 if(car.accident===true)reasons.push('Incidente confermato');
 if(reasons.length)return {...car,status:'excluded',reasons};
 if(km===null||!valid||car.accident!==false)return {...car,status:'review',reasons:['Dati mancanti o non confermati']};
 return {...car,status:'shortlist',reasons:[]};
}
export function scan(rows,now){
 const groups=new Map();let duplicates=0;
 for(const row of Array.isArray(rows)?rows:[]){const key=typeof row.id==='string'&&row.id.trim()?row.id.trim():null;
  if(!key){groups.set(Symbol(),{...row,km:null});continue}
  if(groups.has(key)){duplicates++;const old=groups.get(key);groups.set(key,{...old,...row,km:old.km===row.km?old.km:null,registered:old.registered===row.registered?old.registered:null,accident:old.accident===true||row.accident===true?true:old.accident===row.accident?old.accident:null});}
  else groups.set(key,{...row});
 }
 return {duplicates,cars:[...groups.values()].map(c=>classify(c,now))};
}
export function maxBid(resale,cost,margin){const values=[resale,cost,margin].map(number);return values.includes(null)?null:Math.max(0,values[0]-values[1]-values[2])}

export const COST_KEYS=['fees','transport','vatNonRecoverable','documents','registration','damage','tyres','service','keys','preparation','warranty','stock','risk'];
export const COST_LABELS={fees:'Commissioni asta',transport:'Trasporto',vatNonRecoverable:'IVA non recuperabile',documents:'Documenti / COC',registration:'Immatricolazione',damage:'Danni',tyres:'Pneumatici',service:'Tagliando',keys:'Chiavi',preparation:'Preparazione',warranty:'Garanzia',stock:'Costo stock',risk:'Risk reserve'};
export const DEEP_FIELDS=['vin','trim','powerKw','euroClass','country','keysCount','serviceStatus','cocStatus','vatRegime'];
export const DEEP_LABELS={vin:'VIN',trim:'Allestimento',powerKw:'Potenza kW',euroClass:'Classe Euro',country:'Paese',keysCount:'Chiavi',serviceStatus:'Service',cocStatus:'COC',vatRegime:'Regime IVA'};

export function autoCostPreset(car,currentBid){
 const bid=number(currentBid??car?.currentBid);const country=String(car?.country||'').toUpperCase();
 const transportTable={DE:650,NL:700,BE:650,AT:550,FR:700,DK:900,SE:1100,ES:950,PL:850,CZ:750};
 const fees=bid===null?null:bid<10000?450:bid<20000?550:650;
 const risk=bid===null?null:Math.round(Math.min(900,Math.max(350,bid*.03))/10)*10;
 const coc=String(car?.cocStatus||'').toLowerCase();
 return {
  fees,transport:transportTable[country]??null,
  vatNonRecoverable:number(car?.vatNonRecoverable),
  documents:coc.includes('presente')?100:coc.includes('assente')?350:250,
  registration:750,
  damage:number(car?.damageEstimate),tyres:number(car?.tyreEstimate),service:number(car?.serviceEstimate),keys:number(car?.keyEstimate),
  preparation:450,warranty:200,stock:250,risk
 };
}
export function costEngine(values){
 const parsed=Object.fromEntries(COST_KEYS.map(key=>[key,number(values?.[key])]));
 const unknown=COST_KEYS.filter(key=>parsed[key]===null);
 return {values:parsed,unknown,total:unknown.length?null:COST_KEYS.reduce((sum,key)=>sum+parsed[key],0)};
}
function median(values){const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export function marketModel(comparables){
 const rows=(Array.isArray(comparables)?comparables:[]).map(row=>{
  if(typeof row==='number')return {price:number(row),km:null,year:null};
  return {price:number(row?.price),km:number(row?.km),year:number(row?.year)};
 }).filter(row=>row.price!==null&&row.price>0);
 const prices=rows.map(r=>r.price).sort((a,b)=>a-b);
 const kms=rows.map(r=>r.km).filter(v=>v!==null),years=rows.map(r=>r.year).filter(v=>v!==null);
 return {rows,count:rows.length,partial:rows.length>=3,robust:rows.length>=5,median:rows.length?median(prices):null,low:prices[0]??null,high:prices.at(-1)??null,avgKm:kms.length?Math.round(kms.reduce((a,b)=>a+b,0)/kms.length):null,avgYear:years.length?Math.round(years.reduce((a,b)=>a+b,0)/years.length):null};
}
export function deepAnalysis(car){
 const fields=Object.fromEntries(DEEP_FIELDS.map(key=>[key,car?.[key]??null]));
 const unknown=DEEP_FIELDS.filter(key=>fields[key]===null||fields[key]===undefined||fields[key]==='');
 const docsReady=Boolean(fields.vin&&fields.cocStatus&&fields.vatRegime);
 return {fields,unknown,complete:Boolean(car&&unknown.length===0),docsReady};
}
export function damageModel(car,input={}){
 const state=input.state||car?.damageState||(car?.accident===false?'clear':'unknown');
 const estimate=number(input.estimate??car?.damageEstimate);
 const complete=state==='clear'||(state==='costed'&&estimate!==null);
 return {state,estimate,complete,needsReview:!complete};
}
export function decisionModel(car,inputs={}){
 const market=marketModel(inputs.comparables);const engine=costEngine(inputs.costs);const deep=deepAnalysis(car);const damage=damageModel(car,inputs.damage);
 const manualResale=number(inputs.resale);const resale=manualResale??(market.robust?market.median:null);const desiredMargin=number(inputs.desiredMargin);const currentBid=number(inputs.currentBid??car?.currentBid);
 const bid=maxBid(resale,engine.total,desiredMargin);const landedCost=currentBid===null||engine.total===null?null:currentBid+engine.total;
 const projectedMargin=resale===null||landedCost===null?null:resale-landedCost;const roi=projectedMargin===null||landedCost===null||landedCost===0?null:(projectedMargin/landedCost)*100;
 const complete=Boolean(car?.status==='shortlist'&&market.robust&&engine.total!==null&&resale!==null&&desiredMargin!==null&&currentBid!==null&&bid!==null&&damage.complete);
 const withinMax=currentBid!==null&&bid!==null?currentBid<=bid:null;
 let stage=car?.status==='excluded'?'excluded':car?.status==='review'?'review':'filter_ok';
 if(complete)stage=withinMax?'analysis_complete':'bid_over_max';
 if(complete&&withinMax&&deep.docsReady)stage='buy_candidate';
 const verified=Boolean(stage==='buy_candidate'&&deep.complete);
 return {vehicle:car?.name||null,vehicleId:car?.id||null,deep,damage,market,costs:engine.values,costUnknown:engine.unknown,costTotal:engine.total,resale,resaleSource:manualResale!==null?'manual':market.robust?'market-median':null,currentBid,landedCost,desiredMargin,projectedMargin,roi,maxBid:bid,withinMax,complete,verified,stage};
}
export function stageLabel(stage){return ({excluded:'ESCLUSA',review:'DA VERIFICARE',filter_ok:'IDONEA AI FILTRI',analysis_complete:'ANALISI COMPLETA',bid_over_max:'OLTRE MAX BID',buy_candidate:'CANDIDATA ALL’ACQUISTO'})[stage]||'DA ANALIZZARE'}

const demoCosts={fees:550,transport:650,vatNonRecoverable:0,documents:100,registration:750,damage:0,tyres:0,service:0,keys:0,preparation:450,warranty:200,stock:250,risk:450};
const demoMarket=[{price:21900,km:79000,year:2022},{price:22500,km:72000,year:2022},{price:23100,km:68000,year:2022},{price:22800,km:75000,year:2021},{price:22400,km:81000,year:2022}];
export const fixtures=[
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false,vin:'WVWDEMO0000000101',trim:'Style 2.0 TDI',powerKw:110,euroClass:'Euro 6d',country:'DE',keysCount:2,serviceStatus:'Documentato',cocStatus:'Presente',vatRegime:'IVA esposta',currentBid:15000,damageState:'clear',damageEstimate:0,imageUrl:null,url:null,endsAt:null,demoDecision:{comparables:demoMarket,costs:demoCosts,desiredMargin:2500,damage:{state:'clear',estimate:0}}},
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false,vin:'WVWDEMO0000000101',trim:'Style 2.0 TDI',powerKw:110,euroClass:'Euro 6d',country:'DE',keysCount:2,serviceStatus:'Documentato',cocStatus:'Presente',vatRegime:'IVA esposta',currentBid:15000,damageState:'clear',damageEstimate:0,imageUrl:null,url:null,endsAt:null,demoDecision:{comparables:demoMarket,costs:demoCosts,desiredMargin:2500,damage:{state:'clear',estimate:0}}},
{id:'DEMO-102',name:'BMW 320d · Touring',km:150001,registered:'2021-03-10',accident:false},
{id:'DEMO-103',name:'Audi A3 · Sportback',km:86000,registered:'2019-06-01',accident:false},
{id:'DEMO-104',name:'Peugeot 3008',km:42000,registered:'2023-01-20',accident:true},
{id:'DEMO-105',name:'Mercedes Classe A',km:null,registered:'2022-08-10',accident:null},
{id:'DEMO-106',name:'Toyota Corolla · Hybrid',km:150000,registered:'2024-05-10',accident:false}
];
