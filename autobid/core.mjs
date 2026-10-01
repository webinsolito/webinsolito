export const VERSION='2.1.0';
export const APP_VERSION='2.1.2';
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
export function costEngine(values){
 const parsed=Object.fromEntries(COST_KEYS.map(key=>[key,number(values?.[key])]));
 const unknown=COST_KEYS.filter(key=>parsed[key]===null);
 return {values:parsed,unknown,total:unknown.length?null:COST_KEYS.reduce((sum,key)=>sum+parsed[key],0)};
}
export function marketModel(comparables){
 const values=(Array.isArray(comparables)?comparables:[]).map(number).filter(v=>v!==null&&v>0).sort((a,b)=>a-b);
 if(values.length<3)return {values,count:values.length,complete:false,median:null,low:values[0]??null,high:values.at(-1)??null};
 const mid=Math.floor(values.length/2);const median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
 return {values,count:values.length,complete:true,median,low:values[0],high:values.at(-1)};
}
export function deepAnalysis(car){
 const fields=Object.fromEntries(DEEP_FIELDS.map(key=>[key,car?.[key]??null]));
 const unknown=DEEP_FIELDS.filter(key=>fields[key]===null||fields[key]===undefined||fields[key]==='');
 return {fields,unknown,complete:Boolean(car&&unknown.length===0)};
}
export function decisionModel(car,inputs={}){
 const market=marketModel(inputs.comparables);const engine=costEngine(inputs.costs);const deep=deepAnalysis(car);
 const manualResale=number(inputs.resale);const resale=manualResale??market.median;const desiredMargin=number(inputs.desiredMargin);const currentBid=number(inputs.currentBid??car?.currentBid);
 const bid=maxBid(resale,engine.total,desiredMargin);const landedCost=currentBid===null||engine.total===null?null:currentBid+engine.total;
 const projectedMargin=resale===null||landedCost===null?null:resale-landedCost;const roi=projectedMargin===null||landedCost===null||landedCost===0?null:(projectedMargin/landedCost)*100;
 const complete=Boolean(car?.status==='shortlist'&&market.complete&&engine.total!==null&&resale!==null&&desiredMargin!==null&&currentBid!==null&&bid!==null);const verified=Boolean(complete&&deep.complete);
 return {vehicle:car?.name||null,vehicleId:car?.id||null,deep,market,costs:engine.values,costUnknown:engine.unknown,costTotal:engine.total,resale,resaleSource:manualResale!==null?'manual':market.complete?'market-median':null,currentBid,landedCost,desiredMargin,projectedMargin,roi,maxBid:bid,withinMax:currentBid!==null&&bid!==null?currentBid<=bid:null,complete,verified};
}

const demoCosts={fees:500,transport:650,vatNonRecoverable:0,documents:250,registration:750,damage:350,tyres:450,service:0,keys:300,preparation:550,warranty:180,stock:250,risk:500};
export const fixtures=[
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false,vin:'WVWDEMO0000000101',trim:'Style 2.0 TDI',powerKw:110,euroClass:'Euro 6d',country:'DE',keysCount:2,serviceStatus:'Documentato',cocStatus:'Presente',vatRegime:'IVA esposta',currentBid:15000,demoDecision:{comparables:[21900,22500,23100],costs:demoCosts,desiredMargin:2500}},
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false,vin:'WVWDEMO0000000101',trim:'Style 2.0 TDI',powerKw:110,euroClass:'Euro 6d',country:'DE',keysCount:2,serviceStatus:'Documentato',cocStatus:'Presente',vatRegime:'IVA esposta',currentBid:15000,demoDecision:{comparables:[21900,22500,23100],costs:demoCosts,desiredMargin:2500}},
{id:'DEMO-102',name:'BMW 320d · Touring',km:150001,registered:'2021-03-10',accident:false},
{id:'DEMO-103',name:'Audi A3 · Sportback',km:86000,registered:'2019-06-01',accident:false},
{id:'DEMO-104',name:'Peugeot 3008',km:42000,registered:'2023-01-20',accident:true},
{id:'DEMO-105',name:'Mercedes Classe A',km:null,registered:'2022-08-10',accident:null},
{id:'DEMO-106',name:'Toyota Corolla · Hybrid',km:150000,registered:'2024-05-10',accident:false}
];
