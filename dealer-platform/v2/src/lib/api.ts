import {config} from './config'
import type {SessionPayload,TenantData} from '../types'

const SESSION_KEY='malu23-v2-session'
const FINANCE_ROLES=new Set(['ADMIN','AMMINISTRAZIONE'])
const emptyData:TenantData={vehicles:[],media:[],workItems:[],customers:[],customerInteractions:[],customerInterests:[],calendarEvents:[],contracts:[],financials:[],costs:[],invoices:[]}
function jsonHeaders(extra:Record<string,string>={}){return {'content-type':'application/json',...extra}}
async function parse<T>(res:Response):Promise<T>{const text=await res.text();let data:unknown=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!res.ok){const d=data as {message?:string;error_description?:string;error?:string}|null;throw new Error(d?.message||d?.error_description||d?.error||`http_${res.status}`)}return data as T}
export function getSession():SessionPayload|null{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
export function setSession(session:SessionPayload|null){if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);window.dispatchEvent(new CustomEvent('malu23:v2-session'))}
export function logout(){setSession(null)}
export function canSeeFinance(session:SessionPayload|null){if(!session||session.profile.role==='VENDITORE')return false;const p=session.profile.permissions||{};return FINANCE_ROLES.has(session.profile.role)||p.finance_view===true||p.view_costs===true||p.invoices_view===true}
export async function login(identifier:string,password:string,dealerSlug=config.defaultDealerSlug){const data=await parse<SessionPayload>(await fetch(`${config.workerUrl}/auth/resolve-login`,{method:'POST',headers:jsonHeaders(),body:JSON.stringify({identifier:identifier.trim(),dealer_slug:dealerSlug,password})}));if(data.profile.force_password_change)throw new Error('Cambio password obbligatorio: completa prima l’accesso nella versione attuale.');setSession(data);return data}
async function refresh(session:SessionPayload){const data=await parse<SessionPayload & {expires_in?:number}>(await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:jsonHeaders({apikey:config.supabasePublishableKey}),body:JSON.stringify({refresh_token:session.refresh_token})}));const next={...session,...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};setSession(next);return next}
async function liveSession(){let session=getSession();if(!session)throw new Error('session_required');if(!session.expires_at||Date.now()/1000>session.expires_at-30)session=await refresh(session);return session}
async function rest<T>(path:string){const session=await liveSession();return parse<T>(await fetch(`${config.supabaseUrl}/rest/v1/${path}`,{headers:{apikey:config.supabasePublishableKey,authorization:`Bearer ${session.access_token}`,accept:'application/json'}}))}
export async function fetchTenantData(session=getSession()):Promise<TenantData>{if(!session)return emptyData;const id=encodeURIComponent(session.dealer.id);const finance=canSeeFinance(session);const [vehicles,media,workItems,customers,customerInteractions,customerInterests,calendarEvents,contracts,financials,costs,invoices]=await Promise.all([
  rest<TenantData['vehicles']>(`vehicles?dealer_id=eq.${id}&deleted_at=is.null&select=*&order=created_at.desc`),
  rest<TenantData['media']>(`vehicle_media?dealer_id=eq.${id}&select=*&order=sort_order.asc,created_at.asc`),
  rest<TenantData['workItems']>(`vehicle_work_items?dealer_id=eq.${id}&select=*&order=created_at.desc`),
  rest<TenantData['customers']>(`customers?dealer_id=eq.${id}&deleted_at=is.null&select=*&order=updated_at.desc`),
  rest<TenantData['customerInteractions']>(`customer_interactions?dealer_id=eq.${id}&select=*&order=happened_at.desc`),
  rest<TenantData['customerInterests']>(`customer_vehicle_interests?dealer_id=eq.${id}&select=*`),
  rest<TenantData['calendarEvents']>(`calendar_events?dealer_id=eq.${id}&status=neq.CANCELLED&select=*&order=starts_at.asc`),
  rest<TenantData['contracts']>(`contracts?dealer_id=eq.${id}&select=*&order=contract_date.desc`),
  finance?rest<TenantData['financials']>(`vehicle_financials?dealer_id=eq.${id}&select=*`):Promise.resolve([]),
  finance?rest<TenantData['costs']>(`vehicle_costs?dealer_id=eq.${id}&select=*`):Promise.resolve([]),
  finance?rest<TenantData['invoices']>(`invoices?dealer_id=eq.${id}&deleted_at=is.null&select=*&order=issue_date.desc`):Promise.resolve([])
]);return {vehicles,media,workItems,customers,customerInteractions,customerInterests,calendarEvents,contracts,financials,costs,invoices}}
