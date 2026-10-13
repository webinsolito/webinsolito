const $ = id => document.getElementById(id);
const TOKEN_KEY = 'webinsolito.risolvi.reviewer.token';
const API_KEY = 'webinsolito.risolvi.reviewer.api';
const state = { apiBase: '', token: '', queue: [], selected: null, timer: null };

function apiUrl(path) { return `${state.apiBase}${path}`; }
function splitCsv(value) { return String(value || '').split(',').map(v => v.trim()).filter(Boolean); }
function fmtDate(value) { return value ? new Date(value).toLocaleString('it-IT') : '—'; }

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('X-Reviewer-Token', state.token);
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

function setConnection(message, tone = '') {
  const node = $('connectionStatus');
  node.textContent = message;
  node.className = `status ${tone}`;
}

function metric(label, value) {
  const box = document.createElement('div');
  box.className = 'metric';
  const strong = document.createElement('strong');
  strong.textContent = value ?? '—';
  const span = document.createElement('span');
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function renderMetrics(data) {
  const node = $('metrics');
  node.replaceChildren(
    metric('consensi', data.consented_cases),
    metric('inviati in review', data.submitted_reviews),
    metric('decisi', data.decided_reviews),
    metric('Action Card consegnate', data.delivered_actions),
    metric('errori S0/S1', data.s0_s1_errors),
    metric('mediana caso→azione', data.median_seconds_case_to_action == null ? '—' : `${Math.round(data.median_seconds_case_to_action)}s`),
  );
  const outcomes = data.outcomes || {};
  if (Object.keys(outcomes).length) {
    for (const [key, value] of Object.entries(outcomes)) node.append(metric(key, value));
  }
  node.classList.remove('hidden');
}

function queueButton(review) {
  const button = document.createElement('button');
  button.className = `queueItem${state.selected?.id === review.id ? ' active' : ''}`;
  button.type = 'button';
  const title = document.createElement('strong');
  title.textContent = review.original_recommendation?.title || `Review #${review.id}`;
  const sub = document.createElement('span');
  sub.textContent = `${review.facts.problem} · ${review.facts.seller_name || 'venditore non indicato'}`;
  const meta = document.createElement('span');
  meta.className = 'queueMeta';
  for (const value of [`#${review.id}`, review.original_recommendation?.route || 'no-route', `${review.document_metadata?.length || 0} doc`]) {
    const chip = document.createElement('i'); chip.textContent = value; meta.append(chip);
  }
  button.append(title, sub, meta);
  button.addEventListener('click', () => selectReview(review.id));
  return button;
}

function renderQueue() {
  $('queueCount').textContent = `${state.queue.length} casi`;
  const node = $('queue');
  if (!state.queue.length) {
    node.innerHTML = '<div class="empty">Nessun caso in attesa.</div>';
    return;
  }
  node.replaceChildren(...state.queue.map(queueButton));
}

function factNode(key, value) {
  const box = document.createElement('div'); box.className = 'fact';
  const b = document.createElement('b'); b.textContent = key;
  const span = document.createElement('span'); span.textContent = value == null || value === '' ? '—' : String(value);
  box.append(b, span); return box;
}

function fillInput(root, name, value) {
  const node = root.querySelector(`[data-input="${name}"]`);
  if (node) node.value = value ?? '';
}

function renderCandidate(root, rec) {
  const target = root.querySelector('[data-field="candidate"]');
  const p1 = document.createElement('p'); p1.innerHTML = `<b>Status:</b> ${rec.status} · <b>route:</b> ${rec.route || '—'}`;
  const p2 = document.createElement('p'); p2.textContent = rec.title;
  const p3 = document.createElement('p'); p3.textContent = rec.explanation;
  target.append(p1, p2, p3);
  if (rec.draft) { const pre = document.createElement('pre'); pre.textContent = rec.draft; target.append(pre); }
}

async function downloadDocument(reviewId, document) {
  try {
    const response = await fetch(apiUrl(`/v1/pilot/reviews/${reviewId}/documents/${document.id}/download`), {
      headers: { 'X-Reviewer-Token': state.token }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = document.filename || 'documento'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    setConnection(`Download non riuscito: ${error.message}`, 'bad');
  }
}

function renderDetail(review) {
  const template = $('detailTemplate').content.cloneNode(true);
  template.querySelector('[data-field="review-id"]').textContent = `#${review.id}`;
  template.querySelector('[data-field="case-title"]').textContent = review.facts.seller_name || 'Caso senza venditore identificato';
  template.querySelector('[data-field="created-at"]').textContent = `Creato ${fmtDate(review.created_at)} · case ${review.case_id}`;
  template.querySelector('[data-field="route-badge"]').textContent = review.original_recommendation.route || review.original_recommendation.status;

  const facts = template.querySelector('[data-field="facts"]');
  Object.entries(review.facts || {}).forEach(([key, value]) => facts.append(factNode(key, value)));

  const docs = template.querySelector('[data-field="documents"]');
  if (!review.document_metadata?.length) {
    docs.textContent = 'Nessun documento inviato.';
    docs.classList.add('muted');
  } else {
    for (const doc of review.document_metadata) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'docBtn';
      button.textContent = `${doc.filename} · ${Math.ceil(doc.size_bytes / 1024)} KB`;
      button.addEventListener('click', () => downloadDocument(review.id, doc));
      docs.append(button);
    }
  }

  const rec = review.original_recommendation;
  renderCandidate(template, rec);
  fillInput(template, 'status', rec.status);
  fillInput(template, 'route', rec.route || '');
  fillInput(template, 'title', rec.title);
  fillInput(template, 'explanation', rec.explanation);
  fillInput(template, 'draft', rec.draft || '');
  fillInput(template, 'rule-ids', (rec.rule_ids || []).join(', '));
  fillInput(template, 'source-ids', (rec.source_ids || []).join(', '));
  fillInput(template, 'allowed-claims', (rec.allowed_claims || []).join(', '));
  fillInput(template, 'missing-facts', (rec.missing_facts || []).join(', '));

  const detail = $('detail');
  detail.replaceChildren(template);
  detail.querySelector('[data-action="submit"]').addEventListener('click', submitDecision);
  detail.querySelector('[data-input="classification"]').addEventListener('change', updateDecisionMode);
  updateDecisionMode();
}

function updateDecisionMode() {
  const detail = $('detail');
  const select = detail.querySelector('[data-input="classification"]');
  if (!select) return;
  const pass = select.value === 'PASS_AUTONOMOUS';
  for (const name of ['status','route','title','explanation','draft','rule-ids','source-ids','allowed-claims','missing-facts']) {
    const node = detail.querySelector(`[data-input="${name}"]`);
    if (node) node.disabled = pass;
  }
}

function buildFinalRecommendation(detail) {
  return {
    status: detail.querySelector('[data-input="status"]').value,
    route: detail.querySelector('[data-input="route"]').value.trim() || null,
    title: detail.querySelector('[data-input="title"]').value.trim(),
    explanation: detail.querySelector('[data-input="explanation"]').value.trim(),
    draft: detail.querySelector('[data-input="draft"]').value.trim() || null,
    rule_ids: splitCsv(detail.querySelector('[data-input="rule-ids"]').value),
    source_ids: splitCsv(detail.querySelector('[data-input="source-ids"]').value),
    allowed_claims: splitCsv(detail.querySelector('[data-input="allowed-claims"]').value),
    missing_facts: splitCsv(detail.querySelector('[data-input="missing-facts"]').value),
  };
}

async function submitDecision() {
  const detail = $('detail');
  const error = $('decisionError');
  error.textContent = '';
  if (!state.selected) return;
  const classification = detail.querySelector('[data-input="classification"]').value;
  const severity = detail.querySelector('[data-input="severity"]').value || null;
  const note = detail.querySelector('[data-input="note"]').value.trim() || null;
  if (classification !== 'PASS_AUTONOMOUS' && !severity) {
    error.textContent = 'Per una modifica/escalation indica la severity.';
    return;
  }
  const button = detail.querySelector('[data-action="submit"]');
  button.disabled = true;
  try {
    const payload = {
      classification,
      error_severity: severity,
      reviewer_note: note,
      final_recommendation: classification === 'PASS_AUTONOMOUS' ? null : buildFinalRecommendation(detail),
    };
    await api(`/v1/pilot/reviews/${state.selected.id}/decision`, { method: 'POST', json: payload });
    setConnection(`Review #${state.selected.id} completata.`, 'good');
    state.selected = null;
    await refreshAll();
    $('detail').innerHTML = '<div class="empty">Decisione salvata. Seleziona il prossimo caso.</div>';
  } catch (err) {
    error.textContent = `Decisione non salvata: ${err.message}`;
  } finally {
    button.disabled = false;
  }
}

async function selectReview(id) {
  try {
    state.selected = await api(`/v1/pilot/reviews/${id}`);
    renderQueue(); renderDetail(state.selected);
  } catch (error) {
    setConnection(`Impossibile aprire la review: ${error.message}`, 'bad');
  }
}

async function refreshAll() {
  const [queue, metrics] = await Promise.all([
    api('/v1/pilot/reviews/pending?limit=100'),
    api('/v1/pilot/metrics'),
  ]);
  state.queue = queue;
  renderQueue(); renderMetrics(metrics);
}

async function connect() {
  state.apiBase = $('apiBase').value.trim().replace(/\/$/, '');
  state.token = $('reviewerToken').value.trim();
  if (!state.token) { setConnection('Inserisci il reviewer token.', 'bad'); return; }
  $('connectBtn').disabled = true;
  try {
    const config = await fetch(apiUrl('/v1/config'), { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(`config_http_${r.status}`); return r.json();
    });
    if (!config.pilot_enabled) throw new Error('pilot_not_enabled');
    await refreshAll();
    sessionStorage.setItem(TOKEN_KEY, state.token);
    localStorage.setItem(API_KEY, state.apiBase);
    $('refreshBtn').disabled = false;
    setConnection(`Connesso a RISOLVI ${config.service_version}.`, 'good');
    startPolling();
  } catch (error) {
    setConnection(`Connessione rifiutata: ${error.message}`, 'bad');
    $('refreshBtn').disabled = true;
  } finally {
    $('connectBtn').disabled = false;
  }
}

function startPolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.token) refreshAll().catch(() => {});
  }, 15000);
}

$('connectBtn').addEventListener('click', connect);
$('refreshBtn').addEventListener('click', () => refreshAll().catch(error => setConnection(error.message, 'bad')));
window.addEventListener('pagehide', () => { if (state.timer) clearInterval(state.timer); });

$('apiBase').value = localStorage.getItem(API_KEY) || '';
$('reviewerToken').value = sessionStorage.getItem(TOKEN_KEY) || '';
if ($('reviewerToken').value) connect();
