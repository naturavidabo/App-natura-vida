'use strict';

const APP_VERSION = 5;
const DB_NAME = 'control_presupuesto_b5';
const DB_VERSION = 5;
const LEGACY_STORAGE_KEY = 'control_presupuesto_v1';
const MIRROR_CURRENT_KEY = 'control_presupuesto_b5_mirror_current';
const MIRROR_PREVIOUS_KEY = 'control_presupuesto_b5_mirror_previous';
const ACTIVATION_HASH = '77fdb82a65f1267b496683a0f44ffde77144060f1dac8989f3b687fde132fe4a';
const CHANNEL_NAME = 'control-presupuesto-b5';
const MAX_SNAPSHOTS = 20;
const MAX_AUDIT_ROWS = 500;

const DATA_STORES = ['expenses', 'categories', 'favorites', 'projects', 'monthSettings'];
const ALL_TX_STORES = [...DATA_STORES, 'meta', 'audit'];
const DEFAULT_CATEGORY_NAMES = [
  'Alimentación',
  'Transporte local',
  'Bebidas / antojos',
  'Trabajo / estudios',
  'Salud',
  'Higiene / limpieza',
  'Trámites / bancos',
  'Alquiler / vivienda',
  'Uniformes / accesorios',
  'Comunicación',
  'Viajes y traslados',
  'Otros'
];
const FREQUENT_DEFAULTS = [
  'Alimentación',
  'Transporte local',
  'Bebidas / antojos',
  'Trabajo / estudios',
  'Salud',
  'Higiene / limpieza'
];
const DEFAULT_FAVORITES = [
  { label: 'Micro', amount: 2.5, category: 'Transporte local' },
  { label: 'Taxi', amount: 10, category: 'Transporte local' },
  { label: 'Almuerzo', amount: 20, category: 'Alimentación' },
  { label: 'Gaseosa', amount: 5, category: 'Bebidas / antojos' }
];

const $ = (id) => document.getElementById(id);
const modalIds = [
  'settingsModal', 'categoriesModal', 'categoryPickerModal', 'favoriteConfirmModal',
  'favoriteEditorModal', 'expenseEditorModal', 'projectEditorModal', 'trashModal',
  'importPreviewModal', 'resetModal'
];

let db = null;
let state = null;
let appMeta = null;
let activationMeta = null;
let persistentStorageGranted = false;
let storageEstimate = null;
let mirrorStatus = { current: false, previous: false, error: '' };
let latestSnapshotMeta = null;
let recoveryNotice = '';
let pendingImport = null;
let isSaving = false;
let manualDate = false;
let selectedFavoriteId = null;
let editingFavoriteId = null;
let editingExpenseId = null;
let editingProjectId = null;
let lastAddedExpenseId = null;
let toastTimer = null;
let applyingUpdate = false;
let channel = null;

class StaleRevisionError extends Error {}
class DataSafetyError extends Error {}
class RecoveryRequiredError extends Error {}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function localDateKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localTimeKey(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function monthKey(d = new Date()) { return localDateKey(d).slice(0, 7); }
function localDateTime(date, time) { return `${date || localDateKey()}T${time || localTimeKey()}:00`; }
function parseAmount(v) {
  const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function inputAmount(n) { return n ? String(Number(n)).replace('.', ',') : ''; }
function money(n) {
  return `Bs ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function monthLabel(k) {
  const [y, m] = k.split('-').map(Number);
  return new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
}
function deepClone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function sum(rows) { return rows.reduce((total, row) => total + Number(row.amount || 0), 0); }
function categoryObject(name, index = 0) { return { id: uid(), name, hidden: false, order: index }; }
function activeExpenses(source = state) { return source.expenses.filter((e) => !e.deletedAt); }
function trashedExpenses(source = state) { return source.expenses.filter((e) => !!e.deletedAt); }

function initialState() {
  return {
    version: APP_VERSION,
    revision: 0,
    expenses: [],
    categories: DEFAULT_CATEGORY_NAMES.map(categoryObject),
    favorites: DEFAULT_FAVORITES.map((f) => ({ id: uid(), ...f })),
    monthSettings: {},
    projects: [{ id: 'general', name: 'Gastos generales', budget: 0, active: true }],
    recentCategories: []
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function exportableState(source = state) {
  return {
    version: APP_VERSION,
    expenses: [...source.expenses].map((e) => ({ ...e })).sort((a, b) => a.id.localeCompare(b.id)),
    categories: [...source.categories].map((c) => ({ ...c })).sort((a, b) => a.id.localeCompare(b.id)),
    favorites: [...source.favorites].map((f) => ({ ...f })).sort((a, b) => a.id.localeCompare(b.id)),
    projects: [...source.projects].map((p) => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id)),
    monthSettings: Object.fromEntries(Object.entries(source.monthSettings).sort(([a], [b]) => a.localeCompare(b))),
    recentCategories: [...source.recentCategories]
  };
}

async function checksumState(source = state) {
  return sha256(stableStringify(exportableState(source)));
}

function normalizeState(raw, { strict = true } = {}) {
  const errors = [];
  const warnings = [];
  const base = initialState();
  const source = raw && typeof raw === 'object' ? deepClone(raw) : {};

  let categories = Array.isArray(source.categories) ? source.categories : [];
  if (categories.length && typeof categories[0] === 'string') categories = categories.map(categoryObject);
  if (!categories.length) categories = base.categories;
  categories = categories.map((c, index) => ({
    id: String(c?.id || uid()),
    name: String(c?.name || `Categoría ${index + 1}`).trim(),
    hidden: !!c?.hidden,
    order: Number.isFinite(Number(c?.order)) ? Number(c.order) : index
  }));
  const categoryNamesLower = new Set();
  for (const c of categories) {
    if (!c.name) errors.push('Existe una categoría sin nombre.');
    const key = c.name.toLowerCase();
    if (categoryNamesLower.has(key)) errors.push(`Categoría duplicada: ${c.name}.`);
    categoryNamesLower.add(key);
  }
  if (!categories.some((c) => c.name === 'Otros')) categories.push(categoryObject('Otros', categories.length));

  let projects = Array.isArray(source.projects) ? source.projects : [];
  if (!projects.length) projects = base.projects;
  projects = projects.map((p) => ({
    id: String(p?.id || uid()),
    name: String(p?.name || 'Proyecto').trim(),
    budget: Number(p?.budget) || 0,
    active: !!p?.active
  }));
  if (!projects.some((p) => p.id === 'general')) projects.unshift({ id: 'general', name: 'Gastos generales', budget: 0, active: true });
  const activeProjects = projects.filter((p) => p.active);
  if (activeProjects.length !== 1) {
    projects.forEach((p) => { p.active = p.id === 'general'; });
    warnings.push('Se normalizó el proyecto activo.');
  }

  const projectIds = new Set(projects.map((p) => p.id));
  const visibleCategoryNames = new Set(categories.map((c) => c.name));

  let expenses = Array.isArray(source.expenses) ? source.expenses : [];
  expenses = expenses.map((e, index) => {
    const amount = Number(e?.amount);
    const createdAt = String(e?.createdAt || localDateTime(e?.date || localDateKey(), '12:00'));
    const date = String(e?.date || createdAt.slice(0, 10));
    const item = {
      id: String(e?.id || uid()),
      amount,
      category: visibleCategoryNames.has(e?.category) ? String(e.category) : 'Otros',
      detail: String(e?.detail || ''),
      projectId: projectIds.has(e?.projectId) ? String(e.projectId) : 'general',
      date,
      createdAt,
      deletedAt: e?.deletedAt ? String(e.deletedAt) : null,
      deletedReason: e?.deletedReason ? String(e.deletedReason) : ''
    };
    if (!Number.isFinite(amount) || amount <= 0) errors.push(`Monto inválido en gasto ${index + 1}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`Fecha inválida en gasto ${index + 1}.`);
    return item;
  });

  const ids = new Set();
  for (const expense of expenses) {
    if (ids.has(expense.id)) errors.push(`Identificador de gasto duplicado: ${expense.id}.`);
    ids.add(expense.id);
  }

  let favorites = Array.isArray(source.favorites) ? source.favorites : base.favorites;
  favorites = favorites.map((f) => ({
    id: String(f?.id || uid()),
    label: String(f?.label || 'Favorito').trim(),
    amount: Number(f?.amount) || 0,
    category: visibleCategoryNames.has(f?.category) ? String(f.category) : 'Otros'
  }));
  for (const favorite of favorites) {
    if (!favorite.label || favorite.amount <= 0) errors.push('Existe un favorito inválido.');
  }

  const monthSettings = {};
  const rawMonthSettings = source.monthSettings && typeof source.monthSettings === 'object' ? source.monthSettings : {};
  if (source.settings && !rawMonthSettings[monthKey()]) {
    rawMonthSettings[monthKey()] = {
      budget: Number(source.settings.monthlyBudget) || 0,
      savingsGoal: Number(source.settings.savingsGoal) || 0
    };
  }
  for (const [month, config] of Object.entries(rawMonthSettings)) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      errors.push(`Mes inválido: ${month}.`);
      continue;
    }
    monthSettings[month] = {
      budget: Math.max(0, Number(config?.budget) || 0),
      savingsGoal: Math.max(0, Number(config?.savingsGoal) || 0)
    };
  }

  const recentCategories = Array.isArray(source.recentCategories)
    ? source.recentCategories.map(String).filter((name) => visibleCategoryNames.has(name)).slice(0, 4)
    : [];

  if (strict && errors.length) return { ok: false, errors, warnings, data: null };
  if (!strict && errors.length) warnings.push(...errors.map((error) => `Corregido durante migración: ${error}`));

  return {
    ok: true,
    errors: strict ? errors : [],
    warnings,
    data: {
      version: APP_VERSION,
      revision: Number(source.revision) || 0,
      expenses: strict ? expenses : expenses.filter((e) => Number.isFinite(e.amount) && e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date)),
      categories,
      favorites: strict ? favorites : favorites.filter((f) => f.label && f.amount > 0),
      monthSettings,
      projects,
      recentCategories
    }
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error de IndexedDB.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('La transacción falló.'));
    transaction.onabort = () => reject(transaction.error || new Error('La transacción fue cancelada.'));
  });
}

