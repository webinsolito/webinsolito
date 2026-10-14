export type Role='ADMIN'|'AMMINISTRAZIONE'|'VENDITORE'|'OPERATORE'|string
export type View='today'|'garage'|'clients'|'calendar'|'more'

export interface Dealer { id:string; slug:string; display_name?:string; name?:string }
export interface Profile { id?:string; display_name?:string; username?:string; role:Role; permissions?:Record<string,boolean>; force_password_change?:boolean }
export interface SessionPayload { access_token:string; refresh_token:string; expires_at?:number; expires_in?:number; user?:{id:string;email?:string}; dealer:Dealer; profile:Profile }
export interface Vehicle { id:string; dealer_id:string; brand?:string; model?:string; version?:string; plate?:string; vin?:string; year?:number; mileage?:number; status?:string; asking_price?:number; purchase_date?:string; created_at?:string; updated_at?:string; autoscout_status?:string; autoscout_url?:string; autoscout_published_at?:string; sale_price?:number; deleted_at?:string|null }
export interface VehicleMedia { id:string; dealer_id:string; vehicle_id:string; kind?:string; sort_order?:number; url?:string; public_url?:string; object_url?:string; created_at?:string }
export interface VehicleWorkItem { id:string; dealer_id:string; vehicle_id:string; title?:string; category?:string; status?:string; due_date?:string; priority?:string; created_at?:string }
export interface Customer { id:string; dealer_id:string; first_name?:string; last_name?:string; phone?:string; email?:string; status?:string; next_action_at?:string; last_contact_at?:string; deleted_at?:string|null }
export interface CustomerInteraction { id:string; dealer_id:string; customer_id:string; vehicle_id?:string; kind?:string; note?:string; happened_at?:string; next_action_at?:string }
export interface CustomerInterest { id:string; dealer_id:string; customer_id:string; vehicle_id:string; status?:string; created_at?:string }
export interface CalendarEvent { id:string; dealer_id:string; title?:string; starts_at?:string; ends_at?:string; status?:string; customer_id?:string; vehicle_id?:string; note?:string }
export interface Contract { id:string; dealer_id:string; template_code?:string; vehicle_id?:string; customer_id?:string; sale_stage?:string; status?:string; agreed_price?:number; delivered_at?:string; integrity_state?:string }
export interface VehicleFinancial { id:string; dealer_id:string; vehicle_id:string; purchase_price?:number; minimum_price?:number; vat_regime?:string }
export interface VehicleCost { id:string; dealer_id:string; vehicle_id:string; amount?:number; category?:string; occurred_on?:string }
export interface Invoice { id:string; dealer_id:string; vehicle_id?:string; customer_id?:string; total?:number; paid_amount?:number; payment_status?:string; due_date?:string }
export interface TenantData { vehicles:Vehicle[]; media:VehicleMedia[]; workItems:VehicleWorkItem[]; customers:Customer[]; customerInteractions:CustomerInteraction[]; customerInterests:CustomerInterest[]; calendarEvents:CalendarEvent[]; contracts:Contract[]; financials:VehicleFinancial[]; costs:VehicleCost[]; invoices:Invoice[] }
