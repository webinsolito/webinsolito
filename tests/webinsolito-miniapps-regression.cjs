"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const apps=["autobuddy","fuelgo","parkmemo","carcost","fuel-saver","tripcost","packr","frigochef","splitly","docpocket","screensort","bresciago","stylematch","safebuy"];
function read(name){return fs.readFileSync(path.join(root,name,"index.html"),"utf8");}
function scripts(name){
  return [...read(name).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(m=>!/application\/ld\+json/.test(m[1])&&m[2].trim()).map(m=>m[2]);
}
test("all 14 mini-app scripts parse without syntax errors",()=>{
  for(const app of apps)for(const script of scripts(app))assert.doesNotThrow(()=>new Function(script),app);
});
test("Splitly escapes hostile names in every HTML sink",()=>{
  const nodes=new Map(),name='<img src=x onerror=alert(1)>';
  function el(id){
    if(!nodes.has(id)){
      const cls=new Set();
      nodes.set(id,{value:"",innerHTML:"",textContent:"",
        classList:{add:x=>cls.add(x),remove:x=>cls.delete(x),contains:x=>cls.has(x)},
        listeners:{},addEventListener(kind,fn){this.listeners[kind]=fn},
        scrollIntoView(){},focus(){}});
    }
    return nodes.get(id);
  }
  el("total").value="120";el("names").value=name+",Luca";el("payer").value=name;
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  new Function("document","localStorage","window","navigator",scripts("splitly")[0])(
    {getElementById:el},storage,{},{});
  el("calculateBtn").listeners.click();
  for(const key of ["payer","debts","lastSplit"]){
    assert.ok(!el(key).innerHTML.includes("<img"),"unsafe markup in "+key);
    assert.ok(el(key).innerHTML.includes("&lt;img"),"text lost in "+key);
  }
});
test("Packr uses calendar days across DST and leap years",()=>{
  const js=scripts("packr")[0];
  const fn=new Function(js.slice(js.indexOf("function daysBetween("),js.indexOf("function packCount("))+"return daysBetween")();
  for(const [from,to] of [["2026-03-28","2026-03-29"],["2026-10-24","2026-10-25"],["2028-02-28","2028-02-29"]])
    assert.equal(fn(from,to),2,from+" -> "+to);
  assert.ok(Number.isNaN(fn("2026-02-30","2026-03-01")));
  assert.ok(fn("2026-11-04","2026-11-02")<1);
});
test("FrigoChef uses exact ingredients or whole-word matches",()=>{
  const js=scripts("frigochef")[0];
  const code=js.slice(js.indexOf("function norm("),js.indexOf("function escapeHtml("))+
    js.slice(js.indexOf("function hasIngredient("),js.indexOf("function recipeScore("));
  const factory=new Function("pantry",code+"return hasIngredient");
  assert.equal(factory(["a"])("pasta"),false);
  assert.equal(factory(["a"])("banana"),false);
  assert.equal(factory(["pasta integrale"])("pasta"),true);
  assert.equal(factory(["ceci"])("ceci"),true);
  assert.equal(factory(["pomodoro"])("pomodori"),false);
});
test("AutoBuddy refuses duplicate plates and rolls back storage failures",()=>{
  const js=scripts("autobuddy").find(s=>s.includes("function save()"));
  assert.match(js,/if\(S\.vehicles\.some\(v=>v\.plate===plate\)\)/);
  const save=js.slice(js.indexOf("function save(){"),js.indexOf("function uid(){"));
  const run=new Function("storage","let S={vehicles:['unsaved']};const load=()=>({vehicles:['persisted']});const render=()=>{};const alert=()=>{};const localStorage=storage;"+save+"try{save()}catch{}return S");
  assert.deepEqual(run({setItem(){throw Error("QuotaExceededError")}}),{vehicles:["persisted"]});
});
test("DocPocket and ScreenSort cap files and handle storage errors",()=>{
  const doc=scripts("docpocket")[0],screen=scripts("screensort")[0];
  assert.match(doc,/file\.size>MAX_FILE_BYTES/);
  assert.match(doc,/file&&!\//);
  assert.match(doc,/catch\{err\.textContent='Non riesco a salvare/);
  assert.match(screen,/file\.size>MAX_IMAGE_BYTES/);
  assert.match(screen,/Importazione interrotta/);
  assert.match(screen,/catch\{report\('Impossibile classificare/);
});
test("FuelGo displays age of published prices instead of claiming live data",()=>{
  const source=scripts("fuelgo")[0];
  assert.match(source,/source_date_prices/);
  assert.match(source,/Dati non recenti: verifica il prezzo alla pompa/);
});

test("DocPocket expiry counts actual calendar dates across daylight saving changes",()=>{
  const src=scripts("docpocket")[0];
  const fn=new Function(src.slice(src.indexOf("function days("),src.indexOf("function status("))+"return days")();
  const today=(year,month,day)=>({getFullYear:()=>year,getMonth:()=>month-1,getDate:()=>day});
  assert.equal(fn("2026-10-25",today(2026,10,24)),1,"Autumn clock change should be one day, not two");
  assert.equal(fn("2026-03-29",today(2026,3,28)),1,"Spring clock change should be one day");
  assert.equal(fn("2028-02-29",today(2028,2,28)),1,"Leap day is one calendar day ahead");
  assert.equal(fn("2026-10-22",today(2026,10,23)),-1,"Expired yesterday");
  assert.equal(fn("2026-10-23",today(2026,10,23)),0,"Expires today");
  assert.equal(fn("2026-02-30",today(2026,2,25)),null,"Reject impossible calendar date");
});
