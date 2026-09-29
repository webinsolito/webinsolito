(()=>{"use strict";
const root=document.getElementById("orbitCarousel"),track=document.getElementById("orbitTrack"),dots=document.getElementById("orbitDots");
if(!root||!track||!dots)return;
const items=[...track.querySelectorAll(".orbitItem")],n=items.length;
let active=2,down=false,startX=0,lastX=0,moved=false;
const mod=(v,m)=>((v%m)+m)%m;
function metrics(){
 const w=innerWidth;
 if(w<=430)return {one:122,two:226,s1:.86,s2:.66};
 if(w<=720)return {one:150,two:278,s1:.88,s2:.68};
 if(w<=1100)return {one:205,two:390,s1:.9,s2:.72};
 return {one:292,two:545,s1:.9,s2:.72};
}
function relFor(i){let r=mod(i-active,n);if(r>n/2)r-=n;return r}
function render(extra=0,instant=false){
 const m=metrics();
 items.forEach((el,i)=>{
   let r=relFor(i),x=0,z=0,s=1,ry=0,o=1;
   if(r===0){x=extra;z=120;s=1.11;ry=extra/18}
   else if(r===1){x=m.one+extra*.35;z=10;s=m.s1;ry=-16+extra/28}
   else if(r===-1){x=-m.one+extra*.35;z=10;s=m.s1;ry=16+extra/28}
   else if(r>=2){x=m.two+extra*.15;z=-120;s=m.s2;ry=-25;o=.86}
   else{x=-m.two+extra*.15;z=-120;s=m.s2;ry=25;o=.86}
   el.style.setProperty("--x",x+"px");
   el.style.setProperty("--z",z+"px");
   el.style.setProperty("--s",s);
   el.style.setProperty("--ry",ry+"deg");
   el.style.setProperty("--o",o);
   el.dataset.active=r===0?"true":"false";
   el.style.zIndex=String(20-Math.abs(r)*3);
   el.classList.toggle("isDragging",instant);
 });
 [...dots.children].forEach((d,i)=>d.classList.toggle("active",i===active));
}
function setActive(v){active=mod(v,n);render()}
items.forEach((el,i)=>{
 const b=document.createElement("button");b.type="button";b.className="orbitDot";b.setAttribute("aria-label","Mostra "+el.querySelector("b").textContent);b.onclick=()=>setActive(i);dots.appendChild(b);
 el.addEventListener("click",e=>{if(moved){e.preventDefault();return}if(i!==active){e.preventDefault();setActive(i)}});
});
root.querySelector(".orbitPrev").onclick=()=>setActive(active-1);
root.querySelector(".orbitNext").onclick=()=>setActive(active+1);
function pointerDown(e){down=true;moved=false;startX=e.clientX;lastX=e.clientX;root.setPointerCapture?.(e.pointerId);root.classList.add("dragging")}
function pointerMove(e){if(!down)return;lastX=e.clientX;const dx=lastX-startX;if(Math.abs(dx)>5)moved=true;render(Math.max(-110,Math.min(110,dx)),true)}
function pointerUp(e){if(!down)return;down=false;root.classList.remove("dragging");const dx=lastX-startX;items.forEach(el=>el.classList.remove("isDragging"));if(Math.abs(dx)>62)setActive(active+(dx<0?1:-1));else render();setTimeout(()=>moved=false,0)}
root.addEventListener("pointerdown",pointerDown);
root.addEventListener("pointermove",pointerMove);
root.addEventListener("pointerup",pointerUp);
root.addEventListener("pointercancel",pointerUp);
root.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"){e.preventDefault();setActive(active-1)}if(e.key==="ArrowRight"){e.preventDefault();setActive(active+1)}});
root.tabIndex=0;
let wheelLock=false;
root.addEventListener("wheel",e=>{if(Math.abs(e.deltaX)<18&&Math.abs(e.deltaY)<18)return;e.preventDefault();if(wheelLock)return;wheelLock=true;setActive(active+((Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)>0?1:-1));setTimeout(()=>wheelLock=false,340)},{passive:false});
addEventListener("resize",()=>render());
render();
const searchButton=document.querySelector(".searchSubmit"),input=document.getElementById("globalSearch");
searchButton?.addEventListener("click",()=>{input?.focus();input?.dispatchEvent(new Event("input",{bubbles:true}))});
})();