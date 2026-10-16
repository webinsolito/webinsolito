import {readSheet} from 'read-excel-file/browser'

export interface VehicleImportRow{
  source_row:number;brand:string;model:string;version?:string|null;plate?:string|null;vin?:string|null;first_registration?:string|null;year?:number|null;mileage?:number|null;origin_country?:string|null;status?:string|null;asking_price?:number|null;notes?:string|null;purchase_price?:number|null;minimum_price?:number|null;purchase_date?:string|null;supplier?:string|null;vat_regime?:string|null
}
export interface VehicleImportPreview{rows:VehicleImportRow[];errors:Array<{row?:number;message:string}>;headers:string[];recognized:string[]}

const HEADER_ALIASES:Record<string,keyof VehicleImportRow>={
  marca:'brand',brand:'brand',modello:'model',model:'model',versione:'version',allestimento:'version',version:'version',
  targa:'plate',plate:'plate',telaio:'vin',vin:'vin',numerotelaio:'vin',
  primaimmatricolazione:'first_registration',immatricolazione:'first_registration',firstregistration:'first_registration',
  anno:'year',year:'year',km:'mileage',chilometri:'mileage',chilometraggio:'mileage',mileage:'mileage',
  provenienza:'origin_country',paese:'origin_country',origine:'origin_country',origincountry:'origin_country',
  stato:'status',status:'status',prezzo:'asking_price',prezzovendita:'asking_price',askingprice:'asking_price',
  note:'notes',notes:'notes',prezzoacquisto:'purchase_price',costoacquisto:'purchase_price',purchaseprice:'purchase_price',
  prezzominimo:'minimum_price',minimumprice:'minimum_price',dataacquisto:'purchase_date',purchasedate:'purchase_date',
  fornitore:'supplier',supplier:'supplier',regimeiva:'vat_regime',vatregime:'vat_regime'
}
const STATUS_MAP:Record<string,string>={
  inarrivo:'IN_ARRIVO',dacontrollare:'DA_CONTROLLARE',inpreparazione:'IN_PREPARAZIONE',dafotografare:'DA_FOTOGRAFARE',
  dapubblicare:'DA_PUBBLICARE',invendita:'IN_VENDITA',prenotata:'PRENOTATA',venduta:'VENDUTA',daconsegnare:'DA_CONSEGNARE',consegnata:'CONSEGNATA'
}
const VAT_MAP:Record<string,string>={ivaesposta:'IVA_ESPOSTA',margine:'MARGINE',privatofuoricampo:'PRIVATO_FUORI_CAMPO',privato:'PRIVATO_FUORI_CAMPO'}
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const text=(value:unknown)=>String(value??'').trim()
const nullable=(value:unknown)=>text(value)||null
function parseNumber(value:unknown){if(value===null||value===undefined||value==='')return null;if(typeof value==='number')return Number.isFinite(value)?value:null;let s=text(value).replace(/\s|€/g,'');if(!s)return null;if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replaceAll('.','').replace(',','.');else s=s.replaceAll(',','')}else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null}
function parseDate(value:unknown){if(!value)return null;if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);const s=text(value);const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;const it=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);if(it)return `${it[3]}-${it[2].padStart(2,'0')}-${it[1].padStart(2,'0')}`;return null}
function normalizeStatus(value:unknown){const raw=text(value);if(!raw)return 'IN_ARRIVO';const direct=raw.toUpperCase().replace(/[\s-]+/g,'_');return STATUS_MAP[normalize(raw)]||direct}
function normalizeVat(value:unknown){const raw=text(value);if(!raw)return 'MARGINE';return VAT_MAP[normalize(raw)]||raw.toUpperCase().replace(/[\s-]+/g,'_')}
function detectDelimiter(line:string){const options=[';',',','\t'];let best=';',score=-1;for(const d of options){let count=0,inQuotes=false;for(let i=0;i<line.length;i++){if(line[i]==='"')inQuotes=!inQuotes;else if(!inQuotes&&line[i]===d)count++}if(count>score){score=count;best=d}}return best}
function parseCsv(textValue:string){const normalizedText=textValue.replace(/^\uFEFF/,'');const firstLine=normalizedText.split(/\r?\n/,1)[0]||'';const delimiter=detectDelimiter(firstLine),rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<normalizedText.length;i++){const ch=normalizedText[i];if(ch==='"'){if(quoted&&normalizedText[i+1]==='"'){cell+='"';i++}else quoted=!quoted;continue}if(ch===delimiter&&!quoted){row.push(cell);cell='';continue}if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&normalizedText[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];continue}cell+=ch}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
async function rowsFromFile(file:File):Promise<unknown[][]>{const name=file.name.toLowerCase();if(name.endsWith('.xlsx'))return await readSheet(file) as unknown[][];if(name.endsWith('.csv')||name.endsWith('.txt'))return parseCsv(await file.text());throw new Error('Formato non supportato. Usa Excel .xlsx oppure CSV.')}
function rowFromCells(cells:unknown[],mapping:Array<keyof VehicleImportRow|undefined>,sourceRow:number):VehicleImportRow{const raw:Record<string,unknown>={};mapping.forEach((key,index)=>{if(key)raw[key]=cells[index]});return {
  source_row:sourceRow,brand:text(raw.brand),model:text(raw.model),version:nullable(raw.version),plate:nullable(raw.plate)?.toUpperCase()||null,vin:nullable(raw.vin)?.toUpperCase().replace(/\s+/g,'')||null,
  first_registration:parseDate(raw.first_registration),year:parseNumber(raw.year),mileage:parseNumber(raw.mileage),origin_country:nullable(raw.origin_country)?.toUpperCase()||null,status:normalizeStatus(raw.status),asking_price:parseNumber(raw.asking_price),notes:nullable(raw.notes),
  purchase_price:parseNumber(raw.purchase_price),minimum_price:parseNumber(raw.minimum_price),purchase_date:parseDate(raw.purchase_date),supplier:nullable(raw.supplier),vat_regime:normalizeVat(raw.vat_regime)
}}
function validate(row:VehicleImportRow){const errors:string[]=[];if(!row.brand)errors.push('marca mancante');if(!row.model)errors.push('modello mancante');if(row.year!=null&&(!Number.isInteger(row.year)||row.year<1950||row.year>new Date().getFullYear()+1))errors.push('anno non valido');if(row.mileage!=null&&(!Number.isInteger(row.mileage)||row.mileage<0))errors.push('km non validi');if(row.asking_price!=null&&row.asking_price<0)errors.push('prezzo vendita non valido');if(row.purchase_price!=null&&row.purchase_price<0)errors.push('prezzo acquisto non valido');if(row.vin&&row.vin.length<6)errors.push('telaio troppo corto');return errors}
export async function parseVehicleImportFile(file:File):Promise<VehicleImportPreview>{if(file.size>5*1024*1024)throw new Error('Il file supera 5 MB. Dividilo in più importazioni.');const matrix=await rowsFromFile(file);if(matrix.length<2)throw new Error('Il file non contiene auto da importare.');const headers=matrix[0].map(text),mapping=headers.map(h=>HEADER_ALIASES[normalize(h)]),recognized=headers.filter((_,i)=>mapping[i]);if(!mapping.includes('brand')||!mapping.includes('model'))throw new Error('Servono almeno le colonne Marca e Modello.');const rows:VehicleImportRow[]=[],errors:Array<{row?:number;message:string}>=[];for(let i=1;i<matrix.length;i++){if(!matrix[i].some(x=>text(x)))continue;const row=rowFromCells(matrix[i],mapping,i+1),issues=validate(row);if(issues.length)errors.push({row:i+1,message:issues.join(' · ')});rows.push(row)}if(rows.length>250)errors.unshift({message:`Sono presenti ${rows.length} righe: il massimo per singola importazione è 250.`});return {rows,errors,headers,recognized}}
export function downloadVehicleImportTemplate(){const header='Marca;Modello;Versione;Targa;Telaio;Prima immatricolazione;Anno;Km;Provenienza;Stato;Prezzo vendita;Prezzo acquisto;Prezzo minimo;Data acquisto;Fornitore;Regime IVA;Note\n';const sample='Volkswagen;Golf;2.0 TDI;AB123CD;WVWZZZ00000000000;15/03/2022;2022;48000;IT;IN_VENDITA;21900;17500;19500;10/01/2026;Fornitore Demo;MARGINE;\n';const url=URL.createObjectURL(new Blob([header,sample],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='modello-import-auto.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
