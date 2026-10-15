// Bouton « Retour » flottant, commun aux trois espaces (accueil, enseignant, élève).
// Petit rond semi-transparent en bas à gauche : il reste visible pendant le défilement,
// s'affirme au survol ou au toucher, et disparaît à l'impression.
//  - Espace enseignant : page précédente de SUIVI&PFMP, sinon rubrique précédente, sinon accueil du site.
//  - Espace élève : retour à la connexion depuis Inscription/Contact, sinon accueil du site.
//  - Accueil du site : remonte en haut de page (affiché seulement après défilement).
(function () {
  'use strict';
  if (document.getElementById('melecRetour')) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const teacher = page.startsWith('enseignant'), student = page.startsWith('eleve');
  const home = !teacher && !student;

  const style = document.createElement('style');
  style.textContent = `
#melecRetour{position:fixed;z-index:880;left:max(12px,env(safe-area-inset-left));bottom:max(30px,calc(env(safe-area-inset-bottom) + 18px));
  display:grid;place-items:center;width:38px;height:38px;padding:0;margin:0;border-radius:50%;
  border:1px solid rgba(140,200,255,.38);background:rgba(6,20,40,.55);color:#d6ebff;
  font:600 18px/1 system-ui,sans-serif;cursor:pointer;opacity:.55;box-shadow:0 2px 10px rgba(0,0,0,.25);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:opacity .2s,transform .2s,background .2s;-webkit-tap-highlight-color:transparent}
@media (hover:hover){#melecRetour:hover{opacity:1;background:rgba(10,32,62,.9);border-color:#ff8a1e}}
#melecRetour:focus-visible{opacity:1;background:rgba(10,32,62,.9);border-color:#ff8a1e}
#melecRetour:focus-visible{outline:2px solid #ff8a1e;outline-offset:2px}
#melecRetour:active{transform:scale(.92)}
#melecRetour[hidden]{display:none!important}
@media (hover:none){#melecRetour{opacity:.7}}
@media (prefers-reduced-motion:reduce){#melecRetour{transition:none}}
@media print{#melecRetour{display:none!important}}`;
  document.head.append(style);

  const button = document.createElement('button');
  button.id = 'melecRetour';
  button.type = 'button';
  button.textContent = home ? '↑' : '←';
  const label = home ? 'Revenir en haut de la page' : 'Retour';
  button.title = label;
  button.setAttribute('aria-label', label);
  document.body.append(button);

  const visible = el => el && !el.hidden && el.offsetParent !== null;
  function goHome() { location.href = './index.html'; }

  function back() {
    if (home) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (teacher) {
      if (window.MelecSuivi?.back?.()) return;
      if (document.body.classList.contains('subpage-active') && typeof window.appBack === 'function') { window.appBack(); window.scrollTo({ top: 0 }); return; }
      return goHome();
    }
    // Espace élève
    const login = document.getElementById('studentLoginTab');
    if (visible(document.getElementById('studentAuth')) && login && !login.classList.contains('active')) { login.click(); return; }
    goHome();
  }
  button.addEventListener('click', back);

  // Masqué derrière l'écran de connexion enseignant (qui a déjà son lien d'accueil) et, sur l'accueil, tant qu'on est en haut.
  function sync() {
    let hide = false;
    if (teacher) hide = document.body.classList.contains('cloud-locked');
    if (home) hide = window.scrollY < 400;
    button.hidden = hide;
  }
  if (home) window.addEventListener('scroll', sync, { passive: true });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
