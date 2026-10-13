const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 6;
const MAX_TEXT = 120000;

let tesseractWorkerPromise = null;
let pdfjsPromise = null;

function safeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function digestFile(file) {
  if (!crypto?.subtle) return null;
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing && window.Tesseract) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error('ocr_engine_load_failed'));
    document.head.appendChild(script);
  });
}

async function getTesseractWorker(onStatus = () => {}) {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      onStatus('Scarico il motore OCR open-source…');
      await loadScript(TESSERACT_URL);
      return window.Tesseract.createWorker('ita+eng', 1, {
        logger: message => {
          if (message?.status && typeof message.progress === 'number') {
            onStatus(`${message.status} · ${Math.round(message.progress * 100)}%`);
          }
        },
      });
    })();
  }
  return tesseractWorkerPromise;
}

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function ocrSource(source, onStatus) {
  const worker = await getTesseractWorker(onStatus);
  const result = await worker.recognize(source);
  return safeText(result?.data?.text || '');
}

async function extractPdf(file, onStatus) {
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages = [];
  const warnings = [];
  if (pdf.numPages > MAX_PDF_PAGES) warnings.push(`PDF limitato alle prime ${MAX_PDF_PAGES} pagine nel prototipo.`);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onStatus(`Leggo PDF · pagina ${pageNumber}/${pageCount}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = safeText(content.items.map(item => item.str || '').join(' '));
    let method = 'CLIENT_PDF_TEXT';

    if (text.length < 30) {
      onStatus(`Pagina ${pageNumber}: sembra scansione, avvio OCR locale…`);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: context, viewport }).promise;
      text = await ocrSource(canvas, onStatus);
      method = 'CLIENT_OCR';
      canvas.width = 1;
      canvas.height = 1;
    }
    pages.push({ page: pageNumber, text, method });
  }

  return {
    text: pages.map(item => item.text).join('\n\n').slice(0, MAX_TEXT),
    pages,
    method: pages.some(item => item.method === 'CLIENT_OCR') ? 'CLIENT_OCR' : 'CLIENT_PDF_TEXT',
    warnings,
  };
}

async function extractTextLike(file) {
  let text = await file.text();
  if (/html?/i.test(file.type) || /\.html?$/i.test(file.name)) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    text = doc.body?.innerText || text;
  }
  return { text: safeText(text).slice(0, MAX_TEXT), pages: [{ page: 1, text: safeText(text), method: 'PLAIN_TEXT' }], method: /\.eml$/i.test(file.name) ? 'EMAIL_TEXT' : 'PLAIN_TEXT', warnings: [] };
}

export async function extractFile(file, onStatus = () => {}) {
  if (!(file instanceof File)) throw new Error('invalid_file');
  if (file.size === 0) throw new Error('empty_file');
  if (file.size > MAX_BYTES) throw new Error('file_too_large');

  const lower = file.name.toLowerCase();
  let extracted;
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(lower)) {
    onStatus(`OCR locale · ${file.name}`);
    const text = await ocrSource(file, onStatus);
    extracted = { text, pages: [{ page: 1, text, method: 'CLIENT_OCR' }], method: 'CLIENT_OCR', warnings: [] };
  } else if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    extracted = await extractPdf(file, onStatus);
  } else if (file.type.startsWith('text/') || /\.(txt|eml|html?)$/i.test(lower)) {
    extracted = await extractTextLike(file);
  } else {
    throw new Error('unsupported_file_type');
  }

  return {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    sha256: await digestFile(file),
    ...extracted,
  };
}

export async function extractFiles(fileList, onStatus = () => {}) {
  const files = [...fileList].slice(0, MAX_FILES);
  if (!files.length) return [];
  const results = [];
  for (let index = 0; index < files.length; index += 1) {
    onStatus(`Documento ${index + 1}/${files.length}: ${files[index].name}`);
    results.push(await extractFile(files[index], onStatus));
  }
  return results;
}

const months = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};
const dateToken = '(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}\\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\\s+\\d{4})';

function parseItalianDate(token) {
  const value = safeText(token).toLowerCase();
  let match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const month = Number(match[2]);
    const day = Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  match = value.match(/^(\d{1,2})\s+([a-zà]+)\s+(\d{4})$/i);
  if (match && months[match[2]]) return `${match[3]}-${String(months[match[2]]).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  return null;
}

function evidence(document, page, match, key, value, confidence) {
  const source = page.text || '';
  const start = match ? Math.max(0, match.index - 70) : 0;
  const end = match ? Math.min(source.length, match.index + match[0].length + 70) : Math.min(source.length, 180);
  return {
    key, value, confidence,
    evidence: {
      filename: document.filename,
      page: page.page,
      method: page.method,
      span: safeText(source.slice(start, end)),
    },
  };
}

function cleanLabelValue(value, limit = 120) {
  return safeText(value).replace(/[\s,;.]+$/, '').slice(0, limit);
}

function candidatesForPage(document, page) {
  const text = page.text || '';
  const lower = text.toLowerCase();
  const out = [];
  const problemMap = [
    ['redirect', /contatta(?:re)? il produttore|rivolgersi al produttore|assistenza del produttore/i, 'high'],
    ['not-delivered', /non consegnat[oa]|mancata consegna|mai consegnat[oa]|ordine non arrivato|pacco non arrivato/i, 'high'],
    ['withdrawal', /diritto di recesso|voglio recedere|comunico il recesso|esercitare il recesso/i, 'high'],
    ['refund', /rimborso negato|rimborso non ricevuto|mancato rimborso/i, 'high'],
    ['defect', /difettos[oa]|non funziona|non si accende|guasto|non conforme/i, 'medium'],
  ];
  for (const [value, regex, confidence] of problemMap) {
    const match = text.match(regex);
    if (match) { out.push(evidence(document, page, match, 'problem', value, confidence)); break; }
  }

  let match = text.match(/(?:venditore|seller|merchant|venduto\s+da|ragione\s+sociale)\s*[:\-]\s*([^\n\r]{2,100})/i);
  if (match) out.push(evidence(document, page, match, 'seller_name', cleanLabelValue(match[1], 100), 'high'));

  match = text.match(/(?:numero\s+(?:ordine|order)|(?:ordine|order)\s*(?:numero|codice|id|n\.?|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,40})/i);
  if (match) out.push(evidence(document, page, match, 'order_reference', cleanLabelValue(match[1], 40), 'high'));

  match = text.match(/(?:prodotto|articolo|product|item)\s*[:\-]\s*([^\n\r]{2,120})/i);
  if (match) out.push(evidence(document, page, match, 'product_name', cleanLabelValue(match[1], 120), 'high'));

  match = text.match(new RegExp(`(?:data\\s+(?:ordine|acquisto)|ordinato\\s+il|acquistato\\s+il)\\s*[:\\-]?\\s*(${dateToken})`, 'i'));
  if (match) {
    const value = parseItalianDate(match[1]);
    if (value) out.push(evidence(document, page, match, 'order_date', value, 'high'));
  }

  match = text.match(new RegExp(`(?:consegnat[oa]|data\\s+di\\s+consegna)\\s*(?:il|:)?\\s*(${dateToken})`, 'i'));
  if (match) {
    const value = parseItalianDate(match[1]);
    if (value) out.push(evidence(document, page, match, 'delivery_date', value, 'high'));
  }

  match = text.match(new RegExp(`(?:consegna\\s+(?:prevista|stimata)|da\\s+consegnare\\s+entro|consegna\\s+entro)\\s*(?:il|:)?\\s*(${dateToken})`, 'i'));
  if (match) {
    const value = parseItalianDate(match[1]);
    if (value) out.push(evidence(document, page, match, 'promised_delivery_date', value, 'high'));
  }

  if (/\b(acquisto\s+online|ordine\s+(?:numero|n\.?|#)|e-?commerce|spedizione)\b/i.test(lower)) out.push(evidence(document, page, null, 'distance_purchase', true, 'medium'));
  if (/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|partita\s+iva|p\.?iva)\b/i.test(lower)) out.push(evidence(document, page, null, 'professional_seller', true, 'medium'));
  if (/\b(prodotto|articolo|bene|spedizione|pacco|consegna)\b/i.test(lower)) out.push(evidence(document, page, null, 'physical_good', true, 'medium'));
  if (/\b(personalizzat[oa]|su\s+misura|incis[oa])\b/i.test(lower)) out.push(evidence(document, page, null, 'customised', true, 'high'));
  if (/\b(deperibile|scadenza\s+breve|deteriorarsi\s+rapidamente)\b/i.test(lower)) out.push(evidence(document, page, null, 'perishable', true, 'high'));
  if (/\b(sigillat[oa].{0,35}(igiene|igienic|salute).{0,45}(apert[oa]|rimosso|rotto))\b/i.test(lower)) out.push(evidence(document, page, null, 'sealed_hygiene_opened', true, 'high'));
  return out;
}

export function inferFacts(documents) {
  const candidates = documents.flatMap(document => document.pages.flatMap(page => candidatesForPage(document, page)));
  const byKey = new Map();
  for (const candidate of candidates) {
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, []);
    byKey.get(candidate.key).push(candidate);
  }

  const facts = {};
  const conflicts = [];
  for (const [key, values] of byKey.entries()) {
    const distinct = [...new Set(values.map(item => String(item.value).toLowerCase()))];
    if (distinct.length > 1) {
      conflicts.push(key);
      continue;
    }
    const best = values.sort((a, b) => ({ high: 2, medium: 1, low: 0 }[b.confidence] - ({ high: 2, medium: 1, low: 0 }[a.confidence]))[0];
    facts[key] = best.value;
  }
  return { facts, candidates, conflicts };
}

export async function shutdownExtractionWorkers() {
  if (!tesseractWorkerPromise) return;
  try {
    const worker = await tesseractWorkerPromise;
    await worker.terminate();
  } catch (_) {
    // No-op: cleanup must not block navigation.
  } finally {
    tesseractWorkerPromise = null;
  }
}
