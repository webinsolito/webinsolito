import { extractFiles, inferFacts, shutdownExtractionWorkers } from './extractor.js';

const $ = id => document.getElementById(id);
const SESSION_KEY = 'webinsolito.risolvi.case.v06';
const API_BASE = String(window.RISOLVI_CONFIG?.apiBase || '').replace(/\/$/, '');
const state = {
  documents: [],
  inference: { facts: {}, candidates: [], conflicts: [] },
  apiConfig: null,
  caseId: null,
  caseToken: null,
  uploaded: false,
  reviewId: null,
  pollTimer: null,
};

const SOURCES = {
  'MIMIT-GARANZIA': {
    title: 'MIMIT — Garanzia legale',
    url: 'https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/garanzia-legale',
  },
  'MIMIT-RECESSO': {
    title: 'MIMIT — Diritto di recesso',
    url: 'https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/diritto-di-recesso',
  },
  'MIMIT-VENDITA-DISTANZA': {
    title: 'MIMIT — Vendita a distanza',
    url: 'https://www.mimit.gov.it/it/mercato-e-consumatori/tutela-del-consumatore/diritti-del-consumatore/vendita-a-distanza',
  },
};

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

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
  else if (value === false) $(id).value = 'no';
}

function setStatus(message, tone = '') {
  const node = $('extractStatus');
  node.textContent = message;
  node.dataset.tone = tone;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.caseToken && options.caseAuth !== false) headers.set('X-Case-Token', state.caseToken);
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    cache: 'no-store',
  });
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === 'object' ? payload.detail : payload;
    throw new Error(typeof detail === 'string' ? detail : `http_${response.status}`);
  }
  return payload;
}

function persistCase() {
  if (!state.caseId || !state.caseToken) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ caseId: state.caseId, caseToken: state.caseToken }));
}

