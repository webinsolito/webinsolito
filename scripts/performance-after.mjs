import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),files=['index.html','assets/home-search.js','assets/category-page.css','assets/category-page.js','assets/microapp.css','assets/microapp-pro.css','assets/microapp-pro-defs.js','assets/microapp-pro.js'];
const sizes=Object.fromEntries(files.map(f=>[f,fs.existsSync(path.join(root,f))?fs.statSync(path.join(root,f)).size:null]));
const cats=fs.readdirSync(path.join(root,'assets/categories-v2')).filter(x=>x.endsWith('.svg')).map(x=>fs.statSync(path.join(root,'assets/categories-v2',x)).size);
const apps=fs.readdirSync(path.join(root,'assets/app-icons-v2')).filter(x=>x.endsWith('.svg')).map(x=>fs.statSync(path.join(root,'assets/app-icons-v2',x)).size);
const out={generated_at:new Date().toISOString(),sizes,category_icons:{count:cats.length,total:cats.reduce((a,b)=>a+b,0),max:Math.max(...cats)},priority_app_icons:{count:apps.length,total:apps.reduce((a,b)=>a+b,0),max:Math.max(...apps)}};
fs.mkdirSync(path.join(root,'quality-artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'quality-artifacts/performance-after.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));