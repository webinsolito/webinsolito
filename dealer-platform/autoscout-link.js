export function normalizeAutoScoutUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    const validHost=/(^|\.)autoscout24\.[a-z]{2,3}$/.test(host);
    if(url.protocol!=='https:'||!validHost||url.username||url.password)return null;
    url.hash='';
    return url.href;
  }catch{return null}
}

function validDate(value){
  if(!value)return false;
  const time=new Date(value).getTime();
  return Number.isFinite(time);
}

export function autoScoutListingHealth(vehicle={},now=new Date()){
  const url=normalizeAutoScoutUrl(vehicle.autoscout_url);
  const status=vehicle.autoscout_status||((url||vehicle.autoscout_listing_id)?'PUBLISHED':'NOT_READY');
  const price=Number(vehicle.autoscout_price||vehicle.asking_price||vehicle.sale_price||0);
  const publishedAt=validDate(vehicle.autoscout_published_at)?new Date(vehicle.autoscout_published_at):null;
  const daysOnline=publishedAt?Math.max(0,Math.floor((now.getTime()-publishedAt.getTime())/86400000)):0;
  const blocking=[];
  const warnings=[];
  if(vehicle.autoscout_url&&!url)blocking.push('INVALID_URL');
  if(status==='PUBLISHED'){
    if(!url)blocking.push('MISSING_URL');
    if(!String(vehicle.autoscout_listing_id||'').trim())blocking.push('MISSING_LISTING_ID');
    if(!publishedAt)blocking.push('MISSING_PUBLISHED_AT');
    if(!(price>0))blocking.push('MISSING_PRICE');
  }
  if(status==='ERROR'&&!String(vehicle.autoscout_error||'').trim())warnings.push('ERROR_WITHOUT_NOTE');
  if(daysOnline>=60)warnings.push('STALE_60');
  else if(daysOnline>=30)warnings.push('STALE_30');
  return {status,url,price,daysOnline,blocking:[...new Set(blocking)],warnings:[...new Set(warnings)],verified:status==='PUBLISHED'&&blocking.length===0};
}