function restoreCase() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (stored?.caseId && stored?.caseToken) {
      state.caseId = stored.caseId;
      state.caseToken = stored.caseToken;
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function renderFiles(files) {
  $('fileList').innerHTML = files.length
    ? files.map(file => `<div class="fileRow"><div><b>${escapeHtml(file.name)}</b><span>${Math.ceil(file.size / 1024)} KB</span></div><span class="pill">locale</span></div>`).join('')
    : '<div class="empty">Nessun documento selezionato.</div>';
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
  if (facts.order_date) $('orderDate').value = facts.order_date;
  if (facts.delivery_date) $('deliveryDate').value = facts.delivery_date;
  if (facts.promised_delivery_date) $('promisedDate').value = facts.promised_delivery_date;
  if (facts.defect_manifested_date) $('defectManifestedDate').value = facts.defect_manifested_date;
  if (facts.withdrawal_notified_at) $('withdrawalNotifiedAt').value = facts.withdrawal_notified_at;
  setYesNo('distancePurchase', facts.distance_purchase);
  setYesNo('professionalSeller', facts.professional_seller);
  setYesNo('physicalGood', facts.physical_good);
  if (facts.customised === true) $('customised').checked = true;
  if (facts.perishable === true) $('perishable').checked = true;
}

function openReviewCard() {
  $('reviewCard').classList.remove('hidden');
  $('reviewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function processFiles() {
  const files = [...$('files').files].slice(0, 8);
  renderFiles(files);
  if (!files.length) {
    setStatus('Se non hai documenti, usa “Continua senza documenti”.', 'warn');
    return;
  }
  $('processBtn').disabled = true;
  $('reviewCard').classList.add('hidden');
  $('resultCard').classList.add('hidden');
  try {
    state.documents = await extractFiles(files, message => setStatus(message));
    state.inference = inferFacts(state.documents);
    renderExtraction();
    prefillForm();
    openReviewCard();
    const conflicts = state.inference.conflicts.length;
    setStatus(conflicts ? `Analisi completata. ${conflicts} dato/i in conflitto: controllali prima di continuare.` : 'Analisi completata. Controlla e conferma i fatti estratti.', conflicts ? 'warn' : 'good');
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

function continueWithoutDocuments() {
  // This action is a privacy boundary, not merely a visual choice: clear the
  // native file input so uploadPilotDocuments() cannot later send files the
  // user explicitly chose not to include in the pilot.
  $('files').value = '';
  renderFiles([]);
  state.documents = [];
  state.inference = { facts: {}, candidates: [], conflicts: [] };
  state.uploaded = false;
  renderExtraction();
  setStatus('Va bene: inserisci solo i fatti che conosci. Nessun documento verrà inviato.', 'good');
  openReviewCard();
}

function collectFacts() {
  return {
    problem: $('problem').value,
    seller_name: $('sellerName').value.trim() || null,
    seller_country: $('sellerCountry').value || null,
    consumer: yesNoValue('consumer'),
    professional_seller: yesNoValue('professionalSeller'),
    distance_purchase: yesNoValue('distancePurchase'),
    physical_good: yesNoValue('physicalGood'),
    order_date: $('orderDate').value || null,
    delivery_date: $('deliveryDate').value || null,
    promised_delivery_date: $('promisedDate').value || null,
    defect_manifested_date: $('defectManifestedDate').value || null,
    withdrawal_notified_at: $('withdrawalNotifiedAt').value || null,
    returned_or_proof_sent: yesNoValue('returnedOrProofSent'),
    seller_offered_collection: $('sellerOfferedCollection').checked,
    customised: $('customised').checked,
    perishable: $('perishable').checked,
    sealed_hygiene_opened: $('hygieneOpened').checked,
  };
}

async function ensureCase() {
  if (state.caseId && state.caseToken) return;
  const created = await apiRequest('/v1/cases', { method: 'POST', caseAuth: false });
  state.caseId = created.case.id;
  state.caseToken = created.capability_token;
  persistCase();
}

async function uploadPilotDocuments() {
  if (state.uploaded) return;
  const files = [...$('files').files].slice(0, 8);
  for (let index = 0; index < files.length; index += 1) {
    const form = new FormData();
    form.append('file', files[index], files[index].name);
    $('confirmError').textContent = `Invio documento ${index + 1}/${files.length} al reviewer…`;
    await apiRequest(`/v1/cases/${state.caseId}/documents`, { method: 'POST', body: form });
  }
  state.uploaded = true;
}

function showPending(reviewId = null) {
  if (reviewId) state.reviewId = reviewId;
  $('reviewCard').classList.add('hidden');
  $('resultCard').classList.add('hidden');
  $('pendingCard').classList.remove('hidden');
  $('pendingMessage').textContent = state.reviewId ? `Pratica in coda · review #${state.reviewId}. Puoi lasciare aperta questa pagina o tornare più tardi nella stessa sessione del browser.` : 'Pratica in coda di revisione.';
  $('pendingCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  startPolling();
}

function sourceCards(ids = []) {
  if (!ids.length) return '<div class="empty">Nessuna fonte associata a questa Action Card.</div>';
  return ids.map(id => {
    const source = SOURCES[id];
    if (!source) return `<div class="source"><b>${escapeHtml(id)}</b><span>Fonte registrata nel rule pack</span></div>`;
    return `<a class="source" href="${source.url}" target="_blank" rel="noopener"><b>${escapeHtml(source.title)}</b><span>Apri fonte ufficiale ↗</span></a>`;
  }).join('');
}

function renderRecommendation(rec) {
  stopPolling();
  $('pendingCard').classList.add('hidden');
  const card = $('resultCard');
  card.classList.remove('hidden');
  const tone = rec.status === 'ACTIONABLE' ? 'good' : rec.status === 'NEEDS_INFORMATION' ? 'warn' : 'bad';
  $('resultStatus').className = `status ${tone}`;
  $('resultStatus').textContent = rec.status === 'ACTIONABLE' ? 'Action Card controllata' : rec.status === 'NEEDS_INFORMATION' ? 'Serve un controllo ulteriore' : 'Fuori perimetro';
  $('resultTitle').textContent = rec.title;
  $('resultExplanation').textContent = rec.explanation;
  $('routeCode').textContent = rec.route || '—';
  $('sourceList').innerHTML = sourceCards(rec.source_ids || []);
  $('draftWrap').classList.toggle('hidden', !rec.draft);
  $('draft').textContent = rec.draft || '';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function checkAction() {
  if (!state.caseId || !state.caseToken) return;
  try {
    const payload = await apiRequest(`/v1/cases/${state.caseId}/pilot/action`);
    if (payload.status === 'APPROVED' && payload.recommendation) renderRecommendation(payload.recommendation);
    else showPending(state.reviewId);
  } catch (error) {
    $('pendingMessage').textContent = `Non riesco a controllare lo stato: ${error.message}. Riprova tra poco.`;
  }
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') checkAction();
  }, 8000);
}

function stopPolling() {
  if (!state.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function submitForReview() {
  $('confirmError').textContent = '';
  if (!$('confirmFacts').checked) {
    $('confirmError').textContent = 'Conferma prima che i fatti inseriti siano corretti.';
    return;
  }
  if (!$('pilotConsent').checked) {
    $('confirmError').textContent = 'Per il pilot controllato serve il consenso alla revisione umana.';
    return;
  }
  if (!state.apiConfig?.pilot_enabled) {
    $('confirmError').textContent = 'Il pilot non è attivo sul motore configurato.';
    return;
  }

  $('analyseBtn').disabled = true;
  try {
    await ensureCase();
    await apiRequest(`/v1/cases/${state.caseId}/facts`, { method: 'PUT', json: collectFacts() });
    await apiRequest(`/v1/cases/${state.caseId}/pilot/consent`, {
      method: 'POST',
      json: { notice_version: state.apiConfig.pilot_notice_version },
    });
    await uploadPilotDocuments();
    const submitted = await apiRequest(`/v1/cases/${state.caseId}/pilot/submit`, { method: 'POST' });
    $('confirmError').textContent = '';
    showPending(submitted.review_id);
    await checkAction();
  } catch (error) {
    $('confirmError').textContent = `Non riesco a inviare la pratica: ${error.message}`;
  } finally {
    $('analyseBtn').disabled = false;
  }
}

async function recordOutcome(type, payload = {}) {
  if (!state.caseId || !state.caseToken) return;
  try {
    await apiRequest(`/v1/cases/${state.caseId}/outcomes`, { method: 'POST', json: { outcome_type: type, payload } });
    $('outcomeFeedback').textContent = 'Grazie: questo dato ci aiuta a capire se RISOLVI funziona davvero.';
  } catch {
    $('outcomeFeedback').textContent = 'Non sono riuscito a registrare il feedback, ma la tua pratica resta disponibile.';
  }
}

async function deleteCase() {
  stopPolling();
  if (state.caseId && state.caseToken) {
    try { await apiRequest(`/v1/cases/${state.caseId}`, { method: 'DELETE' }); } catch { /* best effort */ }
  }
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

async function loadApiConfig() {
  const apiState = $('apiState');
  try {
    state.apiConfig = await apiRequest('/v1/config', { caseAuth: false });
    const enabled = Boolean(state.apiConfig.pilot_enabled);
    apiState.textContent = enabled ? `Motore ${state.apiConfig.service_version} · pilot attivo` : `Motore ${state.apiConfig.service_version} · pilot non attivo`;
    apiState.className = `apiState ${enabled ? 'good' : 'bad'}`;
    $('pilotMeta').innerHTML = `<span>documenti: ${state.apiConfig.document_retention_hours}h</span><span>pratica: ${state.apiConfig.case_retention_days} giorni</span><span>consenso: ${escapeHtml(state.apiConfig.pilot_notice_version)}</span>`;
    $('analyseBtn').disabled = !enabled;
  } catch (error) {
    apiState.textContent = `Motore non raggiungibile · ${error.message}`;
    apiState.className = 'apiState bad';
    $('analyseBtn').disabled = true;
    $('pilotMeta').innerHTML = '<span>Il pilot richiede il Case Engine online.</span>';
  }
}

async function restorePendingCase() {
  restoreCase();
  if (!state.caseId || !state.caseToken) return;
  try {
    await apiRequest(`/v1/cases/${state.caseId}`);
    const action = await apiRequest(`/v1/cases/${state.caseId}/pilot/action`);
    if (action.status === 'APPROVED' && action.recommendation) renderRecommendation(action.recommendation);
    else showPending();
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    state.caseId = null;
    state.caseToken = null;
  }
}

$('files').addEventListener('change', () => renderFiles([...$('files').files].slice(0, 8)));
$('processBtn').addEventListener('click', processFiles);
$('noDocsBtn').addEventListener('click', continueWithoutDocuments);
$('analyseBtn').addEventListener('click', submitForReview);
$('refreshActionBtn').addEventListener('click', checkAction);
$('copyBtn').addEventListener('click', async () => {
  if (!$('draft').textContent) return;
  await navigator.clipboard.writeText($('draft').textContent);
  $('copyFeedback').textContent = 'Copiato';
  recordOutcome('action_copied');
  setTimeout(() => { $('copyFeedback').textContent = ''; }, 1600);
});
$('sentBtn').addEventListener('click', () => recordOutcome('action_sent'));
$('resolvedBtn').addEventListener('click', () => recordOutcome('case_resolved', { resolved: true }));
$('notResolvedBtn').addEventListener('click', () => recordOutcome('case_not_resolved', { resolved: false }));
$('deleteCaseBtn').addEventListener('click', deleteCase);
$('deleteCasePendingBtn').addEventListener('click', deleteCase);
$('resetBtn').addEventListener('click', deleteCase);
window.addEventListener('pagehide', () => { stopPolling(); shutdownExtractionWorkers(); });

await loadApiConfig();
await restorePendingCase();