function createTransaction(storeNames, mode = 'readonly') {
  try {
    return db.transaction(storeNames, mode, { durability: 'strict' });
  } catch (_) {
    return db.transaction(storeNames, mode);
  }
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('expenses')) {
        const store = database.createObjectStore('expenses', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('categories')) database.createObjectStore('categories', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('favorites')) database.createObjectStore('favorites', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('monthSettings')) database.createObjectStore('monthSettings', { keyPath: 'month' });
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('snapshots')) {
        const store = database.createObjectStore('snapshots', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('audit')) {
        const store = database.createObjectStore('audit', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        showStorageWarning('Hay una actualización de la base de datos pendiente. Cierra otras pestañas y vuelve a abrir la aplicación.');
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

async function getMetaRecord(key) {
  const tx = createTransaction(['meta']);
  const result = await requestToPromise(tx.objectStore('meta').get(key));
  await transactionDone(tx);
  return result?.value ?? null;
}

async function putMetaRecord(key, value) {
  const tx = createTransaction(['meta'], 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await transactionDone(tx);
}

async function readDatabaseBundle() {
  const tx = createTransaction([...DATA_STORES, 'meta']);
  const [expenses, categories, favorites, projects, monthRows, metaRow, activationRow] = await Promise.all([
    requestToPromise(tx.objectStore('expenses').getAll()),
    requestToPromise(tx.objectStore('categories').getAll()),
    requestToPromise(tx.objectStore('favorites').getAll()),
    requestToPromise(tx.objectStore('projects').getAll()),
    requestToPromise(tx.objectStore('monthSettings').getAll()),
    requestToPromise(tx.objectStore('meta').get('appMeta')),
    requestToPromise(tx.objectStore('meta').get('activation'))
  ]);
  await transactionDone(tx);
  return {
    rawState: {
      version: APP_VERSION,
      revision: Number(metaRow?.value?.revision) || 0,
      expenses,
      categories,
      favorites,
      projects,
      monthSettings: Object.fromEntries(monthRows.map((row) => [row.month, { budget: row.budget, savingsGoal: row.savingsGoal }])),
      recentCategories: Array.isArray(metaRow?.value?.recentCategories) ? metaRow.value.recentCategories : []
    },
    meta: metaRow?.value || null,
    activation: activationRow?.value || null
  };
}

async function getLatestSnapshot() {
  const tx = createTransaction(['snapshots']);
  const rows = await requestToPromise(tx.objectStore('snapshots').getAll());
  await transactionDone(tx);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const row of rows) {
    const normalized = normalizeState(row.data, { strict: true });
    if (!normalized.ok) continue;
    const checksum = await checksumState(normalized.data);
    if (checksum === row.checksum) return row;
  }
  return null;
}

async function createSnapshot(reason, source = state) {
  const normalized = normalizeState(source, { strict: true });
  if (!normalized.ok) throw new DataSafetyError(`No se puede crear la copia interna: ${normalized.errors.join(' ')}`);
  const data = exportableState(normalized.data);
  const checksum = await checksumState(normalized.data);
  const row = {
    id: uid(),
    createdAt: new Date().toISOString(),
    reason,
    revision: Number(source.revision) || 0,
    checksum,
    counts: {
      expenses: activeExpenses(source).length,
      trash: trashedExpenses(source).length,
      categories: source.categories.length,
      projects: source.projects.length
    },
    data
  };
  const tx = createTransaction(['snapshots'], 'readwrite');
  const store = tx.objectStore('snapshots');
  store.put(row);
  const rows = await requestToPromise(store.getAll());
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const old of rows.slice(MAX_SNAPSHOTS - 1)) store.delete(old.id);
  await transactionDone(tx);
  latestSnapshotMeta = row;
  return row;
}

async function pruneAudit() {
  const tx = createTransaction(['audit'], 'readwrite');
  const store = tx.objectStore('audit');
  const rows = await requestToPromise(store.getAll());
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  rows.slice(MAX_AUDIT_ROWS).forEach((row) => store.delete(row.id));
  await transactionDone(tx);
}

function readMirrorEnvelope(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    mirrorStatus.error = `No se pudo leer ${key}: ${error.message}`;
    return null;
  }
}

async function validateMirrorEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || !envelope.data || !envelope.checksum) return null;
  const normalized = normalizeState(envelope.data, { strict: true });
  if (!normalized.ok) return null;
  const checksum = await checksumState(normalized.data);
  if (checksum !== envelope.checksum) return null;
  normalized.data.revision = Number(envelope.revision) || 0;
  return { envelope, data: normalized.data };
}

async function readBestMirror() {
  const current = await validateMirrorEnvelope(readMirrorEnvelope(MIRROR_CURRENT_KEY));
  const previous = await validateMirrorEnvelope(readMirrorEnvelope(MIRROR_PREVIOUS_KEY));
  mirrorStatus.current = !!current;
  mirrorStatus.previous = !!previous;
  return [current, previous].filter(Boolean).sort((a, b) => {
    const revisionDiff = (Number(b.envelope.revision) || 0) - (Number(a.envelope.revision) || 0);
    if (revisionDiff) return revisionDiff;
    return String(b.envelope.updatedAt || '').localeCompare(String(a.envelope.updatedAt || ''));
  })[0] || null;
}

async function writeMirror(source, { allowEmpty = false } = {}) {
  const data = exportableState(source);
  const checksum = await checksumState(source);
  const currentEnvelope = readMirrorEnvelope(MIRROR_CURRENT_KEY);
  const currentCount = Number(currentEnvelope?.counts?.totalExpenses) || 0;
  if (!allowEmpty && currentCount > 0 && source.expenses.length === 0) {
    throw new DataSafetyError('Se bloqueó una copia vacía que intentaba reemplazar un respaldo con datos.');
  }
  const envelope = {
    format: 'control-presupuesto-mirror',
    version: APP_VERSION,
    revision: Number(source.revision) || 0,
    updatedAt: new Date().toISOString(),
    checksum,
    counts: {
      totalExpenses: source.expenses.length,
      activeExpenses: activeExpenses(source).length,
      trash: trashedExpenses(source).length
    },
    data
  };
  try {
    if (currentEnvelope) localStorage.setItem(MIRROR_PREVIOUS_KEY, JSON.stringify(currentEnvelope));
    localStorage.setItem(MIRROR_CURRENT_KEY, JSON.stringify(envelope));
    mirrorStatus.current = true;
    mirrorStatus.previous = !!currentEnvelope;
    mirrorStatus.error = '';
    return true;
  } catch (error) {
    mirrorStatus.error = error.message;
    return false;
  }
}

function buildAppMeta(source, checksum, currentMeta, revision) {
  return {
    initialized: true,
    schemaVersion: APP_VERSION,
    revision,
    checksum,
    updatedAt: new Date().toISOString(),
    totalExpenseCount: source.expenses.length,
    activeExpenseCount: activeExpenses(source).length,
    trashCount: trashedExpenses(source).length,
    categoryCount: source.categories.length,
    projectCount: source.projects.length,
    installId: currentMeta?.installId || uid(),
    migratedFromV4: !!currentMeta?.migratedFromV4,
    migrationAt: currentMeta?.migrationAt || null,
    lastExternalBackupAt: currentMeta?.lastExternalBackupAt || null,
    recentCategories: [...source.recentCategories]
  };
}

async function replaceDataInTransaction(tx, source) {
  const stores = {
    expenses: tx.objectStore('expenses'),
    categories: tx.objectStore('categories'),
    favorites: tx.objectStore('favorites'),
    projects: tx.objectStore('projects'),
    monthSettings: tx.objectStore('monthSettings')
  };
  for (const name of DATA_STORES) stores[name].clear();
  source.expenses.forEach((row) => stores.expenses.put(row));
  source.categories.forEach((row) => stores.categories.put(row));
  source.favorites.forEach((row) => stores.favorites.put(row));
  source.projects.forEach((row) => stores.projects.put(row));
  Object.entries(source.monthSettings).forEach(([month, config]) => stores.monthSettings.put({ month, budget: config.budget, savingsGoal: config.savingsGoal }));
}

async function forceWriteState(source, reason, metaOverrides = {}) {
  const normalized = normalizeState(source, { strict: true });
  if (!normalized.ok) throw new DataSafetyError(normalized.errors.join(' '));
  const clean = normalized.data;
  const checksum = await checksumState(clean);
  const tx = createTransaction(ALL_TX_STORES, 'readwrite');
  const metaStore = tx.objectStore('meta');
  const currentRow = await requestToPromise(metaStore.get('appMeta'));
  const currentMeta = currentRow?.value || null;
  const revision = Math.max(Number(currentMeta?.revision) || 0, Number(source.revision) || 0) + 1;
  clean.revision = revision;
  await replaceDataInTransaction(tx, clean);
  const nextMeta = { ...buildAppMeta(clean, checksum, currentMeta, revision), ...metaOverrides };
  metaStore.put({ key: 'appMeta', value: nextMeta });
  tx.objectStore('audit').put({
    id: uid(),
    createdAt: new Date().toISOString(),
    action: reason,
    revision,
    counts: { activeExpenses: activeExpenses(clean).length, totalExpenses: clean.expenses.length }
  });
  await transactionDone(tx);
  state = clean;
  appMeta = nextMeta;
  try {
    await writeMirror(state, { allowEmpty: true });
  } catch (error) {
    mirrorStatus.error = error.message;
  }
  await createSnapshot(reason, state);
  pruneAudit().catch(console.warn);
  return state;
}

async function commitDraft(draft, action, { allowEmpty = false, skipSnapshot = false } = {}) {
  const normalized = normalizeState(draft, { strict: true });
  if (!normalized.ok) throw new DataSafetyError(normalized.errors.join(' '));
  const clean = normalized.data;
  const checksum = await checksumState(clean);
  const expectedRevision = Number(state?.revision) || 0;
  const tx = createTransaction(ALL_TX_STORES, 'readwrite');
  const metaStore = tx.objectStore('meta');
  const currentRow = await requestToPromise(metaStore.get('appMeta'));
  const currentMeta = currentRow?.value || null;
  const currentRevision = Number(currentMeta?.revision) || 0;

  if (currentMeta?.initialized && currentRevision !== expectedRevision) {
    tx.abort();
    throw new StaleRevisionError('Los datos cambiaron en otra ventana.');
  }
  if (!allowEmpty && Number(currentMeta?.totalExpenseCount) > 0 && clean.expenses.length === 0) {
    tx.abort();
    throw new DataSafetyError('Se bloqueó un intento de reemplazar una base con datos por una base vacía.');
  }

  const revision = currentRevision + 1;
  clean.revision = revision;
  await replaceDataInTransaction(tx, clean);
  const nextMeta = buildAppMeta(clean, checksum, currentMeta, revision);
  metaStore.put({ key: 'appMeta', value: nextMeta });
  tx.objectStore('audit').put({
    id: uid(),
    createdAt: new Date().toISOString(),
    action,
    revision,
    counts: { activeExpenses: activeExpenses(clean).length, totalExpenses: clean.expenses.length }
  });
  await transactionDone(tx);

  state = clean;
  appMeta = nextMeta;
  let mirrorOk = false;
  try {
    mirrorOk = await writeMirror(state, { allowEmpty });
  } catch (error) {
    mirrorStatus.error = error.message;
  }
  let snapshotOk = true;
  if (!skipSnapshot) {
    try {
      await createSnapshot(`automatic:${action}`, state);
    } catch (error) {
      snapshotOk = false;
      console.error(error);
    }
  }
  pruneAudit().catch(console.warn);
  channel?.postMessage({ type: 'revision', revision, source: appMeta.installId });
  return { mirrorOk, snapshotOk, revision };
}

