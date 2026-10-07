// MALÙ23 Dealer Platform — Cloudflare Worker bootstrap
// Secrets expected in Worker environment only:
// TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, APP_URL

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

async function hmac(key,data){
  const cryptoKey=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(data)));
}
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');

async function validateTelegramInitData(initData,botToken,maxAgeSeconds=300){
  if(!initData||!botToken)return {ok:false,reason:'missing_data'};
  const params=new URLSearchParams(initData),receivedHash=params.get('hash');
  if(!receivedHash)return {ok:false,reason:'missing_hash'};
  params.delete('hash');
  params.delete('signature');
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
  return {ok:true,user,authDate};
}

async function telegram(method,env,payload){
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok)throw new Error(`telegram_${r.status}`);return r.json();
}

async function webhook(req,env){
  const secret=req.headers.get('x-telegram-bot-api-secret-token');
  if(!env.TELEGRAM_WEBHOOK_SECRET_TOKEN||secret!==env.TELEGRAM_WEBHOOK_SECRET_TOKEN)return json({ok:false,error:'forbidden'},403);
  const update=await req.json();
  const msg=update.message||update.callback_query?.message;
  const chatId=msg?.chat?.id;
  if(!chatId)return json({ok:true,ignored:true});
  const text=update.message?.text||'';
  if(text==='/start'){
    await telegram('sendMessage',env,{chat_id:chatId,text:'🔒 ACCESSO RISERVATO\n\nGestionale disponibile esclusivamente alle concessionarie autorizzate.',reply_markup:{inline_keyboard:[[ {text:'ACCEDI',web_app:{url:env.APP_URL}} ],[ {text:'ATTIVA CONCESSIONARIA',web_app:{url:`${env.APP_URL}?activate=1`}} ]]}});
  }
  return json({ok:true});
}

export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==='/health')return json({ok:true,service:'malu23-dealer-worker',version:'0.1.0'});
    if(url.pathname==='/telegram/validate'&&req.method==='POST'){
      const body=await req.json().catch(()=>({}));
      const result=await validateTelegramInitData(body.initData,env.TELEGRAM_BOT_TOKEN);
      return json(result,result.ok?200:401);
    }
    if(url.pathname==='/telegram/webhook'&&req.method==='POST')return webhook(req,env);
    return json({ok:false,error:'not_found'},404);
  }
};
