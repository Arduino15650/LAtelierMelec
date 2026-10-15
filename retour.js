// Bouton « Retour » flottant, discret, commun aux espaces enseignant et élève.
//
// Règles :
//  - il ramène à la tâche ou à la page précédente, jamais à l'accueil (du site ou de l'espace) ;
//  - il n'apparaît que lorsqu'il existe une étape précédente ;
//  - un clic sur le menu, sur le titre ou sur une rubrique efface l'historique (le bouton disparaît) ;
//  - revenir soi-même à la page d'origine (lien « Annuler », « ← Retour à… ») consomme l'étape.
// Les autres modules alimentent l'historique avec window.MelecRetour (push / arrived / reset).
(function () {
  'use strict';
  if (window.MelecRetour) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const teacher = page.startsWith('enseignant'), student = page.startsWith('eleve');

  const stack = [];
  let restoring = false, button = null;
  const sync = () => {
    if (!button) return;
    button.hidden = !stack.length || document.body.classList.contains('cloud-locked');
  };
  const api = {
    // origin : identifiant de la page quittée ; undo : fonction qui y ramène.
    push(origin, undo) { if (restoring) return; stack.push({ origin, undo }); if (stack.length > 40) stack.shift(); sync(); },
    // La page d'origine de la dernière étape est atteinte autrement : l'étape est consommée.
    arrived(key) { if (restoring) return true; const top = stack[stack.length - 1]; if (top && top.origin === key) { stack.pop(); sync(); return true; } return false; },
    reset() { stack.length = 0; sync(); },
    back() {
      const step = stack.pop(); sync();
      if (!step) return;
      restoring = true;
      try { step.undo(); } finally { restoring = false; }
      window.scrollTo({ top: 0 });
    },
    get size() { return stack.length; }
  };
  window.MelecRetour = api;
  if (!teacher && !student) return; // Accueil du site : aucune page précédente, pas de bouton.

  const style = document.createElement('style');
  style.textContent = `
#melecRetour{position:fixed;z-index:880;left:max(12px,env(safe-area-inset-left));bottom:max(30px,calc(env(safe-area-inset-bottom) + 18px));
  display:grid;place-items:center;width:38px;height:38px;padding:0;margin:0;border-radius:50%;
  border:1px solid rgba(140,200,255,.38);background:rgba(6,20,40,.55);color:#d6ebff;
  font:600 18px/1 system-ui,sans-serif;cursor:pointer;opacity:.55;box-shadow:0 2px 10px rgba(0,0,0,.25);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:opacity .2s,transform .2s,background .2s;-webkit-tap-highlight-color:transparent}
@media (hover:hover){#melecRetour:hover{opacity:1;background:rgba(10,32,62,.9);border-color:#ff8a1e}}
#melecRetour:focus-visible{opacity:1;background:rgba(10,32,62,.9);border-color:#ff8a1e;outline:2px solid #ff8a1e;outline-offset:2px}
#melecRetour:active{transform:scale(.92)}
#melecRetour[hidden]{display:none!important}
@media (hover:none){#melecRetour{opacity:.7}}
@media (prefers-reduced-motion:reduce){#melecRetour{transition:none}}
@media print{#melecRetour{display:none!important}}
/* Un seul bouton retour : l'ancien bouton de la barre haute est remplacé par celui-ci. */
html body .topbar #appBackButton,html body #appBackButton{display:none!important}`;
  document.head.append(style);

  button = document.createElement('button');
  button.id = 'melecRetour';
  button.type = 'button';
  button.textContent = '←';
  button.title = 'Revenir à l’étape précédente';
  button.setAttribute('aria-label', 'Revenir à l’étape précédente');
  button.addEventListener('click', () => api.back());
  document.body.append(button);
  // Connexion ou déconnexion : l'historique repart de zéro.
  let locked = document.body.classList.contains('cloud-locked');
  new MutationObserver(() => {
    const now = document.body.classList.contains('cloud-locked');
    if (now !== locked) { locked = now; stack.length = 0; }
    sync();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();

  if (teacher) {
    // Menu principal, menu mobile, titre du site, capsules de l'accueil, rubriques de SUIVI&PFMP : l'historique repart de zéro.
    // Le bouton ne ramène jamais à l'accueil : aucune étape n'a l'accueil pour origine.
    let menuClick = false;
    document.addEventListener('click', event => {
      if (!event.target.closest?.('button.nav, .header-nav .nav, .topbar .brand, #mobileMenuToggle, .home-access-card')) return;
      menuClick = true; api.reset();
      setTimeout(() => { menuClick = false; });
    }, true);
    window.addEventListener('melec-reset-selection', () => api.reset());

    let editorOpen = false;
    const current = () => editorOpen ? 'editor' : (location.hash.slice(1) || 'home');
    const baseShow = window.show;
    if (typeof baseShow === 'function') {
      window.show = function (name) {
        const from = current();
        if (!restoring && !menuClick && name !== from && !api.arrived(name) && from !== 'editor' && from !== 'home') api.push(from, () => window.show(from));
        editorOpen = false;
        return baseShow.apply(this, arguments);
      };
    }
    const baseRaw = window.showRaw;
    if (typeof baseRaw === 'function') {
      window.showRaw = function (name) {
        if (name === 'editor' && !editorOpen) {
          const from = current();
          if (!restoring && !menuClick && from !== 'home') api.push(from, () => window.show(from));
          editorOpen = true;
        }
        return baseRaw.apply(this, arguments);
      };
    }
  }

  if (student) {
    // Inscription ou contact ouverts depuis la connexion : retour à la connexion.
    const login = document.getElementById('studentLoginTab');
    for (const id of ['studentSignupTab', 'studentContactTab']) {
      document.getElementById(id)?.addEventListener('click', () => {
        if (!api.size) api.push('login', () => login?.click());
      });
    }
    login?.addEventListener('click', () => api.arrived('login'));
    // Connexion réussie ou déconnexion : plus d'étape précédente.
    document.getElementById('studentLogout')?.addEventListener('click', () => api.reset());
    const dashboard = document.getElementById('studentDashboard');
    if (dashboard) new MutationObserver(() => api.reset()).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
