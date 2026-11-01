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
  async function api(path, body, prefer = 'return=representation') {
    const s = await auth();
    const r = await fetch(`${BASE}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, Prefer: prefer, ...json },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      let m = `Erreur ${r.status}`;
      try { const j = await r.json(); m = j.message || j.error_description || m; } catch (e) { }
      throw new Error(m);
    }
    const txt = r.status === 204 ? '' : await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  // ADN reçu d'un autre joueur : on vérifie la forme avant de l'utiliser
  function validDna(d) {
    return d && Array.isArray(d.c) && d.c.length === LOCI.length && d.c.every(x => typeof x === 'string' && x.length === 2)
      && Array.isArray(d.p) && d.p.every(x => typeof x === 'number' && isFinite(x));
  }

  // Pseudo : réservé côté serveur (unique), pour recevoir des cadeaux et s'inscrire au concours
  async function register(n) {
    const s = await auth();
    try {
      await api('profiles?on_conflict=id', { id: s.uid, name: n, updated: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
    } catch (e) {
      if (/duplicate|unique|23505/i.test(e.message)) throw new Error(`Le pseudo « ${n} » est déjà pris.`);
      throw e;
    }
    sess.name = n; sess.reg = n; save();
  }
  // Trophées du concours (décors exclusifs) : gardés sur l'appareil, utilisables dans toutes les parties
  const TLS = 'shrimpevo.trophies';
  let trophies = {};
  try { trophies = JSON.parse(localStorage.getItem(TLS) || '{}') || {}; } catch (e) { }
  function addTrophy(k) { trophies[k] = (trophies[k] || 0) + 1; try { localStorage.setItem(TLS, JSON.stringify(trophies)); } catch (e) { } }
  const week = () => {
    // semaine ISO (même calcul que le serveur, à quelques heures près selon le fuseau)
    const d = new Date(), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), n: Math.ceil(((t - y0) / 864e5 + 1) / 7) };
  };

  return {
    enabled,
    get name() { return sess.name || null; },
    get registered() { return !!sess.reg && sess.reg === sess.name; },
    setName(n) { sess.name = n; save(); },
    register, week,
    get trophies() { return trophies; }, addTrophy,
    // bacs à visiter
    showcases: () => api('showcases?select=owner,slot,owner_name,name,info,updated&order=updated.desc&limit=40'),
    showcase: (owner, slot = 0) => api(`showcases?select=owner,slot,owner_name,name,info,data,updated&owner=eq.${encodeURIComponent(owner)}&slot=eq.${+slot}`).then(r => r[0] || null),
    share: row => api('showcases?on_conflict=owner,slot', Object.assign({ owner: sess.uid, owner_name: sess.name, updated: new Date().toISOString() }, row), 'resolution=merge-duplicates,return=minimal'),
    // cadeaux
    sendGift: (to, kind, payload, message) => api('rpc/send_gift', { p_to: to, p_kind: kind, p_payload: payload, p_message: message || null }),
    claimGifts: () => api('rpc/claim_gifts', {}),
    // concours
    contestEnter: (genus, shrimp, title) => api('rpc/contest_enter', { p_genus: genus, p_shrimp: shrimp, p_title: title || null }),
    contestVote: id => api('rpc/contest_vote', { p_entry: id }),
    contestBoard: wk => api('rpc/contest_board', { p_week: wk || null }),
    contestClaim: () => api('rpc/contest_claim', {}),
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
