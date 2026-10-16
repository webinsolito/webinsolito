import type {Vehicle} from '../types'

export type OcrProgress={stage:'prepare'|'read'|'parse';progress:number;label:string}
export type ExpenseExtraction={supplier:string;amount:number|null;occurredOn:string;invoiceNumber:string;category:string;detectedPlate:string;detectedVin:string;vehicleId:string;confidence:number;text:string;pagesAnalyzed:number;pageCount:number}

const MAX_PDF_PAGES=3
const PLATE_RE=/\b[A-Z]{2}\s?[0-9]{3}\s?[A-Z]{2}\b/i
const VIN_RE=/\b[A-HJ-NPR-Z0-9]{17}\b/i
const DATE_RE=/\b([0-3]?\d)[\/.\-]([01]?\d)[\/.\-]((?:19|20)\d{2})\b/
const MONEY='([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:[.,][0-9]{2})?)'
const TOTAL_PATTERNS=[
  new RegExp(`(?:TOTALE\\s+(?:DOCUMENTO|FATTURA|DA\\s+PAGARE)|IMPORTO\\s+TOTALE|TOTALE)\\s*[:€]?\\s*${MONEY}`,'i'),
  new RegExp(`€\\s*${MONEY}\\s*(?:TOTALE|TOT\\.)?`,'i')
]

