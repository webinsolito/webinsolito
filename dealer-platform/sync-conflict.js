function time(value){const n=Date.parse(value||'');return Number.isFinite(n)?n:0}

export function assessSyncConflict({expectedUpdatedAt=null,mutationCreatedAt=null,serverRow=null}={}){
  const base=time(expectedUpdatedAt)||time(mutationCreatedAt);
  if(expectedUpdatedAt&&!serverRow)return {conflict:true,code:'sync_conflict_deleted_server'};
  if(!serverRow)return {conflict:false,code:null};
  const server=time(serverRow.updated_at);
  if(server&&base&&server>base)return {conflict:true,code:'sync_conflict_newer_server'};
  return {conflict:false,code:null};
}

export function syncIssueLabel(code){
  return ({
    sync_conflict_newer_server:'Esiste una modifica più recente sul server.',
    sync_conflict_deleted_server:'Il record è stato eliminato sul server mentre eri offline.'
  })[code]||'Conflitto di sincronizzazione.';
}
