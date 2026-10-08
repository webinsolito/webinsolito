const JSON_SECURITY={
  'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=()','x-frame-options':'DENY'
};
const ALLOWED_HEADERS=['authorization','x-dealer-id','content-type','accept','origin','user-agent','x-telegram-bot-api-secret-token'];
const ALLOWED_ORIGINS=new Set(['https://webinsolito.github.io','https://web.telegram.org','http://localhost','http://127.0.0.1']);
const ROUTES=new Map<string,Set<string>>([
  ['/health',new Set(['GET'])],['/activate',new Set(['POST'])],['/auth/resolve-login',new Set(['POST'])],
  ['/admin/overview',new Set(['GET'])],['/admin/member/create',new Set(['POST'])],['/admin/member/update',new Set(['POST'])],
  ['/admin/member/reset-password',new Set(['POST'])],['/admin/dealer/update',new Set(['POST'])],['/account/change-password',new Set(['POST'])],
  ['/documents/file',new Set(['GET','PUT'])],['/telegram/health',new Set(['GET'])],['/telegram/validate',new Set(['POST'])],
  ['/telegram/link',new Set(['POST'])],['/telegram/webhook',new Set(['POST'])]
]);
const project=()=>Deno.env.get('SUPABASE_URL')||'';
function routePath(req:Request){const u=new URL(req.url),marker='/functions/v1/gestionalejo-router';let path=u.pathname;if(path.startsWith(marker))path=path.slice(marker.length)||'/';else{const markers=['/documents/','/telegram/','/auth/','/admin/','/account/','/activate','/health'];for(const candidate of markers){const i=path.indexOf(candidate);if(i>=0){path=path.slice(i);break}}}return {path,search:u.search}}
function requestOriginAllowed(req:Request){const origin=req.headers.get('origin')||'';return !origin||ALLOWED_ORIGINS.has(origin)}
function headersFor(req:Request){const h=new Headers();for(const k of ALLOWED_HEADERS){const v=req.headers.get(k);if(v)h.set(k,v)}h.delete('cookie');h.delete('x-forwarded-for');return h}
function responseHeaders(source?:Headers){const h=new Headers(source);for(const [k,v] of Object.entries(JSON_SECURITY))h.set(k,v);h.delete('set-cookie');h.delete('server');h.delete('x-powered-by');return h}
function fail(error:string,status:number,req:Request,extra:Record<string,string>={}){const h=responseHeaders();h.set('content-type','application/json; charset=utf-8');const origin=req.headers.get('origin')||'';if(origin&&ALLOWED_ORIGINS.has(origin)){h.set('access-control-allow-origin',origin);h.set('vary','Origin')}for(const [k,v] of Object.entries(extra))h.set(k,v);return new Response(JSON.stringify({ok:false,error}),{status,headers:h})}
function bodyLimit(path:string){if(path==='/documents/file')return 20*1024*1024+1024;if(path==='/telegram/webhook')return 1024*1024;return 64*1024}
function targetFor(path:string){const root=project();if(!root)return null;if(path.startsWith('/documents/'))return {base:`${root}/functions/v1/gestionalejo-documents`,upPath:path.replace(/^\/documents/,'')};if(path.startsWith('/telegram/'))return {base:`${root}/functions/v1/gestionalejo-telegram`,upPath:path.replace(/^\/telegram/,'')};return {base:`${root}/functions/v1/gestionalejo-gateway`,upPath:path}}
Deno.serve(async(req:Request)=>{
  const {path,search}=routePath(req),methods=ROUTES.get(path);
  if(req.method==='OPTIONS'){
    if(!requestOriginAllowed(req))return fail('origin_not_allowed',403,req);
    const h=responseHeaders();const origin=req.headers.get('origin')||'';if(origin){h.set('access-control-allow-origin',origin);h.set('vary','Origin')}h.set('access-control-allow-methods',methods?[...methods,'OPTIONS'].join(','):'GET,POST,PUT,OPTIONS');h.set('access-control-allow-headers','content-type,authorization,x-dealer-id,x-telegram-bot-api-secret-token');h.set('access-control-max-age','600');return new Response(null,{status:204,headers:h});
  }
  if(!requestOriginAllowed(req))return fail('origin_not_allowed',403,req);
  if(!methods)return fail('not_found',404,req);
  if(!methods.has(req.method))return fail('method_not_allowed',405,req,{allow:[...methods].join(', ')});
  const length=Number(req.headers.get('content-length')||0),limit=bodyLimit(path);if(length>limit)return fail('payload_too_large',413,req);
  const target=targetFor(path);if(!target)return fail('backend_not_configured',503,req);
  try{
    const init:RequestInit={method:req.method,headers:headersFor(req),redirect:'manual'};if(!['GET','HEAD'].includes(req.method))init.body=req.body;
    const upstream=await fetch(`${target.base}${target.upPath}${search}`,init),headers=responseHeaders(upstream.headers);
    return new Response(upstream.body,{status:upstream.status,headers});
  }catch(e){console.error('router_error',String(e));return fail('router_upstream_failed',502,req)}
});
