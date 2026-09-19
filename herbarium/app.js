(() => {
  'use strict';
  const DB_NAME = 'herbarium.local.v1';
  const STORE_NAME = 'observations';
  const MAX_IMAGE_EDGE = 1600;
  const JPEG_QUALITY = 0.78;
  const inputs = [...document.querySelectorAll('input[type=file]')];
  const analyse = document.getElementById('analyse');
  const result = document.getElementById('result');
  const observationCount = document.getElementById('observationCount');
  const speciesCount = document.getElementById('speciesCount');

  const openDb = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB non disponibile.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database locale non disponibile.'));
  });

  const countObservations = async () => {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  };

  const saveObservation = async observation => {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(observation);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Salvataggio locale fallito.'));
        tx.onabort = () => reject(tx.error || new Error('Salvataggio locale annullato.'));
      });
    } finally { db.close(); }
  };

  const renderStats = async () => {
    try { observationCount.textContent = String(await countObservations()); }
    catch { observationCount.textContent = '—'; }
    speciesCount.textContent = '0';
  };

  const update = () => {
    const count = inputs.filter(input => input.files && input.files.length).length;
    analyse.disabled = count === 0;
    result.textContent = count
      ? `UNKNOWN — ${count} vista/e raccolte. Motore botanico validato non installato.`
      : 'UNKNOWN — aggiungi almeno una foto.';
  };

  const fileToDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Impossibile leggere la foto.'));
    reader.readAsDataURL(file);
  });

  const loadImage = dataUrl => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossibile decodificare la foto.'));
    image.src = dataUrl;
  });

  const canvasToBlob = canvas => new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compressione foto fallita.')), 'image/jpeg', JPEG_QUALITY);
  });

  const prepareEvidenceImage = async file => {
    const original = await fileToDataUrl(file);
    const image = await loadImage(original);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas non disponibile.');
    context.drawImage(image, 0, 0, width, height);
    return { blob: await canvasToBlob(canvas), width, height, originalBytes: file.size || null };
  };

  inputs.forEach(input => input.addEventListener('change', update));
  analyse.addEventListener('click', async () => {
    const selected = inputs.filter(input => input.files && input.files.length);
    if (!selected.length) return;
    analyse.disabled = true;
    result.textContent = 'Preparazione e salvataggio locale delle prove fotografiche…';
    try {
      const evidence = await Promise.all(selected.map(async input => ({
        role: input.id,
        name: input.files[0].name || null,
        type: 'image/jpeg',
        ...(await prepareEvidenceImage(input.files[0]))
      })));
      await saveObservation({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        createdAt: new Date().toISOString(),
        roles: evidence.map(item => item.role),
        evidence,
        status: 'UNKNOWN'
      });
      result.textContent = 'UNKNOWN — prove fotografiche ottimizzate e salvate nel database locale del dispositivo; nessuna identificazione automatica simulata.';
      await renderStats();
    } catch (error) {
      console.error(error);
      result.textContent = 'UNKNOWN — salvataggio locale non riuscito. Nessuna osservazione incompleta è stata registrata.';
    } finally { update(); }
  });

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(button.dataset.view).classList.add('active');
  }));

  const network = document.getElementById('network');
  const setNetwork = () => { network.textContent = navigator.onLine ? 'online · local-first' : 'offline-first'; };
  addEventListener('online', setNetwork);
  addEventListener('offline', setNetwork);
  setNetwork();
  renderStats();
  update();
})();