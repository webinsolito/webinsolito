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
    const ids = source.vehicles.map(v => v && Number(v.id));
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      throw new Error('Identificativi veicolo non validi o duplicati');
    }
    const next = normalize({ ...source, version: 2 });
    if (!next || next.version !== 2 || collections.some(field =>
      !Array.isArray(next[field]) || next[field].length !== (source[field] || []).length)) {
      throw new Error('Il backup non può essere ripristinato senza perdita di dati');
    }
    return next;
  }

  function importBackup({ text, storage, key = 'autobuddy.v2', normalize, confirmImport }) {
    const next = parseBackup(text, normalize);
    if (confirmImport && !confirmImport()) return null;
    const previous = storage.getItem(key);
    if (previous !== null) {
      try { storage.setItem(RECOVERY_KEY, previous); }
      catch { throw new Error('Spazio insufficiente per salvare la copia di sicurezza: dati originali intatti'); }
    }
    try { storage.setItem(key, JSON.stringify(next)); }
    catch { throw new Error('Spazio insufficiente per importare: dati originali intatti'); }
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
