/* AutoBuddy: validate complete backup, save pre-import recovery, commit atomically. */
(function (root) {
  'use strict';
  const MAX_BYTES = 2_000_000;
  const RECOVERY_KEY = 'autobuddy.v2.pre-import';

  function parseBackup(text, normalize) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) {
      throw new Error('Backup troppo grande (massimo 2 MB)');
    }
    let source;
    try { source = JSON.parse(text); }
    catch { throw new Error('Il file non contiene un JSON valido'); }
    if (!source || typeof source !== 'object' || !Array.isArray(source.vehicles) ||
        (source.version !== undefined && source.version !== 2)) {
      throw new Error('Formato backup AutoBuddy non riconosciuto');
    }
    const collections = ['vehicles', 'deadlines', 'expenses', 'maintenance', 'documents', 'kmLog'];
    for (const field of collections) {
      if (source[field] !== undefined && !Array.isArray(source[field])) {
        throw new Error('Il backup contiene una sezione non valida: ' + field);
      }
      if ((source[field] || []).length > 1000) {
        throw new Error('Il backup supera il limite di 1000 elementi per sezione: ' + field);
      }
    }
    const validId = id => (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    // Do not silently discard a vehicle with a malformed identifier.
    if (source.vehicles.some(v => !v || !validId(v.id))) {
      throw new Error('Il backup contiene un veicolo senza identificativo valido');
    }
    const ids = source.vehicles.map(v => Number(v.id));
    if (new Set(ids).size !== ids.length) {
      throw new Error('Identificativi veicolo duplicati');
    }
    const vehicleIds = new Set(ids);
    for (const field of collections.slice(1)) {
      if ((source[field] || []).some(v => !v || !validId(v.id) ||
          !validId(v.veh) || !vehicleIds.has(Number(v.veh)))) {
        throw new Error('Il backup contiene dati non collegati a un veicolo (rischio perdita): ' + field);
      }
    }
    // Duplicate linked IDs make edit/delete operations ambiguous.
    for (const field of collections.slice(1)) {
      const recordIds = (source[field] || []).map(item => Number(item.id));
      if (new Set(recordIds).size !== recordIds.length) {
        throw new Error('Identificativi duplicati nella sezione: ' + field);
      }
    }
    if (source.parking !== undefined && source.parking !== null &&
        (typeof source.parking !== 'object' || Array.isArray(source.parking))) {
      throw new Error('Il backup contiene un parcheggio non valido');
    }
    const expectedCount = field => (source[field] || []).length;
    const next = normalize({ ...source, version: 2 });
    if (!next || next.version !== 2 || collections.some(field =>
      !Array.isArray(next[field]) || next[field].length !== expectedCount(field))) {
      throw new Error('Il backup non può essere ripristinato senza perdita di dati validi');
    }
    // A normalizer can retain row counts while replacing IDs, links or content.
    for (const field of collections) {
      const byId = new Map(next[field].map(item => [Number(item.id), item]));
      for (const original of source[field] || []) {
        const restored = byId.get(Number(original.id));
        if (!restored || (field !== 'vehicles' && Number(restored.veh) !== Number(original.veh))) {
          throw new Error('Il backup modifica identificativi o collegamenti: ' + field);
        }
      }
    }
    const textFields = {
      vehicles: ['plate', 'model', 'year', 'fuel', 'photo'],
      deadlines: ['type', 'date', 'note'],
      expenses: ['cat', 'date', 'note'],
      maintenance: ['type', 'date', 'shop', 'nextDate'],
      documents: ['name', 'expiry', 'data', 'mime', 'fileName'],
      kmLog: ['date']
    };
    const numberFields = {
      vehicles: ['km'], expenses: ['amt', 'km'],
      maintenance: ['km', 'cost', 'nextKm'], kmLog: ['km']
    };
    const preserved = (original, restored, field, numeric, section) => {
      if (!Object.hasOwn(original, field) || original[field] === null || original[field] === '') return;
      if (numeric) {
        const value = Number(original[field]);
        if (!Number.isFinite(value) || !Number.isFinite(Number(restored[field])) ||
            Number(restored[field]) !== value) {
          throw new Error('Il backup modifica un importo o chilometraggio: ' + section + '.' + field);
        }
      } else if (typeof original[field] === 'string' && original[field] !== restored[field]) {
        throw new Error('Il backup modifica o perde un dato: ' + section + '.' + field);
      }
    };
    for (const field of collections) {
      const restoredById = new Map(next[field].map(item => [Number(item.id), item]));
      for (const original of source[field] || []) {
        const restored = restoredById.get(Number(original.id));
        for (const name of textFields[field]) preserved(original, restored, name, false, field);
        for (const name of numberFields[field] || []) preserved(original, restored, name, true, field);
      }
    }
    if (source.parking !== undefined && source.parking !== null) {
      if (!next.parking || typeof next.parking !== 'object') {
        throw new Error('Il backup perde il parcheggio salvato');
      }
      for (const field of ['note', 'until', 'at']) preserved(source.parking, next.parking, field, false, 'parking');
      for (const field of ['lat', 'lng']) preserved(source.parking, next.parking, field, true, 'parking');
    }
    if (source.activeVehicle !== undefined && source.activeVehicle !== null) {
      if (!validId(source.activeVehicle) || !vehicleIds.has(Number(source.activeVehicle)) ||
          Number(next.activeVehicle) !== Number(source.activeVehicle)) {
        throw new Error('Il backup modifica il veicolo attivo');
      }
    }
    return next;
  }

  function importBackup({ text, storage, key = 'autobuddy.v2', normalize, confirmImport }) {
    const next = parseBackup(text, normalize);
    if (confirmImport && !confirmImport()) return null;
    const previous = storage.getItem(key);
    const oldRecovery = storage.getItem(RECOVERY_KEY);
    if (previous !== null) {
      // An undo must be restorable, even when the current Garage has large attachments.
      try { parseBackup(previous, normalize); }
      catch { throw new Error('Il Garage attuale non è ripristinabile automaticamente: esporta una copia prima di importare'); }
      try { storage.setItem(RECOVERY_KEY, previous); }
      catch { throw new Error('Spazio insufficiente per salvare la copia di sicurezza: dati originali intatti'); }
    }
    try { storage.setItem(key, JSON.stringify(next)); }
    catch {
      // The Garage write failed: preserve the earlier undo point as well.
      if (previous !== null) {
        try {
          if (oldRecovery === null) storage.removeItem(RECOVERY_KEY);
          else storage.setItem(RECOVERY_KEY, oldRecovery);
        } catch {
          throw new Error('Importazione annullata: Garage intatto, ma non è stato possibile ripristinare la precedente copia di recupero');
        }
      }
      throw new Error('Spazio insufficiente per importare: dati originali intatti');
    }
    // If the Garage was absent, any prior undo point is stale.
    if (previous === null && oldRecovery !== null) {
      try { storage.removeItem(RECOVERY_KEY); }
      catch { /* The import succeeded; do not misreport it as a failed write. */ }
    }
    return next;
  }

  function restorePrevious({ storage, key = 'autobuddy.v2', normalize, confirmRestore }) {
    const raw = storage.getItem(RECOVERY_KEY);
    if (raw === null) throw new Error('Nessuna copia precedente disponibile');
    const previous = parseBackup(raw, normalize);
    if (confirmRestore && !confirmRestore()) return null;
    try { storage.setItem(key, JSON.stringify(previous)); }
    catch { throw new Error('Spazio insufficiente: ripristino annullato'); }
    return previous;
  }

  function hasRecovery(storage) { return storage.getItem(RECOVERY_KEY) !== null; }

  const api = Object.freeze({ importBackup, restorePrevious, parseBackup, hasRecovery, RECOVERY_KEY });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AutoBuddyBackupGuard = api;
})(globalThis);
