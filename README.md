'use strict';
const crypto = require('crypto');

// ----------------------------------------------------------------------------
// Backend compartido en memoria: simula las tablas de Postgres/Supabase.
// Varios "devices" (clientes) pueden apuntar al mismo backend para simular
// que comparten el mismo proyecto real de Supabase.
// ----------------------------------------------------------------------------
function createFakeBackend() {
  return {
    networkUp: true,
    tables: {
      products: new Map(),
      sales: new Map(),
      purchase_orders: new Map(),
      messages: new Map(),
      profiles: new Map(),
      representative_stock: new Map(),
      representative_stock_movements: new Map()
    },
    authUsersByEmail: new Map(), // email -> {id, email, passwordHash}
    requireEmailConfirmation: false,
    poisonIds: new Set(), // ids de fila que el mock rechazará siempre (simula un error real del servidor, no de red)
    // log de llamadas, útil para que las pruebas verifiquen cuántas veces
    // se intentó algo (ej.: cuántos intentos de red hubo).
    callLog: []
  };
}

function networkErrorIfDown(backend) {
  if (!backend.networkUp) {
    const e = new Error('NetworkError: simulated offline (fetch failed)');
    e.name = 'NetworkError';
    throw e;
  }
}

function hashPw(pw) { return crypto.createHash('sha256').update(String(pw)).digest('hex'); }

// ----------------------------------------------------------------------------
// RPC: réplica en JS de la función SQL adjust_representative_stock de
// SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql. Debe reflejar EXACTAMENTE
// la misma lógica (idempotencia por movementId, suma atómica del delta,
// identidad tomada de auth.uid(), no del parámetro) para que las pruebas
// sobre este mock digan algo real sobre el SQL real.
// ----------------------------------------------------------------------------
function rpcAdjustRepresentativeStock(backend, callerUid, params) {
  backend.callLog.push({ rpc: 'adjust_representative_stock', callerUid, params });
  if (!callerUid) return { data: null, error: { message: 'No autenticado: se necesita una sesión válida de Supabase para ajustar stock.' } };

  const movements = backend.tables.representative_stock_movements;
  const existing = movements.get(params.p_movement_id);
  if (existing) return { data: existing.resulting_stock, error: null };

  const stockKey = callerUid + '::' + params.p_product_id;
  const row = backend.tables.representative_stock.get(stockKey) || {
    representative_user_id: callerUid,
    product_id: params.p_product_id,
    stock: 0
  };
  row.stock = Math.max(0, (Number(row.stock) || 0) + Number(params.p_delta || 0));
  row.updated_at = new Date().toISOString();
  backend.tables.representative_stock.set(stockKey, row);

  movements.set(params.p_movement_id, {
    id: params.p_movement_id,
    representative_user_id: callerUid,
    product_id: params.p_product_id,
    delta: params.p_delta,
    resulting_stock: row.stock
  });

  return { data: row.stock, error: null };
}

// Tablas donde se simula RLS "cada uno ve/escribe solo lo suyo" según
// SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql.
const RLS_OWN_ROW_TABLES = {
  representative_stock: 'representative_user_id',
  representative_stock_movements: 'representative_user_id'
};