async function verifyLoadedBundle(bundle) {
  if (!bundle.meta?.initialized) return { status: 'new' };
  const normalized = normalizeState(bundle.rawState, { strict: true });
  if (!normalized.ok) return { status: 'invalid', reason: normalized.errors.join(' ') };
  const checksum = await checksumState(normalized.data);
  const countsMatch =
    Number(bundle.meta.totalExpenseCount) === normalized.data.expenses.length &&
    Number(bundle.meta.activeExpenseCount) === activeExpenses(normalized.data).length;
  if (checksum !== bundle.meta.checksum) return { status: 'invalid', reason: 'La suma de integridad no coincide.' };
  if (!countsMatch) return { status: 'invalid', reason: 'La cantidad de registros no coincide con los metadatos.' };
  normalized.data.revision = Number(bundle.meta.revision) || 0;
  return { status: 'valid', data: normalized.data };
}

async function readLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalized = normalizeState(parsed, { strict: false });
    return normalized.ok ? normalized.data : null;
  } catch (error) {
    console.warn('No se pudo leer la B4:', error);
    return null;
  }
}

async function recoverFromAvailableSources(reason) {
  const snapshot = await getLatestSnapshot();
  if (snapshot) {
    await forceWriteState(snapshot.data, `recovery:snapshot:${reason}`);
    recoveryNotice = `Se recuperó automáticamente la copia interna del ${formatDateTime(snapshot.createdAt)}.`;
    return true;
  }
  const mirror = await readBestMirror();
  if (mirror) {
    await forceWriteState(mirror.data, `recovery:mirror:${reason}`);
    recoveryNotice = `Se recuperó automáticamente la copia secundaria del ${formatDateTime(mirror.envelope.updatedAt)}.`;
    return true;
  }
  return false;
}

async function initializeDataLayer() {
  $('bootMessage').textContent = 'Abriendo IndexedDB…';
  db = await openDatabase();

  if (navigator.storage?.persist) {
    try { persistentStorageGranted = await navigator.storage.persist(); } catch (_) { persistentStorageGranted = false; }
  }
  if (navigator.storage?.estimate) {
    try { storageEstimate = await navigator.storage.estimate(); } catch (_) { storageEstimate = null; }
  }

  $('bootMessage').textContent = 'Verificando integridad…';
  let bundle = await readDatabaseBundle();
  activationMeta = bundle.activation || { active: false, failedAttempts: 0, lockUntil: 0 };
  const verification = await verifyLoadedBundle(bundle);

  if (verification.status === 'valid') {
    state = verification.data;
    appMeta = bundle.meta;
    latestSnapshotMeta = await getLatestSnapshot();
    await readBestMirror();
    return;
  }

  if (verification.status === 'new') {
    $('bootMessage').textContent = 'Buscando información anterior…';
    const mirror = await readBestMirror();
    if (mirror) {
      await forceWriteState(mirror.data, 'initialize:mirror-recovery');
      recoveryNotice = 'Se recuperaron datos de la copia secundaria local.';
      bundle = await readDatabaseBundle();
      activationMeta = bundle.activation || activationMeta;
      return;
    }
    const legacy = await readLegacyState();
    if (legacy) {
      await forceWriteState(legacy, 'initialize:migrate-v4', {
        migratedFromV4: true,
        migrationAt: new Date().toISOString()
      });
      recoveryNotice = 'Se migraron y verificaron los datos de la B4. La copia antigua se conservó.';
      bundle = await readDatabaseBundle();
      activationMeta = bundle.activation || activationMeta;
      return;
    }
    await forceWriteState(initialState(), 'initialize:new-install');
    bundle = await readDatabaseBundle();
    activationMeta = bundle.activation || activationMeta;
    return;
  }

  $('bootMessage').textContent = 'Intentando recuperación automática…';
  const recovered = await recoverFromAvailableSources(verification.reason || 'integrity-failure');
  if (!recovered) {
    throw new RecoveryRequiredError(`La base existente no pasó la validación: ${verification.reason || 'causa desconocida'}`);
  }
  bundle = await readDatabaseBundle();
  activationMeta = bundle.activation || activationMeta;
}

async function reloadFromDatabase({ notify = false } = {}) {
  const bundle = await readDatabaseBundle();
  const verification = await verifyLoadedBundle(bundle);
  if (verification.status !== 'valid') {
    const recovered = await recoverFromAvailableSources(verification.reason || 'reload-failure');
    if (!recovered) throw new RecoveryRequiredError(verification.reason || 'No se pudo validar la base.');
    return reloadFromDatabase({ notify });
  }
  state = verification.data;
  appMeta = bundle.meta;
  activationMeta = bundle.activation || activationMeta;
  latestSnapshotMeta = await getLatestSnapshot();
  renderAll();
  if (notify) showToast('Datos actualizados desde otra ventana.');
}

async function applyMutation(action, mutator, options = {}) {
  if (!activationMeta?.active) {
    showToast('La aplicación no está activada.');
    return { ok: false };
  }
  if (isSaving) {
    showToast('Espera a que termine el guardado actual.');
    return { ok: false };
  }
  const draft = deepClone(state);
  let mutationResult;
  try {
    mutationResult = mutator(draft);
    if (mutationResult === false) return { ok: false };
  } catch (error) {
    showToast(error.message || 'No se pudo preparar el cambio.');
    return { ok: false };
  }

  isSaving = true;
  document.body.classList.add('saving');
  try {
    const result = await commitDraft(draft, action, options);
    renderAll();
    if (!result.mirrorOk || !result.snapshotOk) {
      showStorageWarning('El dato principal fue guardado, pero una copia secundaria no pudo actualizarse. Crea un respaldo externo.');
    }
    return { ok: true, result, mutationResult };
  } catch (error) {
    console.error(error);
    if (error instanceof StaleRevisionError) {
      await reloadFromDatabase({ notify: false });
      showToast('Otra ventana actualizó los datos. Revisa y vuelve a intentar.');
    } else if (error instanceof DataSafetyError) {
      showStorageWarning(error.message);
      showToast('La operación fue bloqueada para proteger los datos.');
    } else {
      showStorageWarning(`No se confirmó el guardado: ${error.message}`);
      showToast('No se pudo guardar. Tus datos anteriores permanecen intactos.');
    }
    return { ok: false, error };
  } finally {
    isSaving = false;
    document.body.classList.remove('saving');
  }
}

function showStorageWarning(message) {
  const box = $('storageWarning');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}
function clearStorageWarning() {
  if ($('storageWarning')) $('storageWarning').hidden = true;
}
function showToast(message, undo = false) {
  const toast = $('toast');
  toast.innerHTML = undo ? `${escapeHtml(message)} <button id="undoToastBtn" type="button">Deshacer</button>` : escapeHtml(message);
  toast.hidden = false;
  clearTimeout(toastTimer);
  if (undo) $('undoToastBtn').onclick = undoLastExpense;
  toastTimer = setTimeout(() => { toast.hidden = true; }, undo ? 6500 : 2800);
}
function openModal(id) {
  $(id).hidden = false;
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  $(id).hidden = true;
  if (!modalIds.some((modalId) => !$(modalId).hidden)) document.body.classList.remove('modal-open');
}
function setSelectOptions(element, items, value) {
  element.innerHTML = items.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('');
  if (value && items.some((item) => item.value === value)) element.value = value;
}
function setActivationMessage(message, type = '') {
  const element = $('activationMessage');
  element.textContent = message;
  element.className = `system-message ${type}`;
}

async function activateApplication() {
  const now = Date.now();
  const lockUntil = Number(activationMeta?.lockUntil) || 0;
  if (lockUntil > now) {
    const seconds = Math.ceil((lockUntil - now) / 1000);
    setActivationMessage(`Espera ${seconds} segundos antes de volver a intentar.`, 'error');
    return;
  }
  const code = $('activationCodeInput').value.trim();
  if (!code) {
    setActivationMessage('Ingresa el código de activación.', 'error');
    return;
  }
  $('activateBtn').disabled = true;
  try {
    const hash = await sha256(code);
    if (hash === ACTIVATION_HASH) {
      activationMeta = {
        active: true,
        activatedAt: new Date().toISOString(),
        failedAttempts: 0,
        lockUntil: 0,
        deviceId: activationMeta?.deviceId || uid()
      };
      await putMetaRecord('activation', activationMeta);
      setActivationMessage('Aplicación activada correctamente.', 'good');
      $('activationCodeInput').value = '';
      setTimeout(showUnlockedApplication, 350);
      return;
    }
    const failedAttempts = (Number(activationMeta?.failedAttempts) || 0) + 1;
    const mustLock = failedAttempts >= 5;
    activationMeta = {
      ...(activationMeta || {}),
      active: false,
      failedAttempts: mustLock ? 0 : failedAttempts,
      lockUntil: mustLock ? Date.now() + 60000 : 0
    };
    await putMetaRecord('activation', activationMeta);
    setActivationMessage(mustLock ? 'Cinco intentos incorrectos. Espera un minuto.' : `Código incorrecto. Intento ${failedAttempts} de 5.`, 'error');
  } catch (error) {
    setActivationMessage(`No se pudo verificar el código: ${error.message}`, 'error');
  } finally {
    $('activateBtn').disabled = false;
  }
}

async function deactivateApplication() {
  if (!confirm('¿Desactivar la aplicación en este dispositivo? Tus datos no se borrarán.')) return;
  activationMeta = { ...(activationMeta || {}), active: false, failedAttempts: 0, lockUntil: 0 };
  await putMetaRecord('activation', activationMeta);
  closeModal('settingsModal');
  $('appRoot').hidden = true;
  $('activationOverlay').hidden = false;
  setActivationMessage('Aplicación desactivada. Ingresa el código para volver a habilitarla.');
}

function showUnlockedApplication() {
  $('bootOverlay').hidden = true;
  $('recoveryOverlay').hidden = true;
  $('activationOverlay').hidden = true;
  $('appRoot').hidden = false;
  renderAll();
  if (recoveryNotice) {
    showStorageWarning(recoveryNotice);
    recoveryNotice = '';
  } else if (!persistentStorageGranted) {
    showStorageWarning('El navegador no concedió almacenamiento persistente. La base está protegida con copias internas y secundaria; crea respaldos externos periódicos.');
  }
}

function showLockedApplication() {
  $('bootOverlay').hidden = true;
  $('recoveryOverlay').hidden = true;
  $('appRoot').hidden = true;
  $('activationOverlay').hidden = false;
  setActivationMessage('');
  setTimeout(() => $('activationCodeInput').focus(), 100);
}

