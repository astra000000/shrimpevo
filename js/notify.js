'use strict';
// Notifications du navigateur : seulement quand le jeu est en arrière-plan (onglet caché ou appli réduite).
// Le jeu tourne dans le navigateur : une fois l'onglet fermé, plus rien ne peut notifier (pas de serveur).

const Notify = (() => {
  const LS = 'shrimpevo.notify';
  let on = false, reg = null;
  try { on = localStorage.getItem(LS) === '1'; } catch (e) { }
  const supported = () => 'Notification' in window;
  // un service worker est nécessaire pour notifier sur Android (et sur iPhone, appli installée)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(r => { reg = r; }).catch(() => { });
  }
  async function enable() {
    if (!supported()) return 'Ton navigateur ne gère pas les notifications.';
    const p = await Notification.requestPermission();
    if (p !== 'granted') return 'Notifications refusées par le navigateur.';
    on = true;
    try { localStorage.setItem(LS, '1'); } catch (e) { }
    send('ShrimpEvo', 'Notifications activées 🦐', 'test', true);
    return null;
  }
  function disable() { on = false; try { localStorage.setItem(LS, '0'); } catch (e) { } }
  const active = () => on && supported() && Notification.permission === 'granted';
  // anti-spam : une notification par sujet toutes les 10 minutes au plus
  const lastTag = {};
  function send(title, body, tag, force) {
    if (!active() || (!force && !document.hidden)) return;
    if (!force && lastTag[tag] && Date.now() - lastTag[tag] < 600000) return;
    lastTag[tag] = Date.now();
    const opt = { body, tag, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png' };
    try {
      if (reg && reg.showNotification) reg.showNotification(title, opt);
      else new Notification(title, opt);
    } catch (e) { }
  }
  // Tri des messages du jeu : on ne notifie que ce qui compte
  function fromLog(msg, kind) {
    if (kind === 'bad') send('⚠️ ShrimpEvo', msg, 'alarm');
    else if (kind === 'mut') send('✨ ShrimpEvo', msg, 'mut');
    else if (/libéré|grainée/.test(msg)) send('🐣 ShrimpEvo', msg, 'birth');
    else if (/Vendu|vente/i.test(msg)) send('💰 ShrimpEvo', msg, 'sale');
    else if (/colis/i.test(msg)) send('📦 ShrimpEvo', msg, 'bag');
  }
  return { enable, disable, send, fromLog, get on() { return active(); }, supported };
})();
