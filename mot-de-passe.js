// Bouton « Afficher » dans les champs mot de passe des connexions élève et enseignant :
// permet de vérifier ce qui est réellement tapé (clavier iPhone, remplissage automatique de Safari).
(function () {
  'use strict';
  function attach(input) {
    if (input.dataset.voir) return;
    input.dataset.voir = '1';
    // Aucune correction ni majuscule automatique, même quand le mot de passe est affiché en clair.
    for (const [k, v] of [['autocapitalize', 'none'], ['autocorrect', 'off'], ['spellcheck', 'false']]) input.setAttribute(k, v);
    const box = document.createElement('span');
    box.className = 'mdp-champ';
    input.parentNode.insertBefore(box, input);
    box.append(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mdp-voir';
    button.textContent = 'Afficher';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Afficher le mot de passe');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Masquer' : 'Afficher';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      input.focus();
    });
    box.append(button);
    // Le mot de passe est toujours remasqué à l'envoi du formulaire.
    input.form?.addEventListener('submit', () => { input.type = 'password'; button.textContent = 'Afficher'; button.setAttribute('aria-pressed', 'false'); }, true);
  }
  function scan() { document.querySelectorAll('#studentLoginForm input[name=password], #cloudPassword').forEach(attach); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