function visibleCategories(source = state) {
  return source.categories.filter((category) => !category.hidden).sort((a, b) => a.order - b.order);
}
function categoryNames(source = state) { return visibleCategories(source).map((category) => category.name); }
function activeProject(source = state) { return source.projects.find((project) => project.active) || source.projects[0]; }
function projectById(id, source = state) {
  return source.projects.find((project) => project.id === id) || source.projects.find((project) => project.id === 'general');
}
function getMonthSetting(key = monthKey(), source = state) {
  const config = source.monthSettings[key] || {};
  return { budget: Number(config.budget) || 0, savingsGoal: Number(config.savingsGoal) || 0 };
}
function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date;
}
function inThisWeek(date) {
  const value = new Date(`${date}T12:00:00`);
  const now = new Date();
  return value >= startOfWeek(now) && value <= now;
}
function currentPeriodExpenses(period, source = state) {
  const today = localDateKey();
  const currentMonth = monthKey();
  return activeExpenses(source).filter((expense) => {
    if (period === 'day') return expense.date === today;
    if (period === 'week') return inThisWeek(expense.date);
    return expense.date.slice(0, 7) === currentMonth;
  });
}
function registerRecentCategory(draft, name) {
  draft.recentCategories = [name, ...draft.recentCategories.filter((item) => item !== name)].slice(0, 4);
}

async function addExpense(amountValue, category, detail = '', projectId = 'general', date = null, time = null) {
  const amount = parseAmount(amountValue);
  if (amount <= 0) {
    showToast('Ingresa un monto válido.');
    return false;
  }
  const chosenCategory = category || categoryNames()[0] || 'Otros';
  const now = new Date();
  const expenseDate = date || localDateKey(now);
  const expenseTime = time || localTimeKey(now);
  const id = uid();
  const result = await applyMutation('expense:add', (draft) => {
    draft.expenses.push({
      id,
      amount,
      category: chosenCategory,
      detail: detail.trim(),
      projectId: projectId || 'general',
      date: expenseDate,
      createdAt: localDateTime(expenseDate, expenseTime),
      deletedAt: null,
      deletedReason: ''
    });
    registerRecentCategory(draft, chosenCategory);
  });
  if (result.ok) {
    lastAddedExpenseId = id;
    showToast('Gasto guardado y verificado.', true);
    return true;
  }
  return false;
}

async function undoLastExpense() {
  if (!lastAddedExpenseId) return;
  const id = lastAddedExpenseId;
  const result = await applyMutation('expense:undo', (draft) => {
    const expense = draft.expenses.find((item) => item.id === id);
    if (!expense) return false;
    expense.deletedAt = new Date().toISOString();
    expense.deletedReason = 'Deshecho inmediatamente';
  });
  if (result.ok) {
    lastAddedExpenseId = null;
    $('toast').hidden = true;
    showToast('Registro movido a la papelera.');
  }
}

function renderAll() {
  if (!state) return;
  renderSelectors();
  renderTotals();
  renderActiveProject();
  renderFavorites();
  renderRecent();
  renderSummary();
  renderHistoryOptions();
  renderHistory();
  renderProjects();
  renderCategories();
  renderTrash();
  renderDiagnostics();
  updateAutoDatePreview();
}

function renderSelectors() {
  const categories = categoryNames();
  const projects = state.projects.map((project) => ({
    value: project.id,
    label: project.active && project.id !== 'general' ? `${project.name} (activo)` : project.name
  }));
  if (!$('categoryInput').value || !categories.includes($('categoryInput').value)) {
    $('categoryInput').value = categories[0] || 'Otros';
    $('categoryPickerText').textContent = categories[0] || 'Otros';
  }
  setSelectOptions($('projectInput'), projects, activeProject().id);
  setSelectOptions($('favoriteConfirmProject'), projects, activeProject().id);
  setSelectOptions($('favoriteCategoryInput'), categories.map((name) => ({ value: name, label: name })), $('favoriteCategoryInput').value);
  setSelectOptions($('editExpenseCategory'), categories.map((name) => ({ value: name, label: name })), $('editExpenseCategory').value);
  setSelectOptions($('editExpenseProject'), projects, $('editExpenseProject').value);
}

function renderTotals() {
  const now = new Date();
  const today = sum(currentPeriodExpenses('day'));
  const week = sum(currentPeriodExpenses('week'));
  const monthRows = currentPeriodExpenses('month');
  const monthSpent = sum(monthRows);
  const config = getMonthSetting();
  const usable = Math.max(0, config.budget - config.savingsGoal);
  const available = usable - monthSpent;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
  const daily = available / remainingDays;
  const percent = usable > 0 ? Math.min(100, (monthSpent / usable) * 100) : 0;

  $('todayTotal').textContent = money(today);
  $('weekTotal').textContent = money(week);
  $('monthTotal').textContent = money(monthSpent);
  $('currentMonthName').textContent = monthLabel(monthKey());
  $('availableMonth').textContent = money(available);
  $('monthProgressBar').style.width = `${percent}%`;

  if (config.budget <= 0) {
    $('budgetStatus').textContent = 'Configura tu presupuesto mensual.';
    $('monthProgressBadge').textContent = 'Sin configurar';
    $('monthProgressBadge').className = 'badge';
    $('dailyAllowance').textContent = '—';
    $('monthDaysInfo').textContent = `Este mes tiene ${daysInMonth} días.`;
  } else {
    $('budgetStatus').textContent = `Presupuesto utilizable: ${money(usable)} · Ahorro: ${money(config.savingsGoal)}`;
    $('dailyAllowance').textContent = money(Math.max(0, daily));
    $('monthDaysInfo').textContent = `Referencia para ${remainingDays} día${remainingDays === 1 ? '' : 's'} restante${remainingDays === 1 ? '' : 's'} de ${daysInMonth}.`;
    const badge = $('monthProgressBadge');
    badge.textContent = `${Math.round(percent)}% usado`;
    badge.className = `badge ${percent >= 100 ? 'danger' : percent >= 75 ? 'warning' : 'good'}`;
  }
  $('paceMessage').textContent = config.budget <= 0
    ? 'Configura tu presupuesto para ver el ritmo de gasto.'
    : available < 0
      ? `Has superado tu monto utilizable en ${money(Math.abs(available))}.`
      : `Te quedan ${money(available)}. Para mantenerte dentro del presupuesto, la referencia es ${money(Math.max(0, daily))} por día.`;
}

