// Bouton « Retour » en haut de page, commun aux espaces enseignant et élève.
//
// Règles :
//  - il ramène à la page ou à l'étape précédente, jusqu'à l'accueil de l'espace, jamais à l'accueil du site ;
//  - il apparaît dès qu'on a quitté l'accueil de l'espace (capsule, menu ou lien) et disparaît sur cet accueil ;
//  - revenir soi-même à la page d'origine (lien « Annuler », « ← Retour à… ») consomme l'étape.
// Enseignant : bouton « ← Retour » de la barre haute. Élève : même bouton, dans l'en-tête.
// Les autres modules alimentent l'historique avec window.MelecRetour (push / arrived / reset).
(function () {
  'use strict';
  if (window.MelecRetour) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const teacher = page.startsWith('enseignant'), student = page.startsWith('eleve');

  const stack = [];
  let restoring = false;
  // body.retour-actif affiche le bouton (la feuille melec-interactions.css s'en charge).
  const sync = () => {
    const show = stack.length > 0 && !document.body.classList.contains('cloud-locked');
    if (document.body.classList.contains('retour-actif') !== show) document.body.classList.toggle('retour-actif', show);
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

  let button = document.getElementById('appBackButton');
  if (button) {
    // L'ancien comportement (retour à la rubrique précédente, puis à l'accueil) est remplacé.
    button.removeAttribute('onclick');
    button.removeAttribute('hidden');
  } else {
    // Espace élève : même bouton, placé dans l'en-tête.
    button = document.createElement('button');
    button.id = 'appBackButton';
    button.type = 'button';
    button.className = 'app-back-button';
    button.innerHTML = '← <span>Retour</span>';
    (document.querySelector('.portal-header') || document.body).prepend(button);
  }
  button.setAttribute('aria-label', 'Revenir à l’étape précédente');
  button.title = 'Revenir à l’étape précédente';
  button.addEventListener('click', event => { event.stopImmediatePropagation(); api.back(); }, true);

  // Connexion ou déconnexion : l'historique repart de zéro.
  let locked = document.body.classList.contains('cloud-locked');
  new MutationObserver(() => {
    const now = document.body.classList.contains('cloud-locked');
    if (now !== locked) { locked = now; stack.length = 0; }
    sync();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();

  if (teacher) {
    // Chaque changement de page (capsule, menu, lien interne) mémorise la page quittée, accueil enseignant compris.
    // Revenir sur l'accueil enseignant (titre, pastille Accueil, retour) vide l'historique : le bouton y est masqué.
    // Le bouton ne quitte jamais l'espace : il ne ramène pas à l'accueil du site.
    window.addEventListener('melec-reset-selection', () => api.reset());
    let editorOpen = false;
    const current = () => editorOpen ? 'editor' : (location.hash.slice(1) || 'home');
    const baseShow = window.show;
    if (typeof baseShow === 'function') {
      window.show = function (name) {
        const from = current();
        if (name === 'home') api.reset();
        else if (!restoring && name !== from && !api.arrived(name) && from !== 'editor') api.push(from, () => window.show(from));
        editorOpen = false;
        return baseShow.apply(this, arguments);
      };
    }
    const baseRaw = window.showRaw;
    if (typeof baseRaw === 'function') {
      window.showRaw = function (name) {
        if (name === 'editor' && !editorOpen) {
          const from = current();
          if (!restoring) api.push(from, () => window.show(from));
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
