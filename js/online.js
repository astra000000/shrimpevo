'use strict';
// Marché partagé : client Supabase minimal (fetch, sans bibliothèque).
// Connexion anonyme : un identifiant par appareil, gardé dans le navigateur avec le pseudo.

const Online = (() => {
  const C = window.SHRIMPEVO_CONFIG || {};
  const BASE = (C.supabaseUrl || '').replace(/\/+$/, ''), KEY = C.supabaseAnonKey || '';
  const LS = 'shrimpevo.online';
  const enabled = () => !!(BASE && KEY);
  let sess = (() => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } })() || {};
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(sess)); } catch (e) { } };
  const take = j => ({
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), uid: j.user && j.user.id,
  });
  const json = { 'Content-Type': 'application/json' };

  async function auth() {
    if (!enabled()) throw new Error('Marché en ligne non configuré (js/config.js).');
    if (sess.access_token && sess.expires_at * 1000 > Date.now() + 60000) return sess;
    if (sess.refresh_token) {
      const r = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, ...json }, body: JSON.stringify({ refresh_token: sess.refresh_token }) });
      if (r.ok) { Object.assign(sess, take(await r.json())); save(); return sess; }
    }
    const r = await fetch(`${BASE}/auth/v1/signup`, { method: 'POST', headers: { apikey: KEY, ...json }, body: JSON.stringify({ data: {} }) });
    if (!r.ok) throw new Error('Connexion au marché impossible (connexion anonyme activée dans Supabase ?).');
    Object.assign(sess, take(await r.json()));
    save();
    return sess;
  }
  async function api(path, body) {
    const s = await auth();
    const r = await fetch(`${BASE}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, Prefer: 'return=representation', ...json },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      let m = `Erreur ${r.status}`;
      try { const j = await r.json(); m = j.message || j.error_description || m; } catch (e) { }
      throw new Error(m);
    }
    return r.status === 204 ? null : r.json();
  }

  // ADN reçu d'un autre joueur : on vérifie la forme avant de l'utiliser
  function validDna(d) {
    return d && Array.isArray(d.c) && d.c.length === LOCI.length && d.c.every(x => typeof x === 'string' && x.length === 2)
      && Array.isArray(d.p) && d.p.every(x => typeof x === 'number' && isFinite(x));
  }

  return {
    enabled,
    get name() { return sess.name || null; },
    setName(n) { sess.name = n; save(); },
    get me() { return sess.uid || null; },
    auth,
    listings: () => api('listings?select=id,seller,seller_name,genus,entry,stock,price,note,sold,created_at&active=eq.true&order=created_at.desc&limit=60'),
    publish: row => api('listings', Object.assign({ seller_name: sess.name }, row)),
    buy: (id, n) => api('rpc/buy_listing', { p_id: id, p_n: n, p_buyer_name: sess.name }),
    unlist: id => api('rpc/unlist_listing', { p_id: id }),
    collect: () => api('rpc/collect_sales', {}),
    validDna,
  };
})();
