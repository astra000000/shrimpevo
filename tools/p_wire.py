def patch(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a[:80]); s=s.replace(a,b,1)
    open(p,'w',encoding='utf-8').write(s)
patch('index.html',[('<script src="js/online.js"></script>','<script src="js/online.js"></script>\n<script src="js/social.js"></script>')])
patch('js/main.js',[
("""    requestAnimationFrame(loop);
    if (!running || !W) return;
    const dtR = Math.min(.25, (now - last) / 1000);
    last = now;""","""    requestAnimationFrame(loop);
    const dtR = Math.min(.25, (now - last) / 1000);
    last = now;
    // visite d'un bac depuis l'écran titre (lien partagé) : on affiche sans partie en cours
    if ((!running || !W) && UI.visiting) { Render.frame(UI.visiting, dtR); return; }
    if (!running || !W) return;"""),
("""    Guide.firstTime();""","""    if (new URLSearchParams(location.search).get('visit')) Social.fromUrl(); else Guide.firstTime();"""),
("""    UI.refreshAll(false);
""","""    UI.refreshAll(false);
    Social.poll();
"""),
])
patch('js/ui.js',[
("""    $('btnBook').onclick = () => bookModal();""","""    $('btnBook').onclick = () => bookModal();
    $('btnOnline').onclick = () => Social.open();"""),
("""        <button id="toNet">${net.has(sh.id) ? '✓ Dans l\'épuisette' : '🥅 Épuisette'}</button><button id="closeSel">✕</button></div>""","""        <button id="toNet">${net.has(sh.id) ? '✓ Dans l\'épuisette' : '🥅 Épuisette'}</button>${Online.enabled() ? '<button id="toContest" title="Inscrire au concours de la semaine">🏆</button>' : ''}<button id="closeSel">✕</button></div>"""),
])
print('ok')
