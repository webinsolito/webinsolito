const PRIVATE_IPV4=[/^127\./,/^10\./,/^192\.168\./,/^169\.254\./,/^172\.(1[6-9]|2\d|3[01])\./];

export function normalizePublicMediaUrl(value){
  const raw=String(value||'').trim();if(!raw)return null;
  try{
    const u=new URL(raw);const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||!host||host==='localhost'||host.endsWith('.local')||PRIVATE_IPV4.some(rx=>rx.test(host)))return null;
    return u.href;
  }catch{return null}
}

export function instagramContentHealth(item={},now=new Date()){
  const status=String(item.status||'DRAFT').toUpperCase();
  const blocking=[],warnings=[];
  const caption=String(item.caption||'').trim(),mediaRaw=String(item.media_url||'').trim(),mediaUrl=normalizePublicMediaUrl(mediaRaw);
  if(['READY','SCHEDULED'].includes(status)){
    if(!item.vehicle_id)blocking.push('MISSING_VEHICLE');
    if(caption.length<20)blocking.push('CAPTION_TOO_SHORT');
    if(!mediaRaw)blocking.push('MISSING_MEDIA_URL');else if(!mediaUrl)blocking.push('INVALID_MEDIA_URL');
  }else if(mediaRaw&&!mediaUrl)blocking.push('INVALID_MEDIA_URL');
  if(status==='SCHEDULED'){
    const t=new Date(item.scheduled_at||'').getTime();
    if(!Number.isFinite(t))blocking.push('MISSING_SCHEDULE');
    else if(t<=now.getTime())blocking.push('SCHEDULE_NOT_FUTURE');
  }
  if(status==='PUBLISHED'){
    if(!item.meta_media_id||!item.published_at)blocking.push('UNVERIFIED_PUBLISHED');
  }
  if(status==='ERROR'&&!String(item.notes||'').trim())warnings.push('ERROR_WITHOUT_NOTE');
  return {status,mediaUrl,blocking,warnings,ready:blocking.length===0};
}

export function browserEditableStatus(status){return !['PUBLISHED'].includes(String(status||'').toUpperCase())}
