const VERSION='2.0.0';
chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
 let url;try{url=new URL(sender.url)}catch{return false}
 if(url.origin!=='https://webinsolito.github.io'||!url.pathname.startsWith('/webinsolito/autobid/'))return false;
 const response=(data)=>reply({protocol:1,version:VERSION,requestId:message.requestId,...data});
 if(message.protocol!==1||message.version!==VERSION){response({error:'VERSION_MISMATCH: aggiorna PWA ed estensione a '+VERSION});return false}
 if(message.type==='AUTOBID_HELLO'){response({state:'ready'});return false}
 if(message.type!=='AUTOBID_SCAN'){response({error:'UNSUPPORTED_MESSAGE'});return false}
 (async()=>{try{
 const tabs=await chrome.tabs.query({url:['https://*.autoproff.com/*']});
 if(!tabs.length)throw Error('AUTOPROFF_NOT_OPEN: apri AutoProff ed effettua l’accesso.');
 const tab=tabs.find(t=>t.active)||tabs[0];
 const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
 // Conservative adapter: consume explicit structured fields only.
 // No localized text guesses, inferred accident status or missing-to-zero coercion.
 return [...document.querySelectorAll('[data-auction-id]')].slice(0,5000).map(el=>{
 const numeric=v=>v!==null&&/^\d+(\.\d+)?$/.test(v)?Number(v):null;
 return {id:el.getAttribute('data-auction-id'),name:el.getAttribute('data-vehicle-title')||'Veicolo AutoProff',km:numeric(el.getAttribute('data-mileage-km')),registered:el.getAttribute('data-first-registration'),accident:el.getAttribute('data-accident')==='true'?true:el.getAttribute('data-accident')==='false'?false:null};
 });
 }});
 const rows=results.flatMap(x=>x.result||[]);
 if(!rows.length)throw Error('ADAPTER_NO_RECORDS: nessun record strutturato riconosciuto. Il layout AutoProff autenticato deve ancora essere validato.');
 response({state:'complete',rows});
 }catch(error){response({error:error.message||'SCAN_FAILED'})}})();return true;
});