function compact(value:string){return value.replace(/\s+/g,' ').trim()}
function normalized(value:string){return compact(value).toUpperCase()}
function parseMoney(value:string){const clean=value.replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');const n=Number(clean);return Number.isFinite(n)?n:null}
function isoDate(match:RegExpMatchArray|null){if(!match)return '';const d=Number(match[1]),m=Number(match[2]),y=Number(match[3]);const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return '';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function meaningfulSupplier(lines:string[]){const banned=/^(FATTURA|DOCUMENTO|RICEVUTA|SCONTRINO|DATA\b|P\.IVA|PARTITA IVA|CODICE FISCALE|CF\b|TEL\b|TELEFONO|EMAIL|PEC|TOTALE|IMPONIBILE|IVA\b|PAGAMENTO)/i;return lines.map(compact).filter(x=>x.length>=3&&x.length<=90&&!banned.test(x)&&!/^\d/.test(x))[0]||''}
function detectCategory(text:string){const t=normalized(text);if(/PNEUMATIC|GOMM|PNEU/.test(t))return 'PNEUMATICI';if(/CARROZZER|VERNIC|LATTONER/.test(t))return 'CARROZZERIA';if(/RICAMB|PEZZI DI RICAMBIO|AUTORICAMB/.test(t))return 'RICAMBI';if(/TAGLIAND|OFFICINA|MANUTENZ|MECCANIC|REVISIONE/.test(t))return 'OFFICINA';if(/TRASPORT|BISARCA|CARRO ATTREZZI/.test(t))return 'TRASPORTO';if(/LAVAGG|DETAIL|SANIFIC|LUCIDAT/.test(t))return 'PREPARAZIONE';if(/ACI|MOTORIZZ|PRATICA|IMMATRICOL|PASSAGGIO/.test(t))return 'PRATICHE';return 'ALTRO'}
function findVehicle(text:string,plate:string,vin:string,vehicles:Vehicle[]){const p=plate.replace(/\s/g,'').toUpperCase(),v=vin.toUpperCase();if(p){const match=vehicles.find(x=>String(x.plate||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()===p);if(match)return match.id}if(v){const match=vehicles.find(x=>String(x.vin||'').replace(/\s/g,'').toUpperCase()===v);if(match)return match.id}const t=normalized(text);const ranked=vehicles.map(car=>{let score=0;const brand=normalized(car.brand||''),model=normalized(car.model||'');if(brand&&t.includes(brand))score+=1;if(model&&model.length>2&&t.includes(model))score+=2;return {id:car.id,score}}).sort((a,b)=>b.score-a.score);return ranked[0]?.score>=3?ranked[0].id:''}

export function parseExpenseText(text:string,vehicles:Vehicle[]=[]):ExpenseExtraction{
  const clean=text.replace(/\u0000/g,' ').trim(),upper=normalized(clean),lines=clean.split(/\r?\n/).map(compact).filter(Boolean)
  let amount:number|null=null
  for(const pattern of TOTAL_PATTERNS){const match=clean.match(pattern);if(match?.[1]){amount=parseMoney(match[1]);if(amount!==null)break}}
  if(amount===null){const values=[...clean.matchAll(new RegExp(`(?:€\\s*)?${MONEY}`,'g'))].map(m=>parseMoney(m[1])).filter((n):n is number=>n!==null&&n>0&&n<10_000_000);if(values.length)amount=Math.max(...values)}
  const plate=(upper.match(PLATE_RE)?.[0]||'').replace(/\s/g,'')
  const vin=upper.match(VIN_RE)?.[0]||''
  const dateNearLabel=clean.match(new RegExp(`(?:DATA|DEL|EMESS[AO])[^\\n]{0,25}${DATE_RE.source}`,'i'))
  const dateMatch=dateNearLabel?dateNearLabel.slice(-4) as unknown as RegExpMatchArray:clean.match(DATE_RE)
  const occurredOn=isoDate(dateMatch)
  const invoiceNumber=(clean.match(/(?:FATTURA|FT|N\.?|NUMERO)\s*(?:N\.?|NR\.?|NUMERO)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{1,30})/i)?.[1]||'').trim()
  const supplier=meaningfulSupplier(lines)
  const vehicleId=findVehicle(clean,plate,vin,vehicles)
  let confidence=20;if(amount!==null)confidence+=25;if(occurredOn)confidence+=15;if(supplier)confidence+=10;if(plate||vin)confidence+=15;if(vehicleId)confidence+=15
  return {supplier,amount,occurredOn,invoiceNumber,category:detectCategory(clean),detectedPlate:plate,detectedVin:vin,vehicleId,confidence:Math.min(confidence,100),text:clean,pagesAnalyzed:1,pageCount:1}
}

async function recognizeImages(images:Array<File|Blob|HTMLCanvasElement>,onProgress?:(p:OcrProgress)=>void){
  const {createWorker}=await import('tesseract.js')
  let pageIndex=0
  const worker=await createWorker('ita+eng',undefined,{logger:m=>{if(m.status==='recognizing text'){const local=Number(m.progress||0),overall=(pageIndex+local)/Math.max(images.length,1);onProgress?.({stage:'read',progress:overall,label:`Lettura OCR ${Math.round(overall*100)}%`})}}})
  try{let text='';for(pageIndex=0;pageIndex<images.length;pageIndex++){const result=await worker.recognize(images[pageIndex]);text+=`${result.data.text}\n`}return text}
  finally{await worker.terminate()}
}

async function pdfPages(file:File,onProgress?:(p:OcrProgress)=>void){
  const pdfjs=await import('pdfjs-dist')
  const workerUrl=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise
  const limit=Math.min(pdf.numPages,MAX_PDF_PAGES),native:string[]=[]
  for(let i=1;i<=limit;i++){const page=await pdf.getPage(i),content=await page.getTextContent();native.push(content.items.map(item=>'str' in item?item.str:'').join(' '))}
  const nativeText=native.join('\n').trim()
  if(nativeText.replace(/\s/g,'').length>=100)return {text:nativeText,pagesAnalyzed:limit,pageCount:pdf.numPages}
  const canvases:HTMLCanvasElement[]=[]
  for(let i=1;i<=limit;i++){onProgress?.({stage:'prepare',progress:i/limit,label:`Preparo pagina ${i}/${limit}`});const page=await pdf.getPage(i),viewport=page.getViewport({scale:1.7}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Impossibile preparare il PDF');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,canvasContext:ctx,viewport}).promise;canvases.push(canvas)}
  return {text:await recognizeImages(canvases,onProgress),pagesAnalyzed:limit,pageCount:pdf.numPages}
}

export async function extractExpenseFromFile(file:File,vehicles:Vehicle[],onProgress?:(p:OcrProgress)=>void):Promise<ExpenseExtraction>{
  if(file.size>20*1024*1024)throw new Error('Il documento supera il limite di 20 MB')
  onProgress?.({stage:'prepare',progress:0,label:'Preparo il documento'})
  let text='',pagesAnalyzed=1,pageCount=1
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){const result=await pdfPages(file,onProgress);text=result.text;pagesAnalyzed=result.pagesAnalyzed;pageCount=result.pageCount}
  else{text=await recognizeImages([file],onProgress)}
  onProgress?.({stage:'parse',progress:1,label:'Estraggo importo, data e veicolo'})
  const parsed=parseExpenseText(text,vehicles)
  return {...parsed,pagesAnalyzed,pageCount}
}
