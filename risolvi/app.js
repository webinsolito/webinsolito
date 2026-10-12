import { extractFiles, inferFacts, shutdownExtractionWorkers } from './extractor.js';

const $ = id => document.getElementById(id);
const state = { documents: [], inference: { facts: {}, candidates: [], conflicts: [] } };

const SOURCES = {
  guarantee: {
    title: 'MIMIT — Garanzia legale',
    url: 'https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/garanzia-legale',
  },
  withdrawal: {
    title: 'MIMIT — Diritto di recesso',
    url: 'https://www.mimit.gov.it/it/assistenza/domande-frequenti/diritto-di-recesso-domande-frequenti-faq',
  },
  distance: {
    title: 'MIMIT — Vendita a distanza',
    url: 'https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/vendita-a-distanza',
  },
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function yesNoValue(id) {
  const value = $(id).value;
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function setYesNo(id, value) {
  if (value === true) $(id).value = 'yes';
  if (value === false) $(id).value = 'no';
}

function setStatus(message, tone = '') {
  const node = $('extractStatus');
  node.textContent = message;
  node.dataset.tone = tone;
}

function renderFiles(files) {
  $('fileList').innerHTML = files.length
    ? files.map(file => `<div class="fileRow"><div><b>${escapeHtml(file.name)}</b><span>${Math.ceil(file.size / 1024)} KB</span></div><span class="pill">locale</span></div>`).join('')
    : '';
}

function renderExtraction() {
  const { candidates, conflicts } = state.inference;
  const panel = $('evidencePanel');
  if (!candidates.length) {
    panel.innerHTML = '<div class="empty">Non ho trovato fatti affidabili da precompilare. Puoi inserirli tu.</div>';
    return;
  }
  const conflictSet = new Set(conflicts);
  panel.innerHTML = candidates.slice(0, 20).map(item => {
    const conflict = conflictSet.has(item.key);
    return `<article class="evidence ${conflict ? 'conflict' : ''}">
      <div class="evidenceTop"><b>${escapeHtml(item.key)}</b><span>${escapeHtml(item.confidence)}${conflict ? ' · conflitto' : ''}</span></div>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.evidence.filename)}${item.evidence.page ? ` · pag. ${item.evidence.page}` : ''} · ${escapeHtml(item.evidence.method)}</small>
      <p>${escapeHtml(item.evidence.span)}</p>
    </article>`;
  }).join('');
}

function prefillForm() {
  const facts = state.inference.facts;
  if (facts.problem) $('problem').value = facts.problem;
  if (facts.seller_name) $('sellerName').value = facts.seller_name;
  if (facts.delivery_date) $('deliveryDate').value = facts.delivery_date;
  if (facts.promised_delivery_date) $('promisedDate').value = facts.promised_delivery_date;
  setYesNo('distancePurchase', facts.distance_purchase);
  setYesNo('professionalSeller', facts.professional_seller);
  setYesNo('physicalGood', facts.physical_good);
  if (facts.customised === true) $('customised').checked = true;
  if (facts.perishable === true) $('perishable').checked = true;
}

async function processFiles() {
  const files = [...$('files').files].slice(0, 8);
  renderFiles(files);
  if (!files.length) return;
  $('processBtn').disabled = true;
  $('reviewCard').classList.add('hidden');
  $('resultCard').classList.add('hidden');
  try {
    state.documents = await extractFiles(files, message => setStatus(message));
    state.inference = inferFacts(state.documents);
    renderExtraction();
    prefillForm();
    $('reviewCard').classList.remove('hidden');
    const conflicts = state.inference.conflicts.length;
    setStatus(conflicts ? `Analisi completata. ${conflicts} dato/i in conflitto: controllali prima di continuare.` : 'Analisi completata. Controlla e conferma i fatti estratti.', conflicts ? 'warn' : 'good');
    $('reviewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const messages = {
      file_too_large: 'Un file supera 8 MB.',
      unsupported_file_type: 'Formato non supportato. Usa immagini, PDF, EML, TXT o HTML.',
      ocr_engine_load_failed: 'Non riesco a caricare il motore OCR. Controlla la connessione e riprova.',
    };
    setStatus(messages[error.message] || `Analisi non riuscita: ${error.message}`, 'bad');
  } finally {
    $('processBtn').disabled = false;
  }
}

function monthsBetween(isoDate, now = new Date()) {
  const start = new Date(`${isoDate}T00:00:00Z`);
  return (now - start) / (1000 * 60 * 60 * 24 * 30.4375);
}

function daysBetween(isoDate, now = new Date()) {
  const start = new Date(`${isoDate}T00:00:00Z`);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

function result(status, title, explanation, options = {}) {
  return { status, title, explanation, route: options.route || null, draft: options.draft || '', sources: options.sources || [], missing: options.missing || [] };
}

function analyseFacts(f) {
  const missingCommon = [];
  if (f.consumer === null) missingCommon.push('se l’acquisto è stato fatto come privato');
  if (f.professionalSeller === null) missingCommon.push('se il venditore è un professionista');
  if (!f.sellerCountry) missingCommon.push('paese del venditore');
  if (f.physicalGood === null) missingCommon.push('se si tratta di un bene fisico');
  if (missingCommon.length) return result('warn', 'Manca un fatto decisivo', `Prima di applicare una regola devo sapere: ${missingCommon.join(', ')}.`, { missing: missingCommon });

  if (!f.consumer || !f.professionalSeller) return result('bad', 'Caso fuori dal perimetro automatico', 'Questa versione copre soltanto acquisti B2C tra consumatore e venditore professionale.');
  if (!['IT', 'EU'].includes(f.sellerCountry)) return result('bad', 'Venditore extra-UE: serve un percorso diverso', 'RISOLVI v0.2 non applica automaticamente il rule pack Italia/UE ai venditori extra-UE.');
  if (!f.physicalGood) return result('bad', 'Tipo di acquisto non ancora supportato', 'Questa versione tratta beni fisici ordinari, non servizi o contenuti digitali.');

  const seller = f.sellerName || 'il venditore';
  if (['defect', 'redirect'].includes(f.problem)) {
    if (!f.deliveryDate) return result('warn', 'Serve la data di consegna', 'La data cambia il percorso temporale della garanzia.', { missing: ['data di consegna'] });
    const months = monthsBetween(f.deliveryDate);
    if (months < 0) return result('warn', 'Controlla la data di consegna', 'La data inserita risulta futura.');
    if (months > 24) return result('warn', 'Non affermo automaticamente la copertura', 'La consegna risulta oltre 24 mesi fa: questa versione richiede una verifica specifica prima di suggerire una richiesta basata sulla garanzia legale.', { route: 'LEGAL_GUARANTEE_REVIEW', sources: [SOURCES.guarantee] });
    return result('good', 'Il prossimo passo: scrivi al venditore', 'Sui fatti che hai confermato, il caso rientra nel percorso di garanzia legale gestito da RISOLVI.', {
      route: 'LEGAL_GUARANTEE', sources: [SOURCES.guarantee],
      draft: `Gentili ${seller},\n\nsegnalo un problema di conformità/difetto relativo al bene consegnato il ${f.deliveryDate}. Chiedo di gestire la pratica nell'ambito della garanzia legale e di indicarmi il percorso per il ripristino della conformità.\n\nCordiali saluti`,
    });
  }

  if (['withdrawal', 'refund'].includes(f.problem)) {
    if (f.distancePurchase !== true) return result('bad', 'Il percorso standard di recesso non è applicabile automaticamente', 'Questa versione tratta il recesso degli acquisti online/a distanza.');
    if (f.customised || f.perishable || f.hygieneOpened) return result('warn', 'Possibile eccezione al recesso', 'Una caratteristica del bene può richiedere una verifica specifica. RISOLVI non applica automaticamente il termine standard.', { route: 'WITHDRAWAL_EXCEPTION_REVIEW', sources: [SOURCES.withdrawal] });
    if (!f.deliveryDate) return result('warn', 'Serve la data di consegna', 'È necessaria per controllare il termine standard.', { missing: ['data di consegna'] });
    const days = daysBetween(f.deliveryDate);
    if (days < 0) return result('warn', 'Controlla la data di consegna', 'La data inserita risulta futura.');
    if (days > 14) return result('warn', 'Il termine standard risulta superato', 'Questa versione non applica automaticamente eventuali estensioni o eccezioni informative: serve una verifica ulteriore.', { route: 'WITHDRAWAL_LATE_REVIEW', sources: [SOURCES.withdrawal] });
    return result('good', 'Il prossimo passo: comunica il recesso', 'Sui fatti confermati il caso rientra nel percorso standard di recesso a distanza.', {
      route: 'WITHDRAWAL', sources: [SOURCES.withdrawal],
      draft: `Gentili ${seller},\n\ncomunico la mia volontà di recedere dall'acquisto online e chiedo le istruzioni operative per la restituzione.\n\nCordiali saluti`,
    });
  }

  if (f.problem === 'not-delivered') {
    if (f.distancePurchase !== true) return result('bad', 'Percorso consegna online non applicabile', 'La v0.2 tratta la mancata consegna negli acquisti a distanza.');
    if (!f.promisedDate) return result('warn', 'Serve il termine di consegna promesso', 'Non qualifico il ritardo senza la data o il termine indicato dal venditore.', { missing: ['termine di consegna'] });
    if (new Date(`${f.promisedDate}T00:00:00Z`) > new Date()) return result('warn', 'Il termine non è ancora trascorso', 'La data promessa risulta futura.', { sources: [SOURCES.distance] });
    return result('good', 'Il prossimo passo: contesta la mancata consegna', 'Il termine che hai confermato risulta trascorso. RISOLVI prepara una richiesta al venditore senza promettere automaticamente un rimborso immediato.', {
      route: 'DELIVERY', sources: [SOURCES.distance],
      draft: `Gentili ${seller},\n\nl'ordine non risulta consegnato nonostante il termine indicato sia trascorso. Chiedo lo stato effettivo della spedizione e un termine certo per la consegna.\n\nCordiali saluti`,
    });
  }

  return result('bad', 'Caso non ancora supportato', 'Questa versione non ha una regola automatica per il problema selezionato.');
}

function collectFacts() {
  return {
    problem: $('problem').value,
    sellerName: $('sellerName').value.trim(),
    sellerCountry: $('sellerCountry').value,
    consumer: yesNoValue('consumer'),
    professionalSeller: yesNoValue('professionalSeller'),
    distancePurchase: yesNoValue('distancePurchase'),
    physicalGood: yesNoValue('physicalGood'),
    deliveryDate: $('deliveryDate').value || null,
    promisedDate: $('promisedDate').value || null,
    customised: $('customised').checked,
    perishable: $('perishable').checked,
    hygieneOpened: $('hygieneOpened').checked,
  };
}

function renderResult(data) {
  const card = $('resultCard');
  card.classList.remove('hidden');
  $('resultStatus').className = `status ${data.status}`;
  $('resultStatus').textContent = data.status === 'good' ? 'Percorso utilizzabile' : data.status === 'warn' ? 'Serve un controllo' : 'Fuori perimetro';
  $('resultTitle').textContent = data.title;
  $('resultExplanation').textContent = data.explanation;
  $('routeCode').textContent = data.route || '—';
  $('sourceList').innerHTML = data.sources.length ? data.sources.map(source => `<a class="source" href="${source.url}" target="_blank" rel="noopener"><b>${escapeHtml(source.title)}</b><span>Apri fonte ufficiale ↗</span></a>`).join('') : '<div class="empty">Nessuna fonte mostrata perché il caso non è stato instradato automaticamente.</div>';
  $('draftWrap').classList.toggle('hidden', !data.draft);
  $('draft').textContent = data.draft;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function analyseConfirmed() {
  if (!$('confirmFacts').checked) {
    $('confirmError').textContent = 'Conferma prima che i fatti inseriti siano corretti.';
    return;
  }
  $('confirmError').textContent = '';
  renderResult(analyseFacts(collectFacts()));
}

$('files').addEventListener('change', () => renderFiles([...$('files').files].slice(0, 8)));
$('processBtn').addEventListener('click', processFiles);
$('analyseBtn').addEventListener('click', analyseConfirmed);
$('copyBtn').addEventListener('click', async () => {
  if (!$('draft').textContent) return;
  await navigator.clipboard.writeText($('draft').textContent);
  $('copyFeedback').textContent = 'Copiato';
  setTimeout(() => { $('copyFeedback').textContent = ''; }, 1600);
});
$('resetBtn').addEventListener('click', () => location.reload());
window.addEventListener('pagehide', shutdownExtractionWorkers);
