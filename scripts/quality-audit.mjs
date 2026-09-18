import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(path.join(root,'apps.json'),'utf8'));
const active=catalog.apps.filter(a=>['MVP','BETA','STABLE'].includes(a.status)&&a.path);
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const tokens=s=>(s||'').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g,' ').split(/\s+/).filter(Boolean);
const meaningful=s=>new Set(tokens(s).filter(x=>x.length>3));

const rows=[];
for(const app of active){
  const dir=path.join(root,app.path);
  const file=path.join(dir,'index.html');
  const html=read(file);
  const bytes=Buffer.byteLength(html);
  const inputs=(html.match(/<(input|textarea|select)\b/gi)||[]).length;
  const forms=(html.match(/<form\b/gi)||[]).length;
  const buttons=(html.match(/<button\b/gi)||[]).length;
  const labels=(html.match(/<label\b/gi)||[]).length;
  const resultSignals=(html.match(/(id|class)=["'][^"']*(result|output|summary|total|history|list|card|status|preview|score)[^"']*["']/gi)||[]).length;
  const storage=(/localStorage/i.test(html)?1:0)+(/indexedDB/i.test(html)?1:0);
  const exports=(/(download|export|scarica|esporta|clipboard|copia)/i.test(html)?1:0);
  const navigation=(html.match(/<a\b/gi)||[]).length;
  const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
  const styles=[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m=>m[1]);
  const imgs=[...html.matchAll(/<img\b/gi)].length;
  const externalDeps=scripts.filter(x=>/^https?:/i.test(x)).length;
  const viewport=/<meta[^>]+name=["']viewport["']/i.test(html);
  const brand=/WEBINSOLITO|Webinsolito/i.test(html);
  const shared=/webinsolito-core|microapp\.css|utility\.css|category-page/i.test(html);
  const responsive=/@media|clamp\(|min\(|max\(/i.test(html);
  const errors=/TODO|FIXME|NOT_AVAILABLE_IN_ENV|coming soon|in arrivo/i.test(html);
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
  const uniqueWords=meaningful((app.description||'')+' '+text).size;

  const utility=clamp(38 + Math.min(22,inputs*4) + (resultSignals?18:0) + (storage?10:0) + (exports?7:0) + Math.min(5,buttons));
  const depth=clamp(24 + Math.min(30,inputs*5) + Math.min(18,buttons*3) + (resultSignals?15:0) + (storage?8:0) + (exports?5:0));
  const ux=clamp(42 + Math.min(18,labels*3) + Math.min(12,buttons*2) + (navigation?8:0) + (errors?-20:8));
  const ui=clamp(42 + (shared?18:0) + (brand?8:0) + (viewport?8:0) + Math.min(12,imgs*2) + (responsive?10:0));
  const mobile=clamp(45 + (viewport?25:0) + (responsive?22:0) - (bytes>200000?8:0));
  const output=clamp(28 + Math.min(26,resultSignals*4) + (exports?20:0) + (storage?12:0) + Math.min(12,buttons*2));
  const speed=clamp(100 - Math.max(0,(bytes-12000)/1800) - externalDeps*18 - Math.max(0,scripts.length-5)*4 - imgs*1.5);
  const coherence=clamp(45 + (brand?20:0) + (shared?25:0) + (viewport?5:0));
  const uniqueness=clamp(35 + Math.min(30,uniqueWords/3) + Math.min(15,inputs*2) + (app.status==='BETA'?10:0));
  const reusability=clamp(30 + (storage?24:0) + (exports?15:0) + (resultSignals?13:0) + Math.min(18,inputs*3));
  const scores={utility,depth,ux,ui,mobile,output,speed,coherence,uniqueness,reusability};
  const score=clamp(Object.values(scores).reduce((a,b)=>a+b,0)/10);
  rows.push({
    id:app.id,name:app.name,category:app.category,status:app.status,path:app.path,
    bytes,inputs,forms,buttons,labels,resultSignals,storage:Boolean(storage),exports:Boolean(exports),
    navigation,scripts:scripts.length,externalDeps,styles:styles.length,imgs,viewport,responsive,shared,brand,errors,
    scores,score
  });
}

const byCat={};
for(const r of rows)(byCat[r.category]??=[]).push(r);
for(const a of Object.values(byCat))a.sort((x,y)=>x.score-y.score||x.bytes-y.bytes);
const worst=[...rows].sort((a,b)=>a.score-b.score||a.bytes-b.bytes).slice(0,30);
const visualSelection=Object.fromEntries(Object.entries(byCat).map(([k,v])=>[k,v.slice(0,3).map(x=>x.id)]));

const out={generated_at:new Date().toISOString(),active:rows.length,rows,worst30:worst.map(x=>x.id),visualSelection};
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results','quality-audit.json'),JSON.stringify(out,null,2));
const md=[
 '# Webinsolito quality audit',
 '',
 'Active apps: '+rows.length,
 '',
 '## Worst 30',
 '',
 ...worst.map((r,i)=>`${i+1}. **${r.name}** (${r.id}) — ${r.score}/100 — ${r.category} — ${r.bytes} B — inputs ${r.inputs}, results ${r.resultSignals}, storage ${r.storage?'yes':'no'}`),
 '',
 '## Visual selection (3 lowest structural scores/category)',
 '',
 ...Object.entries(visualSelection).map(([k,v])=>'- '+k+': '+v.join(', '))
];
fs.writeFileSync(path.join(root,'test-results','quality-audit.md'),md.join('\n'));
console.log(JSON.stringify({active:rows.length,worst30:out.worst30,visualSelection},null,2));
