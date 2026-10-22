import {AlertTriangle,CheckCircle2,LockKeyhole} from 'lucide-react'
import type {VehicleAvailabilityAlert} from '../domain/vehicleAvailabilityAlerts'
import '../availability-alert.css'

export function AvailabilityAlert({alert,testId}:{alert:VehicleAvailabilityAlert|null;testId:string}){
 if(!alert)return null
 const Icon=alert.kind==='BOOKED'?LockKeyhole:alert.kind==='SOLD'?CheckCircle2:AlertTriangle
 return <div className={'dealer-availability-alert kind-'+alert.kind.toLowerCase()}
  data-testid={testId} data-availability={alert.kind} role="status" aria-label={alert.label}>
  <Icon size={17} aria-hidden="true"/>
  <span><strong>{alert.label}</strong><small>{alert.detail}</small></span>
 </div>
}
