(()=>{"use strict";
const root=document.getElementById("orbitCarousel"),
      track=document.getElementById("orbitTrack"),
      dots=document.getElementById("orbitDots");
if(!root||!track||!dots)return;

const items=[...track.querySelectorAll(".orbitItem")];
const count=items.length;
const mod=(v,m)=>((v%m)+m)%m;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const shortest=(v,m)=>mod(v+m/2,m)-m/2;
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");

let position=2;
let velocity=0;
let mode="idle";
let springTarget=2;
let pointerId=null;
let startX=0,startY=0,lastX=0,lastY=0,lastTime=0,dragStartPosition=2;
let moved=false,horizontalIntent=false,suppressClickUntil=0;
let raf=0,lastFrame=performance.now();

function metrics(){
 const w=innerWidth;
 if(w<=430)return {spacing:158,pixelsPerItem:116,center:1.18,side:.73,far:.52};
 if(w<=720)return {spacing:182,pixelsPerItem:130,center:1.19,side:.75,far:.54};
 if(w<=1100)return {spacing:242,pixelsPerItem:170,center:1.19,side:.78,far:.57};
 return {spacing:294,pixelsPerItem:195,center:1.19,side:.79,far:.57};
}
function ease(t){return t*t*(3-2*t)}
function nearestIndex(){return mod(Math.round(position),count)}
function targetForIndex(index){return position+shortest(index-position,count)}
function itemRelative(index){return shortest(index-position,count)}

function render(){
 const m=metrics();
 const nearest=nearestIndex();
 items.forEach((el,index)=>{
   const rel=itemRelative(index),a=Math.abs(rel);
   const compressed=rel*m.spacing*(1-Math.min(a,2.5)*.035);
   const t1=Math.min(a,1),t2=Math.max(0,Math.min(a-1,1.5));
   const scale=a<=1
     ? m.center+(m.side-m.center)*ease(t1)
     : m.side+(m.far-m.side)*Math.min(t2/1.5,1);
   const z=150-Math.min(a,2.5)*120;
   const ry=clamp(-rel*13,-28,28);
   const y=5+Math.min(a,2.4)*8;
   const opacity=clamp(1-Math.max(0,a-1)*.18,.62,1);
   const bright=clamp(1-Math.max(0,a-.55)*.12,.72,1);

   el.style.setProperty("--x",compressed.toFixed(2)+"px");
   el.style.setProperty("--y",y.toFixed(2)+"px");
   el.style.setProperty("--z",z.toFixed(2)+"px");
   el.style.setProperty("--s",scale.toFixed(4));
   el.style.setProperty("--ry",ry.toFixed(2)+"deg");
   el.style.setProperty("--o",opacity.toFixed(3));
   el.style.setProperty("--bright",bright.toFixed(3));
   const current=index===nearest;
   el.dataset.active=current?"true":"false";
   el.setAttribute("aria-current",current?"true":"false");
   el.tabIndex=current?0:-1;
   el.style.zIndex=String(30-Math.round(a*5));
 });
 [...dots.children].forEach((dot,index)=>{
   const current=index===nearest;
   dot.classList.toggle("active",current);
   dot.setAttribute("aria-pressed",current?"true":"false");
 });
}

function ensureLoop(){
 if(!raf){lastFrame=performance.now();raf=requestAnimationFrame(frame)}
}
function stopLoop(){if(raf){cancelAnimationFrame(raf);raf=0}}
function frame(now){
 raf=0;
 const dt=Math.min(.034,Math.max(.001,(now-lastFrame)/1000));
 lastFrame=now;

 if(mode==="inertia"){
   position+=velocity*dt;
   velocity*=Math.exp(-6.1*dt);
   if(Math.abs(velocity)<.78){
     springTarget=Math.round(position);
     mode="spring";
   }
 }else if(mode==="spring"){
   const displacement=springTarget-position;
   const acceleration=displacement*72-velocity*17;
   velocity+=acceleration*dt;
   position+=velocity*dt;
   if(Math.abs(displacement)<.01&&Math.abs(velocity)<.045){
     position=springTarget;velocity=0;mode="idle";
   }
 }

 if(Math.abs(position)>5000){
   const cycles=Math.trunc(position/count);
   position-=cycles*count;
   springTarget-=cycles*count;
 }
 render();
 if(mode==="inertia"||mode==="spring")ensureLoop();
}

function springTo(target){
 if(reducedMotion.matches){
   position=target;springTarget=target;velocity=0;mode="idle";stopLoop();render();return;
 }
 springTarget=target;
 mode="spring";
 velocity=clamp(velocity,-3.8,3.8);
 ensureLoop();
}
function selectIndex(index){springTo(targetForIndex(index))}
function step(direction){
 const base=Math.round(position);
 springTo(base+direction);
}

items.forEach((el,index)=>{
 const label=el.querySelector("b")?.textContent?.trim()||"categoria";
 const dot=document.createElement("button");
 dot.type="button";dot.className="orbitDot";
 dot.setAttribute("aria-label","Mostra "+label);
 dot.addEventListener("click",()=>selectIndex(index));
 dots.appendChild(dot);

 el.draggable=false;
 el.querySelectorAll("img").forEach(img=>img.draggable=false);
 el.addEventListener("dragstart",event=>event.preventDefault());
 el.addEventListener("click",event=>{
   if(performance.now()<suppressClickUntil){event.preventDefault();return}
   const rel=Math.abs(itemRelative(index));
   const settled=mode==="idle"&&rel<.035;
   if(!settled){
     event.preventDefault();
     velocity=0;
     selectIndex(index);
   }
 });
});

root.querySelector(".orbitPrev")?.addEventListener("click",()=>step(-1));
root.querySelector(".orbitNext")?.addEventListener("click",()=>step(1));

root.addEventListener("pointerdown",event=>{
 if(event.button!==0||event.target.closest("button"))return;
 pointerId=event.pointerId;
 startX=lastX=event.clientX;startY=lastY=event.clientY;
 lastTime=performance.now();dragStartPosition=position;
 velocity=0;moved=false;horizontalIntent=false;mode="drag";
 root.dataset.dragging="true";
 root.setPointerCapture?.(pointerId);
 stopLoop();
});

root.addEventListener("pointermove",event=>{
 if(mode!=="drag"||event.pointerId!==pointerId)return;
 const now=performance.now();
 const dxTotal=event.clientX-startX,dyTotal=event.clientY-startY;
 if(!horizontalIntent&&Math.abs(dxTotal)>5){
   horizontalIntent=Math.abs(dxTotal)>Math.abs(dyTotal)*.72;
 }
 if(!horizontalIntent)return;
 event.preventDefault();
 const m=metrics();
 position=dragStartPosition-dxTotal/m.pixelsPerItem;
 const dt=Math.max(.004,(now-lastTime)/1000);
 const deltaItems=-(event.clientX-lastX)/m.pixelsPerItem;
 const instant=deltaItems/dt;
 velocity=velocity*.72+instant*.28;
 velocity=clamp(velocity,-6.5,6.5);
 lastX=event.clientX;lastY=event.clientY;lastTime=now;
 if(Math.abs(dxTotal)>6)moved=true;
 render();
});

function release(event){
 if(mode!=="drag"||event.pointerId!==pointerId)return;
 delete root.dataset.dragging;
 root.releasePointerCapture?.(pointerId);
 pointerId=null;
 if(moved)suppressClickUntil=performance.now()+230;
 if(reducedMotion.matches){
   position=Math.round(position);springTarget=position;velocity=0;mode="idle";render();
 }else if(horizontalIntent&&Math.abs(velocity)>.18){
   mode="inertia";
   ensureLoop();
 }else{
   velocity=0;
   springTarget=Math.round(position);
   mode="spring";
   ensureLoop();
 }
}
root.addEventListener("pointerup",release);
root.addEventListener("pointercancel",release);

root.addEventListener("keydown",event=>{
 if(event.key==="ArrowLeft"){event.preventDefault();velocity=0;step(-1)}
 if(event.key==="ArrowRight"){event.preventDefault();velocity=0;step(1)}
 if(event.key==="Home"){event.preventDefault();velocity=0;selectIndex(0)}
 if(event.key==="End"){event.preventDefault();velocity=0;selectIndex(count-1)}
 if(event.key==="Enter"){
   const index=nearestIndex(),current=items[index];
   if(document.activeElement===root&&mode==="idle"&&current?.href){
     event.preventDefault();location.href=current.href;
   }
 }
});
root.tabIndex=0;

let wheelTimer=0;
root.addEventListener("wheel",event=>{
 if(Math.abs(event.deltaX)<10||Math.abs(event.deltaX)<Math.abs(event.deltaY))return;
 event.preventDefault();
 const m=metrics();
 position+=event.deltaX/(m.pixelsPerItem*3.4);
 if(reducedMotion.matches){position=Math.round(position);springTarget=position;velocity=0;mode="idle";render();return}
 velocity=clamp(event.deltaX/(m.pixelsPerItem*.07),-6,6);
 mode="inertia";
 render();ensureLoop();
 clearTimeout(wheelTimer);
 wheelTimer=setTimeout(()=>{if(mode==="inertia"){springTarget=Math.round(position);mode="spring";ensureLoop()}},90);
},{passive:false});

addEventListener("resize",()=>render());
reducedMotion.addEventListener?.("change",()=>{position=Math.round(position);springTarget=position;velocity=0;mode="idle";stopLoop();render()});
render();

const searchButton=document.querySelector(".searchSubmit"),input=document.getElementById("globalSearch");
searchButton?.addEventListener("click",()=>{input?.focus();input?.dispatchEvent(new Event("input",{bubbles:true}))});
})();
