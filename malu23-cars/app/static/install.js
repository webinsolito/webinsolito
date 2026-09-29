const q=s=>document.querySelector(s);
const ua=navigator.userAgent||'';
const isIOS=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isWindows=/Windows/i.test(ua);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const isWhatsApp=/WhatsApp/i.test(ua);
const isSafari=isIOS&&/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/i.test(ua)&&!isWhatsApp;
let deferredInstallPrompt=null;

// The install page can be the very first page opened from WhatsApp/Windows.
// Register the service worker here too so Chromium can consider the PWA
// installable without requiring a visit to the main dashboard first.
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

function show(id){document.querySelectorAll('.install-screen').forEach(x=>x.classList.add('hidden'));q(id)?.classList.remove('hidden');}
function launchApp(){location.replace('/launch?source=pwa&view=today');}

async function copyInstallLink(){
  const url=`${location.origin}/install`;
  try{await navigator.clipboard.writeText(url);q('#copyResult').textContent='Link copiato. Incollalo in Safari.';}
  catch(_){q('#copyResult').textContent=url;}
}

function updateIntro(){
  const btn=q('#startInstallBtn');
  const title=q('#installTitle');
  if(isWindows){
    if(btn)btn.textContent='Installa MALÙ23 CARS sul PC';
    if(title)title.textContent='Vuoi MALÙ23 CARS come programma sul PC?';
  }else if(isIOS){
    if(btn)btn.textContent='Sì, mettila sulla Home';
  }else{
    if(btn)btn.textContent='Installa MALÙ23 CARS';
  }
}

async function promptDesktopInstall(){
  show('#desktopGuide');
  const result=q('#desktopInstallResult');
  if(!deferredInstallPrompt){
    if(result)result.textContent='Se non compare il pulsante del browser, apri il menu ⋯ di Edge/Chrome e scegli “Installa app”.';
    return;
  }
  deferredInstallPrompt.prompt();
  const choice=await deferredInstallPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
  deferredInstallPrompt=null;
  if(choice.outcome==='accepted'){
    localStorage.setItem('malu23_install_guide_completed','1');
    show('#installedGuide');
  }else if(result){
    result.textContent='Nessun problema: puoi installarla quando vuoi da questa pagina.';
  }
}

function startGuide(){
  if(isStandalone()){show('#alreadyInstalled');setTimeout(launchApp,550);return;}
  if(isWindows){promptDesktopInstall();return;}
  if(!isIOS){show('#desktopGuide');return;}
  if(!isSafari){show('#openSafariGuide');return;}
  show('#safariGuide');
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  const result=q('#desktopInstallResult');
  if(result)result.textContent='Pronta da installare: un solo clic.';
});
window.addEventListener('appinstalled',()=>{
  localStorage.setItem('malu23_install_guide_completed','1');
  deferredInstallPrompt=null;
  show('#installedGuide');
});

q('#startInstallBtn')?.addEventListener('click',startGuide);
q('#desktopInstallBtn')?.addEventListener('click',promptDesktopInstall);
q('#notNowBtn')?.addEventListener('click',()=>location.href='/launch?view=today');
q('#backInstallBtn')?.addEventListener('click',()=>show('#installIntro'));
q('#backDesktopBtn')?.addEventListener('click',()=>show('#installIntro'));
q('#copyLinkBtn')?.addEventListener('click',copyInstallLink);
q('#doneInstallBtn')?.addEventListener('click',()=>{
  localStorage.setItem('malu23_install_guide_completed','1');
  show('#installedGuide');
});

updateIntro();
if(isStandalone()){
  show('#alreadyInstalled');
  setTimeout(launchApp,450);
}else if(new URLSearchParams(location.search).get('guide')==='1'){
  startGuide();
}