class FakeQueryBuilder {
  constructor(backend, table, getCallerUid) {
    this.backend = backend;
    this.table = table;
    this.getCallerUid = getCallerUid;
    this._op = 'select';
    this._filters = [];
    this._payload = null;
    this._opts = {};
    this._single = false;
    this._order = null;
    this._limit = null;
  }
  select(cols, opts) { this._countMode = !!(opts && opts.count); this._head = !!(opts && opts.head); return this; }
  eq(col, val) { this._filters.push(['eq', col, val]); return this; }
  neq(col, val) { this._filters.push(['neq', col, val]); return this; }
  gt(col, val) { this._filters.push(['gt', col, val]); return this; }
  order(col, opts) { this._order = { col, ascending: !opts || opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  upsert(rows, opts) { this._op = 'upsert'; this._payload = rows; this._opts = opts || {}; return this; }
  update(patch) { this._op = 'update'; this._payload = patch; return this; }

  then(resolve, reject) { this._execute().then(resolve, reject); }
  catch(fn) { return this._execute().catch(fn); }

  _rlsAllows(row) {
    const rlsCol = RLS_OWN_ROW_TABLES[this.table];
    if (!rlsCol) return true; // tabla sin RLS simulada (uso interno, como el resto del proyecto)
    const uid = this.getCallerUid();
    return !!uid && row[rlsCol] === uid;
  }

  async _execute() {
    networkErrorIfDown(this.backend);
    this.backend.callLog.push({ table: this.table, op: this._op, filters: this._filters });
    const table = this.backend.tables[this.table];
    if (!table) return { data: null, error: { message: `Tabla no existe en el mock: ${this.table}` } };

    if (this._op === 'select') {
      let rows = [...table.values()].filter(r => this._rlsAllows(r));
      rows = this._applyFilters(rows);
      if (this._order) {
        rows.sort((a, b) => {
          const av = a[this._order.col], bv = b[this._order.col];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return this._order.ascending ? cmp : -cmp;
        });
      }
      if (this._limit != null) rows = rows.slice(0, this._limit);
      if (this._countMode) {
        return { data: this._head ? null : rows, error: null, count: rows.length };
      }
      if (this._single) {
        if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: rows[0], error: null };
      }
      return { data: rows, error: null };
    }

    if (this._op === 'upsert') {
      const rowsIn = Array.isArray(this._payload) ? this._payload : [this._payload];
      const conflictCols = (this._opts.onConflict || 'id').split(',');
      const written = [];
      for (const row of rowsIn) {
        if (row && this.backend.poisonIds.has(row.id)) {
          return { data: null, error: { message: `Error simulado del servidor para la fila ${row.id} (ej.: violación de un check constraint)` } };
        }
        if (!this._rlsAllows(row)) {
          return { data: null, error: { message: `RLS: fila bloqueada en ${this.table} (no coincide con auth.uid())` } };
        }
        const key = conflictCols.map(c => row[c]).join('::');
        const merged = Object.assign({}, table.get(key), row);
        table.set(key, merged);
        written.push(merged);
      }
      return { data: written, error: null };
    }

    if (this._op === 'update') {
      let rows = [...table.values()].filter(r => this._rlsAllows(r));
      rows = this._applyFilters(rows);
      for (const row of rows) Object.assign(row, this._payload);
      return { data: rows, error: null };
    }

    return { data: null, error: { message: 'Operación no soportada en el mock: ' + this._op } };
  }

  _applyFilters(rows) {
    return rows.filter(r => this._filters.every(([op, col, val]) => {
      if (op === 'eq') return r[col] === val;
      if (op === 'neq') return r[col] !== val;
      if (op === 'gt') return r[col] > val;
      return true;
    }));
  }
}

function makeFakeClient(backend) {
  let session = null; // sesión propia de ESTE cliente/dispositivo

  const client = {
    from(table) { return new FakeQueryBuilder(backend, table, () => session && session.user && session.user.id); },
    async rpc(name, params) {
      networkErrorIfDown(backend);
      backend.callLog.push({ rpc: name, params });
      if (name === 'adjust_representative_stock') {
        const uid = session && session.user && session.user.id;
        return rpcAdjustRepresentativeStock(backend, uid, params);
      }
      return { data: null, error: { message: `RPC no soportada en el mock: ${name}` } };
    },
    auth: {
      async signInWithPassword({ email, password }) {
        networkErrorIfDown(backend);
        backend.callLog.push({ auth: 'signInWithPassword', email });
        const user = backend.authUsersByEmail.get(email);
        if (!user || user.passwordHash !== hashPw(password)) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        session = { user: { id: user.id, email }, access_token: 'fake-token-' + user.id };
        return { data: { user: session.user, session }, error: null };
      },
      async signUp({ email, password }) {
        networkErrorIfDown(backend);
        backend.callLog.push({ auth: 'signUp', email });
        if (backend.authUsersByEmail.has(email)) {
          return { data: { user: null, session: null }, error: { message: 'User already registered' } };
        }
        const user = { id: crypto.randomUUID(), email, passwordHash: hashPw(password) };
        backend.authUsersByEmail.set(email, user);
        if (backend.requireEmailConfirmation) {
          // Cuenta creada pero SIN sesión activa, igual que en Supabase real
          // cuando "Confirm email" está activado para el proyecto.
          return { data: { user: { id: user.id, email }, session: null }, error: null };
        }
        session = { user: { id: user.id, email }, access_token: 'fake-token-' + user.id };
        return { data: { user: session.user, session }, error: null };
      },
      async getSession() {
        return { data: { session } };
      },
      async resetPasswordForEmail(email) {
        networkErrorIfDown(backend);
        backend.callLog.push({ auth: 'resetPasswordForEmail', email });
        if (!backend.authUsersByEmail.has(email)) {
          // Supabase real, por seguridad, normalmente NO revela si el correo
          // existe o no — responde "ok" igual. Se imita ese comportamiento.
          return { data: {}, error: null };
        }
        backend.recoveryEmailsSent = backend.recoveryEmailsSent || [];
        backend.recoveryEmailsSent.push(email);
        return { data: {}, error: null };
      },
      async signOut() {
        session = null;
        return { error: null };
      }
    }
  };
  return client;
}

function makeFakeSupabaseSdk(backend) {
  return { createClient: () => makeFakeClient(backend) };
}

module.exports = { createFakeBackend, makeFakeSupabaseSdk };