function renderActiveProject() {
  const project = activeProject();
  const card = $('activeProjectCard');
  $('activeProjectLabel').textContent = project.name;
  $('projectHint').textContent = project.id === 'general'
    ? 'El gasto se registrará dentro de tus gastos generales.'
    : `El gasto se asignará a “${project.name}” y también contará en el total mensual.`;
  if (project.id === 'general') {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const spent = sum(activeExpenses().filter((expense) => expense.projectId === project.id));
  const available = Number(project.budget || 0) - spent;
  const percent = project.budget > 0 ? Math.min(100, (spent / project.budget) * 100) : 0;
  $('activeProjectName').textContent = project.name;
  $('activeProjectBudget').textContent = money(project.budget);
  $('activeProjectSpent').textContent = money(spent);
  $('activeProjectAvailable').textContent = money(available);
  $('activeProjectProgress').style.width = `${percent}%`;
}

function renderRecent() {
  const valid = state.recentCategories.filter((name) => categoryNames().includes(name)).slice(0, 4);
  $('recentSection').hidden = !valid.length;
  $('recentCategories').innerHTML = valid.map((name) => `<button type="button" data-recent-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  $('recentCategories').querySelectorAll('[data-recent-category]').forEach((button) => {
    button.onclick = () => {
      $('categoryInput').value = button.dataset.recentCategory;
      $('categoryPickerText').textContent = button.dataset.recentCategory;
      $('amountInput').focus();
      window.scrollTo({ top: $('expenseForm').getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    };
  });
}

function renderFavorites() {
  $('quickButtons').innerHTML = state.favorites.length
    ? state.favorites.map((favorite) => `
      <article class="quick-card">
        <button class="quick-use" data-use-favorite="${favorite.id}" type="button">
          <strong>${escapeHtml(favorite.label)}</strong>
          <span>${money(favorite.amount)} · ${escapeHtml(favorite.category)}</span>
        </button>
        <button class="quick-edit" data-edit-favorite="${favorite.id}" type="button" aria-label="Editar favorito">✎</button>
      </article>`).join('')
    : '<p class="empty">No hay favoritos. Agrega uno para registrar más rápido.</p>';

  $('quickButtons').querySelectorAll('[data-use-favorite]').forEach((button) => {
    button.onclick = () => openFavoriteConfirmation(button.dataset.useFavorite);
  });
  $('quickButtons').querySelectorAll('[data-edit-favorite]').forEach((button) => {
    button.onclick = () => openFavoriteEditor(button.dataset.editFavorite);
  });
}

function openFavoriteConfirmation(id) {
  const favorite = state.favorites.find((item) => item.id === id);
  if (!favorite) return;
  selectedFavoriteId = id;
  $('favoriteConfirmTitle').textContent = `Confirmar “${favorite.label}”`;
  $('favoriteConfirmInfo').textContent = `Categoría: ${favorite.category}. Revisa el monto antes de registrar.`;
  $('favoriteConfirmAmount').value = inputAmount(favorite.amount);
  renderSelectors();
  $('favoriteConfirmProject').value = activeProject().id;
  openModal('favoriteConfirmModal');
  setTimeout(() => $('favoriteConfirmAmount').focus(), 80);
}

function openFavoriteEditor(id = null) {
  editingFavoriteId = id;
  const favorite = id ? state.favorites.find((item) => item.id === id) : null;
  $('favoriteEditorTitle').textContent = favorite ? 'Editar favorito' : 'Nuevo favorito';
  $('favoriteLabelInput').value = favorite?.label || '';
  $('favoriteAmountInput').value = favorite ? inputAmount(favorite.amount) : '';
  renderSelectors();
  $('favoriteCategoryInput').value = favorite?.category || categoryNames()[0] || 'Otros';
  $('deleteFavoriteBtn').hidden = !favorite;
  openModal('favoriteEditorModal');
}

function renderSummary() {
  const period = $('periodFilter').value || 'month';
  const rows = currentPeriodExpenses(period);
  const totals = new Map();
  rows.forEach((expense) => totals.set(expense.category, (totals.get(expense.category) || 0) + Number(expense.amount)));
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = sum(rows);
  const label = period === 'day' ? 'hoy' : period === 'week' ? 'esta semana' : 'este mes';
  $('categoryPeriodTotal').textContent = `Total ${label}: ${money(total)}`;
  $('categorySummary').innerHTML = entries.length
    ? entries.map(([name, value]) => `
      <div>
        <div class="bar-info"><span>${escapeHtml(name)}</span><strong>${money(value)}</strong></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${total ? (value / total) * 100 : 0}%"></div></div>
      </div>`).join('')
    : '<p class="empty">No hay gastos en este periodo.</p>';
}

function historyMonths() {
  return [...new Set(activeExpenses().map((expense) => expense.date.slice(0, 7)))].sort().reverse();
}

function renderHistoryOptions() {
  const current = $('historyMonthFilter').value || monthKey();
  const items = [{ value: 'all', label: 'Todos los meses' }, ...historyMonths().map((key) => ({ value: key, label: monthLabel(key) }))];
  setSelectOptions($('historyMonthFilter'), items, items.some((item) => item.value === current) ? current : 'all');
}

function renderHistory() {
  const query = $('searchInput').value.trim().toLowerCase();
  const monthFilter = $('historyMonthFilter').value || 'all';
  const rows = activeExpenses()
    .filter((expense) => (monthFilter === 'all' || expense.date.startsWith(monthFilter)) && (!query || `${expense.category} ${expense.detail} ${projectById(expense.projectId)?.name}`.toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  $('historyList').innerHTML = rows.length
    ? rows.map((expense) => {
      const date = new Date(expense.createdAt);
      const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      return `<article class="item">
        <div><strong>${escapeHtml(expense.detail || expense.category)}</strong><small>${escapeHtml(expense.category)} · ${expense.date} ${time} · ${escapeHtml(projectById(expense.projectId)?.name || 'General')}</small></div>
        <div class="amount-block"><strong>${money(expense.amount)}</strong><div class="item-actions"><button class="mini-btn" data-edit-expense="${expense.id}" type="button">Editar</button><button class="mini-btn delete" data-delete-expense="${expense.id}" type="button">Papelera</button></div></div>
      </article>`;
    }).join('')
    : '<p class="empty">No hay gastos para mostrar.</p>';

  $('historyList').querySelectorAll('[data-edit-expense]').forEach((button) => {
    button.onclick = () => openExpenseEditor(button.dataset.editExpense);
  });
  $('historyList').querySelectorAll('[data-delete-expense]').forEach((button) => {
    button.onclick = () => moveExpenseToTrash(button.dataset.deleteExpense);
  });
}

function openExpenseEditor(id) {
  const expense = activeExpenses().find((item) => item.id === id);
  if (!expense) return;
  editingExpenseId = id;
  renderSelectors();
  $('editExpenseAmount').value = inputAmount(expense.amount);
  $('editExpenseCategory').value = expense.category;
  $('editExpenseDetail').value = expense.detail;
  $('editExpenseProject').value = expense.projectId;
  $('editExpenseDate').value = expense.date;
  $('editExpenseTime').value = expense.createdAt.slice(11, 16);
  openModal('expenseEditorModal');
}

async function moveExpenseToTrash(id) {
  const expense = activeExpenses().find((item) => item.id === id);
  if (!expense || !confirm(`¿Mover “${expense.detail || expense.category}” a la papelera?`)) return;
  const result = await applyMutation('expense:trash', (draft) => {
    const item = draft.expenses.find((row) => row.id === id);
    if (!item) return false;
    item.deletedAt = new Date().toISOString();
    item.deletedReason = 'Eliminado por el usuario';
  });
  if (result.ok) showToast('Gasto movido a la papelera.');
}

function renderTrash() {
  const rows = trashedExpenses().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  $('trashList').innerHTML = rows.length
    ? rows.map((expense) => `<article class="item">
      <div><strong>${escapeHtml(expense.detail || expense.category)}</strong><small>${escapeHtml(expense.category)} · ${expense.date} · ${money(expense.amount)}</small><span class="trash-tag">Eliminado ${formatDateTime(expense.deletedAt)}</span></div>
      <div class="item-actions"><button class="mini-btn" data-restore-expense="${expense.id}" type="button">Restaurar</button><button class="mini-btn delete" data-permanent-delete="${expense.id}" type="button">Eliminar definitivamente</button></div>
    </article>`).join('')
    : '<p class="empty">La papelera está vacía.</p>';

  $('trashList').querySelectorAll('[data-restore-expense]').forEach((button) => {
    button.onclick = () => restoreExpense(button.dataset.restoreExpense);
  });
  $('trashList').querySelectorAll('[data-permanent-delete]').forEach((button) => {
    button.onclick = () => permanentlyDeleteExpense(button.dataset.permanentDelete);
  });
}

async function restoreExpense(id) {
  const result = await applyMutation('expense:restore', (draft) => {
    const item = draft.expenses.find((row) => row.id === id);
    if (!item) return false;
    item.deletedAt = null;
    item.deletedReason = '';
  });
  if (result.ok) showToast('Gasto restaurado.');
}

async function permanentlyDeleteExpense(id) {
  const expense = trashedExpenses().find((item) => item.id === id);
  if (!expense || !confirm('Esta acción eliminará definitivamente el gasto. ¿Continuar?')) return;
  try {
    await createSnapshot('before:permanent-delete', state);
  } catch (error) {
    showToast('No se pudo crear la copia previa. La eliminación fue cancelada.');
    return;
  }
  const result = await applyMutation('expense:permanent-delete', (draft) => {
    draft.expenses = draft.expenses.filter((row) => row.id !== id);
  }, { allowEmpty: true });
  if (result.ok) showToast('Gasto eliminado definitivamente.');
}

function renderProjects() {
  const rows = state.projects.filter((project) => project.id !== 'general');
  $('projectList').innerHTML = rows.length
    ? rows.map((project) => {
      const spent = sum(activeExpenses().filter((expense) => expense.projectId === project.id));
      return `<article class="item">
        <div><strong>${escapeHtml(project.name)} ${project.active ? '· Activo' : ''}</strong><small>Presupuesto ${money(project.budget)} · Gastado ${money(spent)} · Disponible ${money(Number(project.budget || 0) - spent)}</small></div>
        <div class="project-actions">${project.active ? '' : `<button class="mini-btn" data-activate-project="${project.id}" type="button">Activar</button>`}<button class="mini-btn" data-edit-project="${project.id}" type="button">Editar</button></div>
      </article>`;
    }).join('')
    : '<p class="empty">No hay proyectos creados.</p>';

  $('projectList').querySelectorAll('[data-activate-project]').forEach((button) => {
    button.onclick = () => activateProject(button.dataset.activateProject);
  });
  $('projectList').querySelectorAll('[data-edit-project]').forEach((button) => {
    button.onclick = () => openProjectEditor(button.dataset.editProject);
  });
}

async function activateProject(id) {
  const project = projectById(id);
  const result = await applyMutation('project:activate', (draft) => {
    draft.projects.forEach((item) => { item.active = item.id === id; });
  });
  if (result.ok) {
    showToast(`Proyecto activo: ${project.name}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function openProjectEditor(id) {
  const project = projectById(id);
  if (!project || project.id === 'general') return;
  editingProjectId = id;
  $('editProjectName').value = project.name;
  $('editProjectBudget').value = inputAmount(project.budget);
  openModal('projectEditorModal');
}

function renderCategories() {
  const rows = [...state.categories].sort((a, b) => a.order - b.order);
  $('categoriesList').innerHTML = rows.map((category, index) => `<div class="category-item ${category.hidden ? 'is-hidden' : ''}">
    <span>${escapeHtml(category.name)}${category.hidden ? ' · Oculta' : ''}</span>
    <div class="category-actions">
      <button class="mini-btn" data-up-category="${category.id}" type="button" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button class="mini-btn" data-down-category="${category.id}" type="button" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="mini-btn" data-rename-category="${category.id}" type="button">Editar</button>
      <button class="mini-btn" data-toggle-category="${category.id}" type="button" ${category.name === 'Otros' ? 'disabled' : ''}>${category.hidden ? 'Mostrar' : 'Ocultar'}</button>
    </div>
  </div>`).join('');

  $('categoriesList').querySelectorAll('[data-up-category]').forEach((button) => { button.onclick = () => moveCategory(button.dataset.upCategory, -1); });
  $('categoriesList').querySelectorAll('[data-down-category]').forEach((button) => { button.onclick = () => moveCategory(button.dataset.downCategory, 1); });
  $('categoriesList').querySelectorAll('[data-rename-category]').forEach((button) => { button.onclick = () => renameCategory(button.dataset.renameCategory); });
  $('categoriesList').querySelectorAll('[data-toggle-category]').forEach((button) => { button.onclick = () => toggleCategory(button.dataset.toggleCategory); });
}

async function moveCategory(id, delta) {
  const result = await applyMutation('category:move', (draft) => {
    const rows = [...draft.categories].sort((a, b) => a.order - b.order);
    const index = rows.findIndex((category) => category.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= rows.length) return false;
    [rows[index].order, rows[target].order] = [rows[target].order, rows[index].order];
  });
  if (result.ok) showToast('Orden actualizado.');
}

async function renameCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  if (!category) return;
  const name = prompt('Nuevo nombre:', category.name)?.trim();
  if (!name || name === category.name) return;
  if (state.categories.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    showToast('Esa categoría ya existe.');
    return;
  }
  const oldName = category.name;
  const result = await applyMutation('category:rename', (draft) => {
    const item = draft.categories.find((row) => row.id === id);
    item.name = name;
    draft.expenses.forEach((expense) => { if (expense.category === oldName) expense.category = name; });
    draft.favorites.forEach((favorite) => { if (favorite.category === oldName) favorite.category = name; });
    draft.recentCategories = draft.recentCategories.map((recent) => recent === oldName ? name : recent);
  });
  if (result.ok) showToast('Categoría actualizada.');
}

async function toggleCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  if (!category || category.name === 'Otros') return;
  const result = await applyMutation('category:visibility', (draft) => {
    const item = draft.categories.find((row) => row.id === id);
    item.hidden = !item.hidden;
  });
  if (result.ok) showToast(category.hidden ? 'Categoría visible.' : 'Categoría ocultada.');
}

function renderCategoryPicker() {
  const selected = $('categoryInput').value;
  const visible = visibleCategories();
  const recentSet = new Set(state.recentCategories);
  const frequent = visible
    .filter((category) => recentSet.has(category.name) || FREQUENT_DEFAULTS.includes(category.name))
    .sort((a, b) => {
      const recentA = state.recentCategories.indexOf(a.name);
      const recentB = state.recentCategories.indexOf(b.name);
      if (recentA >= 0 || recentB >= 0) return (recentA < 0 ? 99 : recentA) - (recentB < 0 ? 99 : recentB);
      return a.order - b.order;
    })
    .slice(0, 6);
  const all = visible.filter((category) => !frequent.some((item) => item.id === category.id));
  const html = (category) => `<button class="category-option ${category.name === selected ? 'selected' : ''}" data-category-option="${escapeHtml(category.name)}" type="button">${escapeHtml(category.name)}</button>`;
  $('frequentCategoryOptions').innerHTML = frequent.map(html).join('') || '<span class="empty">Sin categorías frecuentes.</span>';
  $('categoryOptions').innerHTML = all.map(html).join('') || '<span class="empty">No hay otras categorías.</span>';
  document.querySelectorAll('[data-category-option]').forEach((button) => {
    button.onclick = () => {
      $('categoryInput').value = button.dataset.categoryOption;
      $('categoryPickerText').textContent = button.dataset.categoryOption;
      closeModal('categoryPickerModal');
      renderCategoryPicker();
    };
  });
}

function loadSettingsMonth() {
  const key = $('settingsMonthInput').value || monthKey();
  const config = getMonthSetting(key);
  $('monthlyBudgetInput').value = inputAmount(config.budget);
  $('savingsGoalInput').value = inputAmount(config.savingsGoal);
}

function renderDiagnostics() {
  if (!appMeta) return;
  const usageMb = storageEstimate?.usage ? (storageEstimate.usage / 1024 / 1024).toFixed(2) : '—';
  const quotaMb = storageEstimate?.quota ? (storageEstimate.quota / 1024 / 1024).toFixed(0) : '—';
  const backupDate = appMeta.lastExternalBackupAt ? formatDateTime(appMeta.lastExternalBackupAt) : 'Pendiente';
  const snapshotDate = latestSnapshotMeta?.createdAt ? formatDateTime(latestSnapshotMeta.createdAt) : 'Pendiente';
  const mirrorText = mirrorStatus.current ? (mirrorStatus.previous ? 'Doble copia' : 'Copia actual') : 'No disponible';
  $('storageStatusGrid').innerHTML = [
    ['Almacenamiento', persistentStorageGranted ? 'Persistente' : 'Estándar', persistentStorageGranted ? 'status-ok' : 'status-warn'],
    ['Último guardado', formatDateTime(appMeta.updatedAt), ''],
    ['Gastos activos', String(appMeta.activeExpenseCount ?? activeExpenses().length), ''],
    ['Papelera', String(appMeta.trashCount ?? trashedExpenses().length), ''],
    ['Revisión', String(appMeta.revision ?? state.revision), ''],
    ['Copia interna', snapshotDate, latestSnapshotMeta ? 'status-ok' : 'status-warn'],
    ['Copia secundaria', mirrorText, mirrorStatus.current ? 'status-ok' : 'status-warn'],
    ['Respaldo externo', backupDate, appMeta.lastExternalBackupAt ? 'status-ok' : 'status-warn'],
    ['Espacio utilizado', `${usageMb} MB de ${quotaMb} MB`, ''],
    ['Origen', location.origin, '']
  ].map(([label, value, statusClass]) => `<div class="status-cell"><span>${escapeHtml(label)}</span><strong class="${statusClass}">${escapeHtml(value)}</strong></div>`).join('');
  $('activationStatusText').textContent = activationMeta?.active
    ? `Activada en este dispositivo desde ${formatDateTime(activationMeta.activatedAt)}.`
    : 'Aplicación no activada.';
}

async function verifyIntegrity(showSuccess = true) {
  try {
    const bundle = await readDatabaseBundle();
    const verification = await verifyLoadedBundle(bundle);
    const snapshot = await getLatestSnapshot();
    const mirror = await readBestMirror();
    latestSnapshotMeta = snapshot;
    if (verification.status !== 'valid') throw new DataSafetyError(verification.reason || 'La base no pasó la validación.');
    appMeta = bundle.meta;
    state = verification.data;
    renderAll();
    clearStorageWarning();
    if (showSuccess) showToast(`Integridad correcta: ${activeExpenses().length} gastos verificados.`);
    return true;
  } catch (error) {
    showStorageWarning(`La verificación detectó un problema: ${error.message}`);
    showToast('La integridad no pudo confirmarse.');
    return false;
  }
}

function downloadBlob(content, type, name) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelColumnName(index) {
  let value = Number(index);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function formatExportDate(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(dateValue || '');
}

function getExpenseTime(expense) {
  const direct = String(expense?.time || '').match(/^\d{2}:\d{2}/)?.[0];
  if (direct) return direct;
  const createdAt = String(expense?.createdAt || '');
  return createdAt.match(/T(\d{2}:\d{2})/)?.[1] || '';
}

function normalizedExportExpense(expense, index) {
  const amount = parseAmount(expense?.amount ?? expense?.monto ?? expense?.value ?? expense?.price);
  const category = String(expense?.category ?? expense?.categoryName ?? expense?.tipo ?? '').trim();
  const detail = String(expense?.detail ?? expense?.description ?? expense?.detalle ?? '').trim();
  const date = String(expense?.date ?? expense?.fecha ?? String(expense?.createdAt || '').slice(0, 10)).trim();
  const projectName = String(
    projectById(expense?.projectId)?.name
      || expense?.projectName
      || (expense?.projectId === 'general' ? 'Gastos generales' : '')
      || 'Gastos generales'
  ).trim();
  return {
    number: index + 1,
    date,
    time: getExpenseTime(expense),
    category: category || 'Sin categoría',
    detail: detail || 'Sin detalle',
    amount,
    project: projectName,
    month: date.slice(0, 7)
  };
}

function exportRowsFromCurrentFilters() {
  const monthFilter = $('historyMonthFilter').value || 'all';
  const query = $('searchInput').value.trim().toLowerCase();
  const rows = activeExpenses()
    .filter((expense) => {
      if (monthFilter !== 'all' && !String(expense.date || '').startsWith(monthFilter)) return false;
      const searchable = `${expense.category || ''} ${expense.detail || ''} ${projectById(expense.projectId)?.name || ''}`.toLowerCase();
      return !query || searchable.includes(query);
    })
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map(normalizedExportExpense);
  return { monthFilter, query, rows };
}

function validateExportRows(rows) {
  if (!rows.length) throw new DataSafetyError('No hay gastos para exportar con los filtros actuales.');
  const invalidAmounts = rows.filter((row) => !Number.isFinite(row.amount) || row.amount <= 0);
  const invalidDates = rows.filter((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.date));
  if (invalidAmounts.length || invalidDates.length) {
    throw new DataSafetyError(`La exportación fue detenida porque ${invalidAmounts.length + invalidDates.length} registro(s) tienen datos incompletos. Revisa el historial antes de exportar.`);
  }
}

function uint16LE(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value >>> 0, true);
  return bytes;
}

function uint32LE(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatByteArrays(parts) {
  const total = parts.reduce((sumValue, part) => sumValue + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | Math.floor(date.getSeconds() / 2),
    date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  };
}

function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const timestamp = dosDateTime();
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const dataBytes = content instanceof Uint8Array ? content : encoder.encode(String(content));
    const checksum = crc32(dataBytes);
    const flags = 0x0800;
    const localHeader = concatByteArrays([
      uint32LE(0x04034B50), uint16LE(20), uint16LE(flags), uint16LE(0),
      uint16LE(timestamp.time), uint16LE(timestamp.date), uint32LE(checksum),
      uint32LE(dataBytes.length), uint32LE(dataBytes.length), uint16LE(nameBytes.length), uint16LE(0), nameBytes
    ]);
    localParts.push(localHeader, dataBytes);

    const centralHeader = concatByteArrays([
      uint32LE(0x02014B50), uint16LE(20), uint16LE(20), uint16LE(flags), uint16LE(0),
      uint16LE(timestamp.time), uint16LE(timestamp.date), uint32LE(checksum),
      uint32LE(dataBytes.length), uint32LE(dataBytes.length), uint16LE(nameBytes.length),
      uint16LE(0), uint16LE(0), uint16LE(0), uint16LE(0), uint32LE(0), uint32LE(offset), nameBytes
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralDirectory = concatByteArrays(centralParts);
  const end = concatByteArrays([
    uint32LE(0x06054B50), uint16LE(0), uint16LE(0), uint16LE(files.length),
    uint16LE(files.length), uint32LE(centralDirectory.length), uint32LE(offset), uint16LE(0)
  ]);
  return new Blob([...localParts, centralDirectory, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function inlineStringCell(reference, value, style = 0) {
  const preserve = /^\s|\s$|\n/.test(String(value ?? '')) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
}

function numericCell(reference, value, style = 0) {
  return `<c r="${reference}"${style ? ` s="${style}"` : ''}><v>${Number(value)}</v></c>`;
}

function buildExpenseWorkbook(rows, periodLabel) {
  validateExportRows(rows);
  const total = rows.reduce((sumValue, row) => sumValue + row.amount, 0);
  const exportedAt = new Date();
  const headers = ['N.º', 'Fecha', 'Hora', 'Categoría', 'Detalle', 'Monto (Bs)', 'Proyecto', 'Mes'];
  const dataStartRow = 6;
  const dataRows = rows.map((row, rowIndex) => {
    const excelRow = dataStartRow + rowIndex;
    const values = [
      row.number,
      formatExportDate(row.date),
      row.time,
      row.category,
      row.detail,
      row.amount,
      row.project,
      row.month
    ];
    const cells = values.map((value, columnIndex) => {
      const ref = `${excelColumnName(columnIndex + 1)}${excelRow}`;
      if (columnIndex === 0) return numericCell(ref, value, 0);
      if (columnIndex === 5) return numericCell(ref, value, 2);
      return inlineStringCell(ref, value, 0);
    }).join('');
    return `<row r="${excelRow}">${cells}</row>`;
  }).join('');

  const headerCells = headers.map((header, index) => inlineStringCell(`${excelColumnName(index + 1)}5`, header, 1)).join('');
  const lastDataRow = dataStartRow + rows.length - 1;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="13" customWidth="1"/><col min="3" max="3" width="10" customWidth="1"/><col min="4" max="4" width="25" customWidth="1"/><col min="5" max="5" width="36" customWidth="1"/><col min="6" max="6" width="15" customWidth="1"/><col min="7" max="7" width="27" customWidth="1"/><col min="8" max="8" width="12" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${inlineStringCell('A1', 'Control de Presupuesto — Gastos exportados', 3)}</row>
    <row r="2">${inlineStringCell('A2', 'Periodo', 4)}${inlineStringCell('B2', periodLabel, 0)}${inlineStringCell('D2', 'Fecha de exportación', 4)}${inlineStringCell('E2', exportedAt.toLocaleString('es-BO'), 0)}</row>
    <row r="3">${inlineStringCell('A3', 'Registros', 4)}${numericCell('B3', rows.length, 0)}${inlineStringCell('D3', 'Total gastado (Bs)', 4)}${numericCell('E3', total, 2)}</row>
    <row r="5" ht="22" customHeight="1">${headerCells}</row>
    ${dataRows}
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>
  <autoFilter ref="A5:H${lastDataRow}"/>
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.2" footer="0.2"/>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Bs &quot;#,##0.00"/></numFmts>
  <fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF0B1F3A"/><sz val="16"/><name val="Aptos Display"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123B69"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD5DFEA"/></left><right style="thin"><color rgb="FFD5DFEA"/></right><top style="thin"><color rgb="FFD5DFEA"/></top><bottom style="thin"><color rgb="FFD5DFEA"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Gastos" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const nowIso = exportedAt.toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Control de Presupuesto</dc:title><dc:creator>Control de Presupuesto B5.1</dc:creator><cp:lastModifiedBy>Control de Presupuesto B5.1</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified></cp:coreProperties>`;
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Control de Presupuesto B5.1</Application><DocSecurity>0</DocSecurity><AppVersion>5.1</AppVersion></Properties>`;

  return {
    blob: createStoredZip([
      { name: '[Content_Types].xml', content: contentTypes },
      { name: '_rels/.rels', content: rootRels },
      { name: 'docProps/core.xml', content: coreXml },
      { name: 'docProps/app.xml', content: appXml },
      { name: 'xl/workbook.xml', content: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
      { name: 'xl/styles.xml', content: stylesXml },
      { name: 'xl/worksheets/sheet1.xml', content: sheetXml }
    ]),
    total,
    count: rows.length
  };
}

function exportExcel() {
  try {
    const { monthFilter, query, rows } = exportRowsFromCurrentFilters();
    validateExportRows(rows);
    const periodLabel = monthFilter === 'all' ? 'Todos los meses' : monthLabel(monthFilter);
    const workbook = buildExpenseWorkbook(rows, query ? `${periodLabel} · filtro: ${query}` : periodLabel);
    const safePeriod = monthFilter === 'all' ? 'todos-los-meses' : monthFilter;
    downloadBlob(workbook.blob, workbook.blob.type, `control-presupuesto-${safePeriod}-${localDateKey()}.xlsx`);
    showToast(`Excel verificado: ${workbook.count} gasto(s), total ${money(workbook.total)}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo crear el archivo Excel.');
  }
}

async function exportBackup() {
  try {
    const data = exportableState(state);
    const checksum = await checksumState(state);
    const envelope = {
      format: 'control-presupuesto-backup',
      formatVersion: APP_VERSION,
      app: 'Control de Presupuesto',
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      counts: {
        activeExpenses: activeExpenses().length,
        trash: trashedExpenses().length,
        categories: state.categories.length,
        favorites: state.favorites.length,
        projects: state.projects.length
      },
      checksum,
      data
    };
    downloadBlob(JSON.stringify(envelope, null, 2), 'application/json', `respaldo-control-presupuesto-${localDateKey()}.json`);
    await patchAppMeta({ lastExternalBackupAt: envelope.exportedAt });
    renderDiagnostics();
    showToast('Respaldo completo creado y verificado.');
  } catch (error) {
    showToast(`No se pudo crear el respaldo: ${error.message}`);
  }
}

async function parseBackupFile(file) {
  const parsed = JSON.parse(await file.text());
  const isB5Envelope = parsed?.format === 'control-presupuesto-backup' && parsed?.data;
  const rawData = parsed?.data || parsed;
  const normalized = normalizeState(rawData, { strict: isB5Envelope });
  if (!normalized.ok) throw new DataSafetyError(normalized.errors.join(' '));
  if (isB5Envelope) {
    const checksum = await checksumState(normalized.data);
    if (checksum !== parsed.checksum) throw new DataSafetyError('La suma de verificación del respaldo no coincide.');
  }
  return {
    data: normalized.data,
    source: isB5Envelope ? 'B5' : 'versión anterior',
    exportedAt: parsed.exportedAt || null,
    checksum: isB5Envelope ? parsed.checksum : await checksumState(normalized.data)
  };
}

function showImportPreview(parsed) {
  pendingImport = parsed;
  const source = parsed.data;
  $('importPreview').innerHTML = [
    ['Origen', parsed.source],
    ['Fecha de la copia', parsed.exportedAt ? formatDateTime(parsed.exportedAt) : 'No informada'],
    ['Gastos activos', String(activeExpenses(source).length)],
    ['Papelera', String(trashedExpenses(source).length)],
    ['Categorías', String(source.categories.length)],
    ['Favoritos', String(source.favorites.length)],
    ['Proyectos', String(source.projects.length)]
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  openModal('importPreviewModal');
}

async function importBackupFile(file, { fromRecovery = false } = {}) {
  try {
    const parsed = await parseBackupFile(file);
    if (fromRecovery) {
      await forceWriteState(parsed.data, 'recovery:external-backup');
      $('recoveryOverlay').hidden = true;
      recoveryNotice = 'Se restauró y verificó la copia de seguridad seleccionada.';
      if (activationMeta?.active) showUnlockedApplication(); else showLockedApplication();
      return;
    }
    showImportPreview(parsed);
  } catch (error) {
    showToast(`No se pudo importar: ${error.message}`);
    if (fromRecovery) $('recoveryMessage').textContent = `El archivo no es válido: ${error.message}`;
  }
}

async function replaceWithPendingImport() {
  if (!pendingImport) return;
  try {
    await createSnapshot('before:import-replace', state);
  } catch (error) {
    showToast('No se pudo crear la copia previa. La importación fue cancelada.');
    return;
  }
  const imported = pendingImport.data;
  const result = await applyMutation('backup:replace', (draft) => {
    const copy = deepClone(imported);
    draft.expenses = copy.expenses;
    draft.categories = copy.categories;
    draft.favorites = copy.favorites;
    draft.projects = copy.projects;
    draft.monthSettings = copy.monthSettings;
    draft.recentCategories = copy.recentCategories;
  }, { allowEmpty: true });
  if (result.ok) {
    pendingImport = null;
    closeModal('importPreviewModal');
    closeModal('settingsModal');
    showToast('Respaldo restaurado y verificado.');
  }
}

async function mergePendingImport() {
  if (!pendingImport) return;
  try {
    await createSnapshot('before:import-merge', state);
  } catch (error) {
    showToast('No se pudo crear la copia previa. La importación fue cancelada.');
    return;
  }
  const imported = pendingImport.data;
  const result = await applyMutation('backup:merge', (draft) => {
    const categoryNamesSet = new Set(draft.categories.map((category) => category.name.toLowerCase()));
    imported.categories.forEach((category) => {
      if (!categoryNamesSet.has(category.name.toLowerCase())) {
        draft.categories.push({ ...category, id: draft.categories.some((item) => item.id === category.id) ? uid() : category.id, order: draft.categories.length });
        categoryNamesSet.add(category.name.toLowerCase());
      }
    });

    const projectIds = new Set(draft.projects.map((project) => project.id));
    const projectNames = new Set(draft.projects.map((project) => project.name.toLowerCase()));
    imported.projects.filter((project) => project.id !== 'general').forEach((project) => {
      if (!projectIds.has(project.id) && !projectNames.has(project.name.toLowerCase())) {
        draft.projects.push({ ...project, active: false });
        projectIds.add(project.id);
        projectNames.add(project.name.toLowerCase());
      }
    });

    const expenseIds = new Set(draft.expenses.map((expense) => expense.id));
    imported.expenses.forEach((expense) => {
      if (!expenseIds.has(expense.id)) {
        draft.expenses.push({ ...expense, projectId: projectIds.has(expense.projectId) ? expense.projectId : 'general' });
        expenseIds.add(expense.id);
      }
    });

    const favoriteIds = new Set(draft.favorites.map((favorite) => favorite.id));
    const favoriteKeys = new Set(draft.favorites.map((favorite) => `${favorite.label.toLowerCase()}|${favorite.amount}|${favorite.category.toLowerCase()}`));
    imported.favorites.forEach((favorite) => {
      const key = `${favorite.label.toLowerCase()}|${favorite.amount}|${favorite.category.toLowerCase()}`;
      if (!favoriteIds.has(favorite.id) && !favoriteKeys.has(key)) {
        draft.favorites.push({ ...favorite });
        favoriteIds.add(favorite.id);
        favoriteKeys.add(key);
      }
    });

    Object.entries(imported.monthSettings).forEach(([key, config]) => {
      if (!draft.monthSettings[key]) draft.monthSettings[key] = { ...config };
    });
    draft.recentCategories = [...new Set([...draft.recentCategories, ...imported.recentCategories])].slice(0, 4);
  });
  if (result.ok) {
    pendingImport = null;
    closeModal('importPreviewModal');
    closeModal('settingsModal');
    showToast('Datos combinados sin duplicar identificadores.');
  }
}

function updateAutoDatePreview() {
  if (manualDate) return;
  const now = new Date();
  $('autoDatePreview').textContent = `Automática: ${now.toLocaleDateString('es-BO')} · ${now.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`;
}
function resetDateMode() {
  manualDate = false;
  $('manualDateFields').hidden = true;
  $('toggleDateBtn').textContent = 'Cambiar fecha';
  updateAutoDatePreview();
}

function openResetConfirmation() {
  $('resetWarningText').textContent = `Se reiniciarán ${activeExpenses().length} gastos activos, ${trashedExpenses().length} registros de papelera, presupuestos, categorías personalizadas, favoritos y proyectos. La activación del dispositivo se conservará.`;
  $('resetConfirmInput').value = '';
  openModal('resetModal');
}

async function confirmReset() {
  if ($('resetConfirmInput').value.trim().toUpperCase() !== 'BORRAR') {
    showToast('Escribe BORRAR para confirmar.');
    return;
  }
  try {
    await createSnapshot('before:full-reset', state);
  } catch (error) {
    showToast('No se pudo crear la copia previa. El borrado fue cancelado.');
    return;
  }
  const fresh = initialState();
  const result = await applyMutation('data:full-reset', (draft) => {
    draft.expenses = fresh.expenses;
    draft.categories = fresh.categories;
    draft.favorites = fresh.favorites;
    draft.projects = fresh.projects;
    draft.monthSettings = fresh.monthSettings;
    draft.recentCategories = fresh.recentCategories;
  }, { allowEmpty: true, skipSnapshot: true });
  if (result.ok) {
    closeModal('resetModal');
    closeModal('settingsModal');
    showToast('Datos financieros reiniciados. La copia previa permanece en recuperación interna.');
  }
}

function downloadDiagnostic() {
  const report = {
    appVersion: APP_VERSION,
    generatedAt: new Date().toISOString(),
    origin: location.origin,
    userAgent: navigator.userAgent,
    databaseName: DB_NAME,
    meta: appMeta ? {
      initialized: appMeta.initialized,
      schemaVersion: appMeta.schemaVersion,
      revision: appMeta.revision,
      updatedAt: appMeta.updatedAt,
      totalExpenseCount: appMeta.totalExpenseCount,
      activeExpenseCount: appMeta.activeExpenseCount,
      trashCount: appMeta.trashCount,
      migratedFromV4: appMeta.migratedFromV4
    } : null,
    persistentStorageGranted,
    storageEstimate,
    mirrorStatus,
    latestSnapshot: latestSnapshotMeta ? {
      createdAt: latestSnapshotMeta.createdAt,
      reason: latestSnapshotMeta.reason,
      revision: latestSnapshotMeta.revision,
      counts: latestSnapshotMeta.counts
    } : null,
    recoveryMessage: $('recoveryMessage').textContent
  };
  downloadBlob(JSON.stringify(report, null, 2), 'application/json', `diagnostico-control-presupuesto-${localDateKey()}.json`);
}

async function patchAppMeta(patch) {
  const tx = createTransaction(['meta'], 'readwrite');
  const store = tx.objectStore('meta');
  const row = await requestToPromise(store.get('appMeta'));
  const latest = row?.value || appMeta || {};
  const next = { ...latest, ...patch };
  store.put({ key: 'appMeta', value: next });
  await transactionDone(tx);
  appMeta = next;
  return next;
}

async function checkForUpdate() {
  showToast('Verificando datos antes de buscar actualización…');
  const valid = await verifyIntegrity(false);
  if (!valid) {
    showToast('Actualización cancelada: la integridad no está confirmada.');
    return;
  }
  try {
    await createSnapshot('before:app-update', state);
  } catch (error) {
    showToast('Actualización cancelada: no se pudo crear la copia previa.');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    showToast('La actualización automática no está disponible aquí.');
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    showToast('Servicio de actualización no registrado.');
    return;
  }
  try {
    await registration.update();
    if (registration.waiting) {
      if (confirm('Hay una actualización lista. Tus datos ya fueron verificados y respaldados internamente. ¿Aplicarla ahora?')) {
        applyingUpdate = true;
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } else {
      showToast('Ya tienes la versión disponible más reciente.');
    }
  } catch (error) {
    showToast(`No se pudo buscar la actualización: ${error.message}`);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
  });
  navigator.serviceWorker.register('./sw.js?v=5').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller && !applyingUpdate) {
          showStorageWarning('Hay una actualización disponible. Usa “Buscar actualización” para aplicarla después de verificar y respaldar tus datos.');
        }
      });
    });
  }).catch((error) => {
    showStorageWarning(`La aplicación funciona, pero el modo sin internet no pudo activarse: ${error.message}`);
  });
}

function setupBroadcastChannel() {
  if (!('BroadcastChannel' in window)) return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = async (event) => {
    if (event.data?.type !== 'revision') return;
    if (Number(event.data.revision) <= Number(state?.revision || 0)) return;
    if (isSaving) {
      setTimeout(() => reloadFromDatabase({ notify: true }).catch(console.error), 500);
      return;
    }
    try {
      await reloadFromDatabase({ notify: true });
    } catch (error) {
      showStorageWarning(`No se pudo actualizar desde otra ventana: ${error.message}`);
    }
  };
}

function bindEvents() {
  $('activateBtn').onclick = activateApplication;
  $('activationCodeInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') activateApplication();
  });

  $('expenseForm').onsubmit = async (event) => {
    event.preventDefault();
    const button = $('saveExpenseBtn');
    button.disabled = true;
    const ok = await addExpense(
      $('amountInput').value,
      $('categoryInput').value,
      $('detailInput').value,
      $('projectInput').value,
      manualDate ? $('expenseDateInput').value : null,
      manualDate ? $('expenseTimeInput').value : null
    );
    button.disabled = false;
    if (ok) {
      $('amountInput').value = '';
      $('detailInput').value = '';
      resetDateMode();
      $('amountInput').focus();
    }
  };

  $('toggleDateBtn').onclick = () => {
    manualDate = !manualDate;
    $('manualDateFields').hidden = !manualDate;
    $('toggleDateBtn').textContent = manualDate ? 'Usar automática' : 'Cambiar fecha';
    if (manualDate) {
      $('expenseDateInput').value = localDateKey();
      $('expenseTimeInput').value = localTimeKey();
      $('autoDatePreview').textContent = 'Selecciona la fecha y hora del gasto.';
    } else updateAutoDatePreview();
  };

  $('categoryPickerBtn').onclick = () => { renderCategoryPicker(); openModal('categoryPickerModal'); };
  $('periodFilter').onchange = renderSummary;
  $('searchInput').oninput = renderHistory;
  $('historyMonthFilter').onchange = renderHistory;
  $('exportBtn').onclick = exportExcel;

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      $(`${tab.dataset.tab}Tab`).classList.add('active');
    };
  });

  $('settingsBtn').onclick = async () => {
    $('settingsMonthInput').value = monthKey();
    loadSettingsMonth();
    if (navigator.storage?.estimate) {
      try { storageEstimate = await navigator.storage.estimate(); } catch (_) { /* no-op */ }
    }
    latestSnapshotMeta = await getLatestSnapshot();
    await readBestMirror();
    renderDiagnostics();
    openModal('settingsModal');
  };
  $('settingsMonthInput').onchange = loadSettingsMonth;
  $('saveSettingsBtn').onclick = async () => {
    const key = $('settingsMonthInput').value || monthKey();
    const budget = parseAmount($('monthlyBudgetInput').value);
    const savingsGoal = parseAmount($('savingsGoalInput').value);
    const result = await applyMutation('budget:save', (draft) => {
      draft.monthSettings[key] = { budget, savingsGoal };
    });
    if (result.ok) {
      closeModal('settingsModal');
      showToast(`Presupuesto guardado para ${monthLabel(key)}.`);
    }
  };

  $('openCategoriesBtn').onclick = () => { closeModal('settingsModal'); openModal('categoriesModal'); };
  $('addCategoryBtn').onclick = async () => {
    const name = $('newCategoryInput').value.trim();
    if (!name) return;
    if (state.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      showToast('Esa categoría ya existe.');
      return;
    }
    const result = await applyMutation('category:add', (draft) => {
      draft.categories.push(categoryObject(name, draft.categories.length));
    });
    if (result.ok) {
      $('newCategoryInput').value = '';
      showToast('Categoría agregada.');
    }
  };

  $('backupBtn').onclick = exportBackup;
  $('importBtn').onclick = () => $('importFileInput').click();
  $('importFileInput').onchange = async (event) => {
    if (event.target.files[0]) await importBackupFile(event.target.files[0]);
    event.target.value = '';
  };
  $('mergeImportBtn').onclick = mergePendingImport;
  $('replaceImportBtn').onclick = replaceWithPendingImport;
  $('verifyIntegrityBtn').onclick = () => verifyIntegrity(true);
  $('openTrashBtn').onclick = () => { closeModal('settingsModal'); renderTrash(); openModal('trashModal'); };
  $('deactivateBtn').onclick = deactivateApplication;
  $('resetBtn').onclick = openResetConfirmation;
  $('confirmResetBtn').onclick = confirmReset;

  $('addFavoriteBtn').onclick = () => openFavoriteEditor();
  $('confirmFavoriteBtn').onclick = async () => {
    const favorite = state.favorites.find((item) => item.id === selectedFavoriteId);
    if (favorite && await addExpense($('favoriteConfirmAmount').value, favorite.category, favorite.label, $('favoriteConfirmProject').value)) {
      closeModal('favoriteConfirmModal');
    }
  };
  $('saveFavoriteBtn').onclick = async () => {
    const label = $('favoriteLabelInput').value.trim();
    const amount = parseAmount($('favoriteAmountInput').value);
    const category = $('favoriteCategoryInput').value;
    if (!label || amount <= 0) {
      showToast('Completa nombre y monto válido.');
      return;
    }
    const result = await applyMutation(editingFavoriteId ? 'favorite:edit' : 'favorite:add', (draft) => {
      if (editingFavoriteId) {
        const favorite = draft.favorites.find((item) => item.id === editingFavoriteId);
        if (!favorite) return false;
        Object.assign(favorite, { label, amount, category });
      } else {
        draft.favorites.push({ id: uid(), label, amount, category });
      }
    });
    if (result.ok) {
      closeModal('favoriteEditorModal');
      showToast('Favorito guardado.');
    }
  };
  $('deleteFavoriteBtn').onclick = async () => {
    if (!editingFavoriteId || !confirm('¿Borrar este favorito?')) return;
    const result = await applyMutation('favorite:delete', (draft) => {
      draft.favorites = draft.favorites.filter((favorite) => favorite.id !== editingFavoriteId);
    });
    if (result.ok) {
      closeModal('favoriteEditorModal');
      showToast('Favorito borrado.');
    }
  };

  $('saveExpenseEditBtn').onclick = async () => {
    const amount = parseAmount($('editExpenseAmount').value);
    if (amount <= 0) {
      showToast('Monto inválido.');
      return;
    }
    const category = $('editExpenseCategory').value;
    const result = await applyMutation('expense:edit', (draft) => {
      const expense = draft.expenses.find((item) => item.id === editingExpenseId && !item.deletedAt);
      if (!expense) return false;
      expense.amount = amount;
      expense.category = category;
      expense.detail = $('editExpenseDetail').value.trim();
      expense.projectId = $('editExpenseProject').value;
      expense.date = $('editExpenseDate').value;
      expense.createdAt = localDateTime(expense.date, $('editExpenseTime').value || '12:00');
      registerRecentCategory(draft, category);
    });
    if (result.ok) {
      closeModal('expenseEditorModal');
      showToast('Gasto actualizado y verificado.');
    }
  };

  $('projectForm').onsubmit = async (event) => {
    event.preventDefault();
    const name = $('projectNameInput').value.trim();
    if (!name) return;
    const budget = parseAmount($('projectBudgetInput').value);
    const id = uid();
    const result = await applyMutation('project:add', (draft) => {
      draft.projects.forEach((project) => { project.active = false; });
      draft.projects.push({ id, name, budget, active: true });
    });
    if (result.ok) {
      $('projectNameInput').value = '';
      $('projectBudgetInput').value = '';
      showToast(`Proyecto activo: ${name}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  $('finishProjectBtn').onclick = () => activateProject('general');
  $('saveProjectEditBtn').onclick = async () => {
    const name = $('editProjectName').value.trim();
    if (!name) return;
    const budget = parseAmount($('editProjectBudget').value);
    const result = await applyMutation('project:edit', (draft) => {
      const project = draft.projects.find((item) => item.id === editingProjectId);
      if (!project || project.id === 'general') return false;
      project.name = name;
      project.budget = budget;
    });
    if (result.ok) {
      closeModal('projectEditorModal');
      showToast('Proyecto actualizado.');
    }
  };

  $('checkUpdateBtn').onclick = checkForUpdate;

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.onclick = () => closeModal(button.dataset.close);
  });
  modalIds.forEach((id) => {
    $(id).onclick = (event) => { if (event.target === $(id)) closeModal(id); };
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = [...modalIds].reverse().find((id) => !$(id).hidden);
    if (open) closeModal(open);
  });

  $('retryRecoveryBtn').onclick = () => location.reload();
  $('recoveryImportBtn').onclick = () => $('recoveryImportFile').click();
  $('recoveryImportFile').onchange = async (event) => {
    if (event.target.files[0]) await importBackupFile(event.target.files[0], { fromRecovery: true });
    event.target.value = '';
  };
  $('downloadDiagnosticBtn').onclick = downloadDiagnostic;

  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    showStorageWarning(`Se detectó un error no controlado: ${event.reason?.message || event.reason}`);
  });
}

async function bootstrap() {
  bindEvents();
  setupBroadcastChannel();
  try {
    await initializeDataLayer();
    registerServiceWorker();
    setInterval(updateAutoDatePreview, 30000);
    if (activationMeta?.active) showUnlockedApplication(); else showLockedApplication();
  } catch (error) {
    console.error(error);
    $('bootOverlay').hidden = true;
    $('activationOverlay').hidden = true;
    $('appRoot').hidden = true;
    $('recoveryOverlay').hidden = false;
    $('recoveryMessage').textContent = error instanceof RecoveryRequiredError
      ? error.message
      : `No se pudo iniciar el almacenamiento protegido: ${error.message}`;
  }
}

bootstrap();
