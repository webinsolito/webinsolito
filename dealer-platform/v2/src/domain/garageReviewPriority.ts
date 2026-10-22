import type {Vehicle} from '../types'

export type GarageReviewPriorityKind='reservation'|'blocked'|'other'

/** Mod51: only for vehicles already flagged UNAVAILABLE by the dealer-scoped alert. */
export function garageReviewPriority(vehicle:Pick<Vehicle,'status'>){
 const status=String(vehicle.status||'').trim().toUpperCase()
 if(status==='PRENOTATA'||status==='RISERVATA')return {kind:'reservation' as const,rank:0,label:'Prenotazione incoerente'}
 if(status==='BLOCCATA'||status==='NON_DISPONIBILE')return {kind:'blocked' as const,rank:1,label:'Auto bloccata'}
 return {kind:'other' as const,rank:2,label:'Stato da chiarire'}
}

/** Stable sort: equal priorities preserve the existing inventory order. */
export function compareGarageReviewPriority(a:Pick<Vehicle,'status'>,b:Pick<Vehicle,'status'>){
 return garageReviewPriority(a).rank-garageReviewPriority(b).rank
}
