(()=>{"use strict";
const root=document.getElementById("orbitCarousel"),track=document.getElementById("orbitTrack"),dots=document.getElementById("orbitDots");
if(!root||!track||!dots)return;
const items=[...track.querySelectorAll(".orbitItem")],n=items.length;
let active=2,down=false,startX=0,lastX=0,lastAt=0,velocity=0,suppressClick=false;
const mod=(v,m)=>((v%m)+m)%m;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function metrics(){
 const w=innerWidth;
 if(w<=430)return {one:126,two:230,s1:.84,s2:.63,drag:92};
 if(w<=720)return {one:154,two:282,s1:.86,s2:.66,drag:106};
 if(w<=1100)return {one:215,two:402,s1:.88,s2:.7,drag:118};
 return {one:305,two:565,s1:.88,s2:.7,drag:132};
}
function relFor(i){let r=mod(i-active,n);if(r>n/2)r-=n;return r}
function render(extra=0,instant=false){
 const m=metrics();
 items.forEach((el,i)=>{
   const r=relFor(i);let x=0,z=0,s=1,ry=0,o=1;
   if(r===0){x=extra;z=130;s=1.1;ry=extra/24}
   else if(r===1){x=m.one+extra*.38;z=12;s=m.s1;ry=-14+extra/34}
   else if(r===-1){x=-m.one+extra*.38;z=12;s=m.s1;ry=14+extra/34}
   else if(r>=2){x=m.two+extra*.16;z=-120;s=m.s2;ry=-22;o=.78}
   else{x=-m.two+extra*.16;z=-120;s=m.s2;ry=22;o=.78}
   el.style.setProperty("--x",x+"px");el.style.setProperty("--z",z+"px");
   el.style.setProperty("--s",s);el.style.setProperty("--ry",ry+"deg");el.style.setProperty("--o",o);
   const current=r===0;el.dataset.active=current?"true":"false";el.setAttribute("aria-current",current?"true":"false");el.tabIndex=current?0:-1;
   el.style.zIndex=String(20-Math.abs(r)*3);el.classList.toggle("isDragging",instant);
 });
 [...dots.children].forEach((dot,i)=>{const current=i===active;dot.classList.toggle("active",current);dot.setAttribute("aria-pressed",current?"true":"false")});
}
function setActive(value){active=mod(value,n);render()}
items.forEach((el,i)=>{
 const label=el.querySelector("b")?.textContent||"categoria",dot=document.createElement("button");
 dot.type="button";dot.className="orbitDot";dot.setAttribute("aria-label","Mostra "+label);dot.addEventListener("click",()=>setActive(i));dots.appendChild(dot);
 el.addEventListener("dragstart",event=>event.preventDefault());
 el.addEventListener("click",event=>{if(suppressClick){event.preventDefault();return}if(i!==active){event.preventDefault();setActive(i)}});
});
root.querySelector(".orbitPrev")?.addEventListener("click",()=>setActive(active-1));
root.querySelector(".orbitNext")?.addEventListener("click",()=>setActive(active+1));
function pointerDown(event){
 if(event.button!==0||event.target.closest("button"))return;
 down=true;suppressClick=false;startX=lastX=event.clientX;lastAt=performance.now();velocity=0;
 root.setPointerCapture?.(event.pointerId);root.dataset.dragging="true";
}
function pointerMove(event){
 if(!down)return;
 const now=performance.now(),elapsed=Math.max(1,now-lastAt),next=event.clientX;
 velocity=(next-lastX)/elapsed;lastX=next;lastAt=now;
 const dx=lastX-startX;if(Math.abs(dx)>5)suppressClick=true;
 render(clamp(dx,-metrics().drag,metrics().drag),true);
}
function pointerUp(event){
 if(!down)return;
 down=false;delete root.dataset.dragging;root.releasePointerCapture?.(event.pointerId);
 const dx=lastX-startX,commit=Math.abs(dx)>52||Math.abs(velocity)>.42;
 items.forEach(el=>el.classList.remove("isDragging"));
 if(commit)setActive(active+(dx<0||velocity<-.42?1:-1));else render();
 setTimeout(()=>{suppressClick=false},90);
}
root.addEventListener("pointerdown",pointerDown);root.addEventListener("pointermove",pointerMove);
root.addEventListener("pointerup",pointerUp);root.addEventListener("pointercancel",pointerUp);
root.addEventListener("keydown",event=>{
 if(event.key==="ArrowLeft"){event.preventDefault();setActive(active-1)}
 if(event.key==="ArrowRight"){event.preventDefault();setActive(active+1)}
 if(event.key==="Home"){event.preventDefault();setActive(0)}
 if(event.key==="End"){event.preventDefault();setActive(n-1)}
});
root.tabIndex=0;
let wheelLock=false;
root.addEventListener("wheel",event=>{
 if(Math.abs(event.deltaX)<18||Math.abs(event.deltaX)<Math.abs(event.deltaY))return;
 event.preventDefault();if(wheelLock)return;wheelLock=true;setActive(active+(event.deltaX>0?1:-1));setTimeout(()=>wheelLock=false,380);
},{passive:false});
addEventListener("resize",()=>render());render();
const searchButton=document.querySelector(".searchSubmit"),input=document.getElementById("globalSearch");
searchButton?.addEventListener("click",()=>{input?.focus();input?.dispatchEvent(new Event("input",{bubbles:true}))});
})();
