/* DesignBox: locally packaged, no external CDN or third-party APIs. */
(async()=>{try{
  const parts=['./payload/p0.txt','./payload/p1.txt','./payload/p2.txt','./payload/p3.txt','./payload/p4.txt','./payload/p5.txt'];
  const responses=await Promise.all(parts.map(path=>fetch(path,{cache:'force-cache'})));
  if(responses.some(r=>!r.ok))throw Error('Payload non disponibile');
  const base64=(await Promise.all(responses.map(r=>r.text()))).join('');
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const source=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const code=JSON.parse(source);
  const style=document.createElement('style');style.textContent=code.css;document.head.appendChild(style);
  document.getElementById('app').style.visibility='visible';
  const script=document.createElement('script');script.textContent=code.js;document.body.appendChild(script);
}catch(error){console.error('DesignBox bootstrap:',error);const app=document.getElementById('app');app.style.visibility='visible';app.innerHTML='<main style="font:16px system-ui;padding:32px;max-width:460px;margin:auto"><h1>DesignBox</h1><p>Impossibile completare il caricamento. Controlla la connessione e riapri l’app.</p><button onclick="location.reload()">Riprova</button></main>';}})();