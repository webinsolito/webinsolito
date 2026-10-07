// MALÙ23 Dealer Platform — Cloudflare Worker V0.2
// Secrets / vars expected in Worker environment only:
// TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, APP_URL,
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});

function cors(env,req){
  const origin=req.headers.get('origin')||'';
  const appOrigin=env.APP_URL?new URL(env.APP_URL).origin:'';
  const allowed=!origin||origin===appOrigin||origin==='https://web.telegram.org';
  return allowed?{'access-control-allow-origin':origin||appOrigin||'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization,x-dealer-id','vary':'Origin'}:{};
}

async function hmac(key,data){
  const cryptoKey=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(data)));
}
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');

async function validateTelegramInitData(initData,botToken,maxAgeSeconds=900){
  if(!initData||!botToken)return {ok:false,reason:'missing_data'};
  const params=new URLSearchParams(initData),receivedHash=params.get('hash');
  if(!receivedHash)return {ok:false,reason:'missing_hash'};
  params.delete('hash');
  const authDate=Number(params.get('auth_date')||0),now=Math.floor(Date.now()/1000);
  if(!authDate||Math.abs(now-authDate)>maxAgeSeconds)return {ok:false,reason:'expired'};
  const rows=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`);
  const dataCheck=rows.join('\n');
  const secret=await hmac(new TextEncoder().encode('WebAppData'),botToken);
  const computed=hex(await hmac(secret,dataCheck));
  if(computed.length!==receivedHash.length)return {ok:false,reason:'invalid_hash'};
  let diff=0;for(let i=0;i<computed.length;i++)diff|=computed.charCodeAt(i)^receivedHash.charCodeAt(i);
  if(diff!==0)return {ok:false,reason:'invalid_hash'};
  let user=null;try{user=JSON.parse(params.get('user')||'null')}catch{}
  if(!user?.id)return {ok:false,reason:'missing_user'};
  return {ok:true,user,authDate,queryId:params.get('query_id')||null};
}

async function fetchJson(url,options={}){
  const r=await fetch(url,options);const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`http_${r.status}`);return data;
}

function serviceHeaders(env,extra={}){return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...extra}}
function publicHeaders(env,extra={}){return {apikey:env.SUPABASE_PUBLISHABLE_KEY,...extra}}

async function serviceRest(env,path,options={}){
  return fetchJson(`${env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...serviceHeaders(env),...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
}

async function currentUser(env,authorization){
  if(!authorization?.startsWith('Bearer '))throw new Error('missing_bearer');
  return fetchJson(`${env.SUPABASE_URL}/auth/v1/user`,{headers:publicHeaders(env,{authorization})});
}

async function resolveLogin(req,env){
  const body=await req.json().catch(()=>({}));const username=String(body.username||'').trim().toLowerCase(),dealerSlug=String(body.dealer_slug||'').trim().toLowerCase(),password=String(body.password||'');
  if(!username||!dealerSlug||!password)return json({ok:false,error:'missing_credentials'},400,cors(env,req));
  const dealers=await serviceRest(env,`dealers?slug=eq.${encodeURIComponent(dealerSlug)}&status=eq.ACTIVE&select=id,slug,display_name&limit=1`);
  const dealer=dealers?.[0];if(!dealer)return json({ok:false,error:'dealer_not_found'},401,cors(env,req));
  const members=await serviceRest(env,`memberships?dealer_id=eq.${dealer.id}&username=ilike.${encodeURIComponent(username)}&status=eq.ACTIVE&select=user_id,role,permissions,username&limit=1`);
  const member=members?.[0];if(!member)return json({ok:false,error:'invalid_credentials'},401,cors(env,req));
  const adminUser=await fetchJson(`${env.SUPABASE_URL}/auth/v1/admin/users/${member.user_id}`,{headers:serviceHeaders(env)});
  if(!adminUser?.email)return json({ok:false,error:'account_email_missing'},401,cors(env,req));
  let auth;
  try{auth=await fetchJson(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:publicHeaders(env,{'content-type':'application/json'}),body:JSON.stringify({email:adminUser.email,password})})}
  catch{return json({ok:false,error:'invalid_credentials'},401,cors(env,req))}
  const profiles=await serviceRest(env,`profiles?user_id=eq.${member.user_id}&select=display_name,force_password_change&limit=1`);const profile=profiles?.[0]||{};
  return json({...auth,expires_at:Math.floor(Date.now()/1000)+(auth.expires_in||3600),dealer,profile:{...profile,role:member.role,permissions:member.permissions,username:member.username}},200,cors(env,req));
}

