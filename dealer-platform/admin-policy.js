export const ADMIN_PERMISSION_KEYS=Object.freeze([
  'garage_write','customers_write','documents_write','invoices_view','invoices_write',
  'finance_view','view_costs','autoscout_manage','instagram_manage','reports_view'
]);

export const SELLER_ALLOWED_PERMISSIONS=Object.freeze([
  'garage_write','customers_write','documents_write','autoscout_manage','instagram_manage'
]);

const KNOWN=new Set(ADMIN_PERMISSION_KEYS);
const SELLER_ALLOWED=new Set(SELLER_ALLOWED_PERMISSIONS);

export function normalizeRolePermissions(role,value={}){
  const normalizedRole=String(role||'').toUpperCase();
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const out={};
  for(const key of ADMIN_PERMISSION_KEYS){
    if(source[key]!==true)continue;
    if(normalizedRole==='VENDITORE'&&!SELLER_ALLOWED.has(key))continue;
    out[key]=true;
  }
  if(normalizedRole==='ADMIN')for(const key of ADMIN_PERMISSION_KEYS)out[key]=true;
  return out;
}

export function permissionAllowedForRole(role,key){
  if(!KNOWN.has(key))return false;
  const normalizedRole=String(role||'').toUpperCase();
  return normalizedRole!=='VENDITORE'||SELLER_ALLOWED.has(key);
}

export function canAdministerDealer(member){
  return !!member&&member.status==='ACTIVE'&&member.role==='ADMIN';
}

export function passwordPolicy(password){
  const value=String(password||'');
  const issues=[];
  if(value.length<12)issues.push('length');
  if(!/[a-z]/.test(value))issues.push('lowercase');
  if(!/[A-Z]/.test(value))issues.push('uppercase');
  if(!/[0-9]/.test(value))issues.push('number');
  if(!/[^A-Za-z0-9]/.test(value))issues.push('symbol');
  return {ok:issues.length===0,issues};
}

export function normalizeHttpsLogoUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return null;
  if(raw.length>2048)throw new Error('invalid_logo_url');
  let url;try{url=new URL(raw)}catch{throw new Error('invalid_logo_url')}
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('invalid_logo_url');
  return url.href;
}
