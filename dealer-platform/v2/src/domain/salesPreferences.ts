import type {SessionPayload} from '../types'
import type {SalesListFilter} from './salesView'
import type {SalesSortMode} from './salesSorting'

export type SalesViewMode='COMPACT'|'EXPANDED'
export interface SalesPreferences {sortMode:SalesSortMode;segment:SalesListFilter;viewMode:SalesViewMode}
export const DEFAULT_SALES_PREFERENCES:Readonly<SalesPreferences>=Object.freeze({
 sortMode:'PRIORITY',segment:'ACTIVE',viewMode:'COMPACT'
})
const SORT_MODES=['PRIORITY','RESERVATION','DELIVERY','RECENT'] as const
const SEGMENTS=['ALL','ACTIVE','DELIVERED','CANCELLED'] as const
const VIEWS=['COMPACT','EXPANDED'] as const
const PREFIX='dealer-v2:sales-preferences:v1:'

/** Local to this device/browser. Require a stable dealer AND user identity to avoid shared-station leaks. */
export function salesPreferencesKey(session:SessionPayload):string|null{
 const dealer=session.dealer?.id?.trim()
 const user=(session.user?.id||session.profile?.id||session.profile?.username||'').trim()
 if(!dealer||!user)return null
 return PREFIX+encodeURIComponent(dealer)+':'+encodeURIComponent(user)
}
export type SalesPreferenceStorage=Pick<Storage,'getItem'|'setItem'>
const browserStorage=():SalesPreferenceStorage|null=>{
 try{return typeof window!=='undefined'?window.localStorage:null}catch{return null}
}
const member=<T extends string>(options:readonly T[],input:unknown):input is T=>
 typeof input==='string'&&options.includes(input as T)
export function readSalesPreferences(key:string|null,storage?:SalesPreferenceStorage|null):SalesPreferences{
 const defaults={...DEFAULT_SALES_PREFERENCES}
 if(!key)return defaults
 try{
  const raw=(storage===undefined?browserStorage():storage)?.getItem(key)
  if(!raw)return defaults
  const parsed:unknown=JSON.parse(raw)
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return defaults
  const obj=parsed as Record<string,unknown>
  if(obj.version!==1)return defaults
  return {
   sortMode:member(SORT_MODES,obj.sortMode)?obj.sortMode:defaults.sortMode,
   segment:member(SEGMENTS,obj.segment)?obj.segment:defaults.segment,
   viewMode:member(VIEWS,obj.viewMode)?obj.viewMode:defaults.viewMode
  }
 }catch{return defaults}
}
export function saveSalesPreferences(key:string|null,values:SalesPreferences,storage?:SalesPreferenceStorage|null):boolean{
 if(!key)return false
 try{
  const target=storage===undefined?browserStorage():storage
  if(!target)return false
  target.setItem(key,JSON.stringify({version:1,sortMode:values.sortMode,segment:values.segment,viewMode:values.viewMode}))
  return true
 }catch{return false}
}
