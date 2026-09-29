export const VERSION='2.0.0';
export function number(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null}
export function classify(car,now=new Date()){
 const reasons=[],km=number(car.km);
 const date=typeof car.registered==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(car.registered)?new Date(car.registered+'T00:00:00Z'):null;
 const valid=date&&!Number.isNaN(+date)&&date.toISOString().slice(0,10)===car.registered&&date<=now;
 const cutoff=new Date(now);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-6);
 if(km!==null&&km>150000)reasons.push('Oltre 150.000 km');
 if(valid&&date<cutoff)reasons.push('Oltre 6 anni');
 if(car.accident===true)reasons.push('Incidente confermato');
 if(reasons.length)return {...car,status:'excluded',reasons};
 if(km===null||!valid||car.accident!==false)return {...car,status:'review',reasons:['Dati mancanti o non confermati']};
 return {...car,status:'shortlist',reasons:[]};
}
export function scan(rows,now){
 const groups=new Map();let duplicates=0;
 for(const row of rows){const key=typeof row.id==='string'&&row.id.trim()?row.id.trim():null;
 if(!key){groups.set(Symbol(),{...row,km:null});continue}
 if(groups.has(key)){duplicates++;const old=groups.get(key);groups.set(key,{...old,km:old.km===row.km?old.km:null,registered:old.registered===row.registered?old.registered:null,accident:old.accident===true||row.accident===true?true:old.accident===row.accident?old.accident:null});}else groups.set(key,{...row});
 }
 return {duplicates,cars:[...groups.values()].map(c=>classify(c,now))};
}
export function maxBid(resale,cost,margin){const values=[resale,cost,margin].map(number);return values.includes(null)?null:Math.max(0,values[0]-values[1]-values[2])}
export const fixtures=[
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false},
{id:'DEMO-101',name:'Volkswagen Golf · Style',km:72000,registered:'2022-04-12',accident:false},
{id:'DEMO-102',name:'BMW 320d · Touring',km:150001,registered:'2021-03-10',accident:false},
{id:'DEMO-103',name:'Audi A3 · Sportback',km:86000,registered:'2019-06-01',accident:false},
{id:'DEMO-104',name:'Peugeot 3008',km:42000,registered:'2023-01-20',accident:true},
{id:'DEMO-105',name:'Mercedes Classe A',km:null,registered:'2022-08-10',accident:null},
{id:'DEMO-106',name:'Toyota Corolla · Hybrid',km:150000,registered:'2024-05-10',accident:false}];