async function linkTelegram(req,env){
  const authorization=req.headers.get('authorization');let user;
  try{user=await currentUser(env,authorization)}catch{return json({ok:false,error:'unauthorized'},401,cors(env,req))}
  const body=await req.json().catch(()=>({}));const valid=await validateTelegramInitData(body.initData,env.TELEGRAM_BOT_TOKEN);
  if(!valid.ok)return json(valid,401,cors(env,req));
  const dealerId=String(body.dealer_id||req.headers.get('x-dealer-id')||'');if(!dealerId)return json({ok:false,error:'dealer_required'},400,cors(env,req));
  const membership=await serviceRest(env,`memberships?dealer_id=eq.${encodeURIComponent(dealerId)}&user_id=eq.${encodeURIComponent(user.id)}&status=eq.ACTIVE&select=user_id&limit=1`);
  if(!membership?.length)return json({ok:false,error:'not_dealer_member'},403,cors(env,req));
  await serviceRest(env,'telegram_links?on_conflict=dealer_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({dealer_id:dealerId,user_id:user.id,telegram_user_id:String(valid.user.id),linked_at:new Date().toISOString()})});
  return json({ok:true,telegram_user:{id:valid.user.id,first_name:valid.user.first_name||null,username:valid.user.username||null}},200,cors(env,req));
}

async function telegram(method,env,payload){
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error('telegram_not_configured');
  return fetchJson(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
}

async function linkedTelegramContext(env,telegramUserId){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return null;
  const links=await serviceRest(env,`telegram_links?telegram_user_id=eq.${encodeURIComponent(String(telegramUserId))}&select=dealer_id,user_id&limit=1`);const link=links?.[0];if(!link)return null;
  const dealers=await serviceRest(env,`dealers?id=eq.${link.dealer_id}&status=eq.ACTIVE&select=id,slug,display_name&limit=1`);const dealer=dealers?.[0];if(!dealer)return null;
  const profiles=await serviceRest(env,`profiles?user_id=eq.${link.user_id}&select=display_name&limit=1`);const profile=profiles?.[0]||{};
  const [vehicles,customers]=await Promise.all([
    serviceRest(env,`vehicles?dealer_id=eq.${link.dealer_id}&deleted_at=is.null&select=id,status`),
    serviceRest(env,`customers?dealer_id=eq.${link.dealer_id}&deleted_at=is.null&select=id,next_contact_at`)
  ]);
  const tomorrow=Date.now()+86400000;const callbacks=(customers||[]).filter(c=>c.next_contact_at&&new Date(c.next_contact_at).getTime()<=tomorrow).length;const deliveries=(vehicles||[]).filter(v=>v.status==='DA_CONSEGNARE').length;
  return {dealer,profile,vehicleCount:vehicles?.length||0,callbacks,deliveries};
}

async function webhook(req,env){
  const secret=req.headers.get('x-telegram-bot-api-secret-token');
  if(!env.TELEGRAM_WEBHOOK_SECRET_TOKEN||secret!==env.TELEGRAM_WEBHOOK_SECRET_TOKEN)return json({ok:false,error:'forbidden'},403);
  const update=await req.json();const msg=update.message||update.callback_query?.message;const chatId=msg?.chat?.id;const from=update.message?.from||update.callback_query?.from;
  if(!chatId||!from?.id)return json({ok:true,ignored:true});
  const text=update.message?.text||'';
  if(text==='/start'||text.startsWith('/start ')){
    let ctx=null;try{ctx=await linkedTelegramContext(env,from.id)}catch(err){console.error('context',err)}
    if(ctx){
      const first=ctx.profile?.display_name||from.first_name||'👋';const appUrl=`${env.APP_URL}${env.APP_URL.includes('?')?'&':'?'}dealer=${encodeURIComponent(ctx.dealer.slug)}`;
      await telegram('sendMessage',env,{chat_id:chatId,text:`${ctx.dealer.display_name}\n\nCiao ${first} 👋\n\n🚗 ${ctx.vehicleCount} auto\n📞 ${ctx.callbacks} richiami entro domani\n🚚 ${ctx.deliveries} consegne da preparare`,reply_markup:{inline_keyboard:[[{text:'APRI GESTIONALE',web_app:{url:appUrl}}]]}});
    }else{
      await telegram('sendMessage',env,{chat_id:chatId,text:'🔒 ACCESSO RISERVATO\n\nGestionale disponibile esclusivamente alle concessionarie autorizzate. Accedi prima alla Mini App per collegare il tuo account.',reply_markup:{inline_keyboard:[[{text:'ACCEDI',web_app:{url:env.APP_URL}}],[{text:'ATTIVA CONCESSIONARIA',web_app:{url:`${env.APP_URL}?activate=1`}}]]}});
    }
  }
  return json({ok:true});
}

export default {
  async fetch(req,env){
    const url=new URL(req.url);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env,req)});
    try{
      if(url.pathname==='/health')return json({ok:true,service:'malu23-dealer-worker',version:'0.2.0',telegramConfigured:!!env.TELEGRAM_BOT_TOKEN,supabaseConfigured:!!env.SUPABASE_URL},200,cors(env,req));
      if(url.pathname==='/auth/resolve-login'&&req.method==='POST')return resolveLogin(req,env);
      if(url.pathname==='/telegram/validate'&&req.method==='POST'){const body=await req.json().catch(()=>({}));const result=await validateTelegramInitData(body.initData,env.TELEGRAM_BOT_TOKEN);return json(result,result.ok?200:401,cors(env,req))}
      if(url.pathname==='/telegram/link'&&req.method==='POST')return linkTelegram(req,env);
      if(url.pathname==='/telegram/webhook'&&req.method==='POST')return webhook(req,env);
      return json({ok:false,error:'not_found'},404,cors(env,req));
    }catch(err){console.error(err);return json({ok:false,error:'internal_error'},500,cors(env,req))}
  }
};
