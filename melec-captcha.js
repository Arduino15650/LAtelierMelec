/* L'Atelier MELEC : contrôle anti-robot Cloudflare Turnstile.
   Supabase Auth vérifie le jeton à chaque connexion et à chaque création de compte
   (Authentication → Attack Protection). Un jeton ne sert qu'une fois : le contrôle est
   relancé après chaque tentative. La clé ci-dessous est publique ; la clé secrète reste
   uniquement dans Supabase. */
(function () {
  'use strict';
  const SITE_KEY = '0x4AAAAAAFV50u8jm1HFS_z6';
  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  let loading = null;
  const widgets = new Map();

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT; script.async = true;
      const timer = setTimeout(failed, 15000);
      function failed() {
        clearTimeout(timer); script.remove(); loading = null;
        reject(new Error('Le contrôle anti-robot ne se charge pas. Vérifiez votre connexion puis réessayez.'));
      }
      script.onerror = failed;
      script.onload = () => { clearTimeout(timer); window.turnstile ? resolve(window.turnstile) : failed(); };
      document.head.appendChild(script);
    });
    return loading;
  }

  // Affiche le contrôle dans le conteneur [data-captcha] du formulaire.
  function mount(form) {
    const slot = form && form.querySelector('[data-captcha]');
    if (!slot || widgets.has(form)) return;
    const entry = { id: null, token: '' };
    widgets.set(form, entry);
    loadTurnstile().then(api => {
      entry.id = api.render(slot, {
        sitekey: SITE_KEY, action: slot.dataset.captcha || 'login', theme: 'light', language: 'fr',
        callback: token => { entry.token = token; },
        'expired-callback': () => { entry.token = ''; },
        'timeout-callback': () => { entry.token = ''; },
        'error-callback': () => { entry.token = ''; return true; }
      });
    }).catch(error => {
      widgets.delete(form);
      slot.textContent = error.message;
    });
  }

  // Jeton du formulaire, ou erreur explicite si le contrôle n'est pas validé.
  function token(form) {
    const entry = widgets.get(form);
    if (!entry) { mount(form); throw new Error('Le contrôle anti-robot se charge. Validez-le puis réessayez.'); }
    if (!entry.token) throw new Error('Validez le contrôle anti-robot « Vérifiez que vous êtes humain » pour continuer.');
    return entry.token;
  }

  // Un jeton ne sert qu'une fois : nouveau contrôle après chaque tentative.
  function reset(form) {
    const entry = widgets.get(form);
    if (!entry) return;
    entry.token = '';
    if (entry.id !== null && window.turnstile) window.turnstile.reset(entry.id);
  }

  window.MelecCaptcha = { mount, token, reset };
})();
