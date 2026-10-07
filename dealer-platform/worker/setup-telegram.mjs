// Run locally AFTER the bot exists and the Worker is deployed.
// Required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, WORKER_URL, APP_URL

const {TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET_TOKEN,WORKER_URL,APP_URL}=process.env;
if(!TELEGRAM_BOT_TOKEN||!TELEGRAM_WEBHOOK_SECRET_TOKEN||!WORKER_URL||!APP_URL){
  console.error('Missing env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN, WORKER_URL, APP_URL');
  process.exit(1);
}
if(!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET_TOKEN)){
  console.error('TELEGRAM_WEBHOOK_SECRET_TOKEN must contain only A-Z a-z 0-9 _ -');
  process.exit(1);
}

const api=`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
async function call(method,payload){
  const r=await fetch(`${api}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json();if(!data.ok){console.error(method,data);process.exit(1)}console.log(`✓ ${method}`);return data.result;
}

const webhookUrl=`${WORKER_URL.replace(/\/$/,'')}/telegram/webhook`;
await call('setWebhook',{url:webhookUrl,secret_token:TELEGRAM_WEBHOOK_SECRET_TOKEN,allowed_updates:['message','callback_query'],drop_pending_updates:true});
await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Apri gestionale',web_app:{url:APP_URL}}});
await call('setMyCommands',{commands:[{command:'start',description:'Apri MALÙ23 CARS'},{command:'menu',description:'Mostra le sezioni del gestionale'},{command:'status',description:'Aggiorna richiami, consegne e lavori'}]});
const info=await call('getWebhookInfo',{});
console.log('\nWebhook:',info.url);
console.log('Pending updates:',info.pending_update_count);
console.log('Last error:',info.last_error_message||'none');

