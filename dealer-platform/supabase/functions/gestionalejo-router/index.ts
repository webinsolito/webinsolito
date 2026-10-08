const PROJECT='https://jnofezlhptbrkoxhdenx.supabase.co';
const CORE=`${PROJECT}/functions/v1/gestionalejo-gateway`;
const DOCS=`${PROJECT}/functions/v1/gestionalejo-documents`;
const TELEGRAM=`${PROJECT}/functions/v1/gestionalejo-telegram`;
const ALLOWED_HEADERS=['authorization','x-dealer-id','content-type','accept','origin','user-agent','x-telegram-bot-api-secret-token'];

function routePath(req:Request){
  const u=new URL(req.url),marker='/functions/v1/gestionalejo-router';
  let path=u.pathname;
  if(path.startsWith(marker))path=path.slice(marker.length)||'/';
  else for(const candidate of ['/telegram/','/documents/','/auth/','/admin/','/account/','/health']){
    const i=path.indexOf(candidate);if(i>=0){path=path.slice(i);break}
  }
  return {path,search:u.search};
}

function headersFor(req:Request){
  const h=new Headers();
  for(const k of ALLOWED_HEADERS){const v=req.headers.get(k);if(v)h.set(k,v)}
  return h;
}

Deno.serve(async(req:Request)=>{
  const {path,search}=routePath(req);
  let base=CORE,upPath=path;
  if(path.startsWith('/documents/')){base=DOCS;upPath=path.replace(/^\/documents/,'')}
  else if(path.startsWith('/telegram/')){base=TELEGRAM;upPath=path.replace(/^\/telegram/,'')}
  const target=`${base}${upPath}${search}`;
  try{
    const init:RequestInit={method:req.method,headers:headersFor(req),redirect:'manual'};
    if(!['GET','HEAD'].includes(req.method))init.body=req.body;
    const upstream=await fetch(target,init),headers=new Headers(upstream.headers);
    headers.set('cache-control','no-store');
    return new Response(upstream.body,{status:upstream.status,headers});
  }catch(e){
    console.error('router_error',String(e));
    return new Response(JSON.stringify({ok:false,error:'router_upstream_failed'}),{status:502,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
});
