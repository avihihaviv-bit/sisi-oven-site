/* A small REST client for Supabase. No library and no build step, which is how
   the rest of this project works. Supabase speaks plain HTTP: PostgREST for the
   tables and GoTrue for sign-in, so a hundred lines of fetch is the whole thing.

   Nothing here enforces permission. The database does that, through the
   policies in supabase/schema.sql. This file only carries the session token. */
(() => {
  'use strict';
  const cfg = window.SISI_DB || {};
  const configured = !!(cfg.url && cfg.anonKey);
  const SESSION_KEY = 'sisi-session';

  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e) { session = null; }

  const saveSession = s => {
    session = s;
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private mode: the session simply does not survive a reload */ }
  };

  const headers = (extra) => Object.assign({
    'apikey': cfg.anonKey,
    'Authorization': 'Bearer ' + ((session && session.access_token) || cfg.anonKey),
    'Content-Type': 'application/json'
  }, extra || {});

  async function request(path, init) {
    if (!configured) throw new Error('db-not-configured');
    const res = await fetch(cfg.url + path, Object.assign({ headers: headers(init && init.headers) }, init));
    if (res.status === 204) return null;
    const body = await res.text();
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) { data = body; }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error_description || data.error)) || ('HTTP ' + res.status));
      err.status = res.status;
      err.details = data && data.details;
      throw err;
    }
    return data;
  }

  /* ---------- auth ---------- */
  async function signIn(email, password) {
    const res = await fetch(cfg.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // the message is deliberately the same for a wrong address and a wrong
      // password, so the form cannot be used to discover which addresses exist
      const e = new Error(res.status === 400 ? 'bad-credentials' : (data.msg || data.error_description || 'sign-in-failed'));
      e.status = res.status;
      throw e;
    }
    saveSession(data);
    return data;
  }

  async function signOut() {
    if (session) {
      try {
        await fetch(cfg.url + '/auth/v1/logout', { method: 'POST', headers: headers() });
      } catch (e) { /* the local session goes either way */ }
    }
    saveSession(null);
  }

  /* who the database says we are — never trusted from the client */
  async function whoAmI() {
    if (!session) return null;
    const rows = await request('/rest/v1/staff?select=id,role,display_name', { method: 'GET' });
    return (rows && rows[0]) || null;
  }

  /* ---------- tables ---------- */
  const qs = params => Object.entries(params || {})
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

  const api = {
    configured,
    get session() { return session; },
    signIn, signOut, whoAmI,

    listProducts: (opts) => request('/rest/v1/products?' + qs(Object.assign({
      select: '*', order: 'sort.asc'
    }, opts))),

    listCategories: () => request('/rest/v1/categories?select=*&order=sort.asc'),

    getSettings: async () => {
      const rows = await request('/rest/v1/settings?select=*&id=eq.1');
      return (rows && rows[0]) || null;
    },

    createProduct: (row) => request('/rest/v1/products', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
    }),

    updateProduct: (id, patch) => request('/rest/v1/products?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
    }),

    deleteProduct: (id) => request('/rest/v1/products?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }),

    createCategory: (row) => request('/rest/v1/categories', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
    }),

    updateCategory: (id, patch) => request('/rest/v1/categories?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
    }),

    deleteCategory: (id) => request('/rest/v1/categories?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }),

    updateSettings: (patch) => request('/rest/v1/settings?id=eq.1', {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
    })
  };

  window.SisiDB = api;
})();
