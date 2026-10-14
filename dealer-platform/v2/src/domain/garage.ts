import type {Vehicle,VehicleDraft} from '../types'

export const VEHICLE_STATUSES=['IN_ARRIVO','DA_CONTROLLARE','IN_PREPARAZIONE','DA_FOTOGRAFARE','DA_PUBBLICARE','IN_VENDITA','PRENOTATA','VENDUTA','DA_CONSEGNARE','CONSEGNATA'] as const
export const PHOTO_TARGET=6
const sellable=new Set(['DA_FOTOGRAFARE','DA_PUBBLICARE','IN_VENDITA'])

const text=(value:unknown)=>String(value??'').trim()
const nullableText=(value:unknown)=>{const v=text(value);return v||null}
const nullableNumber=(value:unknown)=>{if(value===''||value===null||value===undefined)return null;const n=Number(value);return Number.isFinite(n)?n:null}

export function normalizeVehicleDraft(input:Partial<VehicleDraft>):VehicleDraft{
  return {
    brand:text(input.brand),model:text(input.model),version:nullableText(input.version),plate:nullableText(input.plate)?.toUpperCase()||null,vin:nullableText(input.vin)?.toUpperCase()||null,
    first_registration:nullableText(input.first_registration),year:nullableNumber(input.year),mileage:nullableNumber(input.mileage),origin_country:nullableText(input.origin_country)?.toUpperCase()||null,
    status:text(input.status)||'IN_ARRIVO',asking_price:nullableNumber(input.asking_price),notes:nullableText(input.notes)
  }
}

export function validateVehicleDraft(input:Partial<VehicleDraft>){
  const v=normalizeVehicleDraft(input),errors:string[]=[]
  if(!v.brand)errors.push('Marca obbligatoria')
  if(!v.model)errors.push('Modello obbligatorio')
  if(v.year!=null&&(v.year<1950||v.year>new Date().getFullYear()+1))errors.push('Anno non valido')
  if(v.mileage!=null&&v.mileage<0)errors.push('Chilometri non validi')
  if(v.asking_price!=null&&v.asking_price<0)errors.push('Prezzo non valido')
  if(v.vin&&v.vin.length<6)errors.push('Telaio troppo corto')
  return {value:v,errors,valid:errors.length===0}
}

export function vehicleCompleteness(vehicle:Vehicle,photoCount:number){
  const checks=[
    {key:'identity',ok:Boolean(vehicle.brand&&vehicle.model),label:'Marca e modello'},
    {key:'registration',ok:Boolean(vehicle.plate||vehicle.vin),label:'Targa o telaio'},
    {key:'year',ok:Boolean(vehicle.year||vehicle.first_registration),label:'Anno o prima immatricolazione'},
    {key:'mileage',ok:vehicle.mileage!=null&&Number(vehicle.mileage)>=0,label:'Chilometri'},
    {key:'price',ok:!sellable.has(vehicle.status||'')||Number(vehicle.asking_price)>0,label:'Prezzo cliente'},
    {key:'photos',ok:photoCount>=PHOTO_TARGET,label:`Almeno ${PHOTO_TARGET} foto`}
  ]
  const done=checks.filter(x=>x.ok).length
  return {percent:Math.round(done/checks.length*100),missing:checks.filter(x=>!x.ok).map(x=>x.label),checks}
}

export function safeMediaFilename(name:string,mime='image/jpeg'){
  const base=text(name).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-90)
  if(base)return base
  const ext=mime.includes('png')?'png':mime.includes('webp')?'webp':mime.includes('heic')?'heic':mime.includes('heif')?'heif':'jpg'
  return `foto.${ext}`
}

export function storageObjectPath(dealerId:string,vehicleId:string,mediaId:string,fileName:string,mime?:string){
  return `private/${dealerId}/${vehicleId}/${mediaId}/${safeMediaFilename(fileName,mime)}`
}
