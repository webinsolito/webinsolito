(()=>{
  const W=window.Webinsolito=window.Webinsolito||{};

  W.toast=(msg,duration=2600)=>{
    let el=document.getElementById('wi-toast');
    if(!el){
      el=document.createElement('div');
      el.id='wi-toast';
      el.className='wi-toast';
      el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      el.setAttribute('aria-atomic','true');
      document.body.appendChild(el);
    }
    el.textContent=String(msg??'');
    el.classList.add('show');
    clearTimeout(el._t);
    el._t=setTimeout(()=>el.classList.remove('show'),Math.max(1200,duration));
  };

  W.store={
    get(k,f=null){try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):f}catch{return f}},
    set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}},
    remove(k){try{localStorage.removeItem(k);return true}catch{return false}},
    clear(){try{localStorage.clear();return true}catch{return false}},
    clearPrefix(prefix){
      try{
        if(!prefix)return false;
        const keys=[];
        for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix))keys.push(k)}
        keys.forEach(k=>localStorage.removeItem(k));
        return true;
      }catch{return false}
    }
  };

  W.download=(name,text,type='application/json')=>{
    const a=document.createElement('a');
    const u=URL.createObjectURL(new Blob([text],{type}));
    a.href=u;
    a.download=name;
    a.hidden=true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),1500);
  };

  W.installPrompt=null;
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const hideInstall=()=>document.querySelector('.wi-app-install')?.remove();

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    W.installPrompt=e;
    document.documentElement.classList.add('wi-installable');
  });
  window.addEventListener('appinstalled',()=>{
    W.installPrompt=null;
    document.documentElement.classList.remove('wi-installable');
    hideInstall();
    W.toast('App installata');
  });

  W.install=async()=>{
    if(isStandalone()){
      hideInstall();
      return;
    }
    if(W.installPrompt){
      const prompt=W.installPrompt;
      prompt.prompt();
      const choice=await prompt.userChoice;
      W.installPrompt=null;
      if(choice?.outcome==='accepted')hideInstall();
      return;
    }
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
    W.toast(ios?'Su iPhone: Condividi → Aggiungi alla schermata Home':'Apri il menu del browser e scegli Installa app / Aggiungi alla schermata Home',4200);
  };

  W.mountInstall=()=>{
    if(isStandalone()||document.querySelector('.wi-app-install')||!document.querySelector('link[rel="manifest"]'))return;
    const p=location.pathname.replace(/\/+/g,'/');
    const homePaths=new Set(['/','/index.html','/webinsolito/','/webinsolito/index.html']);
    if(homePaths.has(p))return;
    const b=document.createElement('button');
    b.className='wi-app-install';
    b.type='button';
    b.textContent='Installa';
    b.setAttribute('aria-label','Installa questa app sul dispositivo');
    b.onclick=W.install;
    document.body.appendChild(b);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',W.mountInstall,{once:true});
  else W.mountInstall();

  const cs=document.currentScript;
  const insideMiniappProxy=location.pathname.startsWith('/miniapp/');
  if('serviceWorker'in navigator&&cs?.src&&!insideMiniappProxy){
    const sw=new URL('../sw.js',cs.src);
    navigator.serviceWorker.register(sw,{scope:new URL('../',cs.src).pathname,updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
  }
})();
