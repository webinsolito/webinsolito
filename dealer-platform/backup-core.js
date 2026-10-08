export const BACKUP_SIGNATURE='MALU23_DEALER_BACKUP';
export const BACKUP_VERSION=1;
export const BACKUP_STORES=Object.freeze(['vehicles','vehicle_financials','vehicle_costs','vehicle_events','vehicle_work_items','vehicle_media','documents','document_blobs','customers','customer_interactions','customer_vehicle_interests','calendar_events','contracts','contract_versions','invoices','mutations']);

function isRecord(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function timestamp(row){const value=row?.updated_at||row?.created_at||row?.happened_at||'';const time=Date.parse(value);return Number.isFinite(time)?time:0}

export function validateBackup(payload,currentDealerId){
  if(!isRecord(payload)||payload.signature!==BACKUP_SIGNATURE)throw new Error('backup_not_malu23');
  if(payload.version!==BACKUP_VERSION)throw new Error('backup_version_unsupported');
  if(!currentDealerId||payload.dealer_id!==currentDealerId)throw new Error('backup_wrong_dealer');
  if(!isRecord(payload.stores))throw new Error('backup_stores_missing');
  for(const name of Object.keys(payload.stores))if(!BACKUP_STORES.includes(name))throw new Error('backup_store_not_allowed');
  const counts={};let total=0;
  for(const name of BACKUP_STORES){
    const rows=payload.stores[name]??[];if(!Array.isArray(rows))throw new Error('backup_store_invalid');
    for(const row of rows){if(!isRecord(row)||!row.id)throw new Error('backup_row_invalid');if(row.dealer_id!==currentDealerId)throw new Error('backup_row_wrong_dealer')}
    counts[name]=rows.length;total+=rows.length;
  }
  if(total>100000)throw new Error('backup_too_many_records');
  return {createdAt:payload.created_at||null,appVersion:payload.app_version||null,counts,total};
}

export function mergeForRestore(currentRows=[],backupRows=[]){
  const merged=new Map(currentRows.map(row=>[row.id,row]));let restored=0,keptNewer=0;
  for(const incoming of backupRows){const current=merged.get(incoming.id);if(current&&timestamp(current)>timestamp(incoming)){keptNewer++;continue}merged.set(incoming.id,incoming);restored++}
  return {rows:[...merged.values()],restored,keptNewer};
}

export function backupSummary(plan){
  const vehicles=plan.counts.vehicles||0,customers=plan.counts.customers||0,documents=plan.counts.documents||0;
  return `${plan.total} elementi · ${vehicles} auto · ${customers} clienti · ${documents} documenti`;
}
