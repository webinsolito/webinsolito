(()=>{"use strict";const catId=document.body.dataset.category,esc=s=>(s??'').toString().replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const intents={
auto:[["Quanto mi costa l’auto?","carcost"],["Mi scade la revisione","revisione-memo"],["Benzina meno cara","fuelgo"],["Quanto costa un viaggio?","tripcost"]],
food:[["Cosa cucino?","frigochef"],["Uso gli avanzi","leftover-chef"],["Organizzo la spesa","shopping-list"],["Ricalcolo le dosi","portion-calc"]],
money:[["Organizzo il budget","home-budget"],["Voglio risparmiare","savings-goal"],["Divido una spesa","splitly"],["Confronto due prestiti","loan-compare"]],
events:[["Cosa faccio stasera?","tonight"],["Questo weekend","weekend-go"],["Eventi gratis","free-events"],["Con bambini","family-events"]],
docs:[["Organizzo documenti","docpocket"],["Creo un QR","qrpocket"],["Salvo una garanzia","warranty-pocket"],["Documenti viaggio","travel-docs"]],
home:[["Misuro una stanza","room-measure"],["Devo pitturare","paint-calc"],["Calcolo piastrelle","tile-calc"],["Devo traslocare","moving-list"]],
travel:[["Preparo la valigia","packr"],["Calcolo il viaggio","fuel-trip"],["Tengo il budget","trip-budget"],["Documenti viaggio","travel-docs"]],
style:[["Qual è la mia taglia?","size-convert"],["Converto scarpe","shoe-size"],["Organizzo il guardaroba","wardrobe"],["Vale quello che costa?","cost-per-wear"]],
shopping:[["Questo sito è sicuro?","safebuy"],["Confronto prezzi","price-compare"],["Devo fare un reso","return-memo"],["Quando scade la garanzia?","warranty-check"]],
territory:[["Dove butto questo?","recycle-helper"],["Calendario rifiuti","waste-day"],["Registro rumori","noise-diary"],["Cose da fare vicino","bresciago"]],
business:[["Faccio un preventivo","quote-maker"],["Calcolo il margine","margin-calc"],["Rimborso chilometri","mileage"],["Organizzo clienti","client-memo"]],
study:[["Preparo un esame","exam-planner"],["Mi concentro","study-timer"],["Calcolo una data","date-calc"],["Converto unità","unit-tools"]]
};
let C,A=[];const appById=id=>A.find(a=>a.id===id&&["MVP","BETA","STABLE"].includes(a.status)&&a.path);
function draw(query=""){const live=A.filter(a=>["MVP","BETA","STABLE"].includes(a.status)&&a.path);const ranked=query.trim()&&window.WebinsolitoSearch?WebinsolitoSearch.search(query,live,[C],60).filter(x=>x.type==="app").map(x=>x.app):live;const seen=new Set(),visible=ranked.filter(a=>a&&!seen.has(a.id)&&(seen.add(a.id),true));apps.innerHTML=visible.length?visible.map(a=>'<a class="app" href="../'+a.path+'"><img src="../'+a.icon+'" alt=""><h3>'+esc(a.name)+'</h3><p>'+esc(a.description)+'</p></a>').join(""):'<div class="empty">Nessuno strumento trovato. Prova a descrivere il problema con altre parole.</div>'}
fetch("../apps.json",{cache:"no-store"}).then(r=>r.json()).then(x=>{C=x.categories.find(c=>c.id===catId);A=x.apps.filter(a=>a.category===catId);catIcon.src="../"+C.icon;catTitle.textContent=C.name;intentGrid.innerHTML=(intents[catId]||[]).map(([label,id])=>{const a=appById(id);return a?'<a class="intent" href="../'+a.path+'">'+esc(label)+'</a>':""}).join("");draw();search.oninput=()=>draw(search.value)}).catch(()=>apps.innerHTML='<div class="empty">Categoria non disponibile.</div>');
})();