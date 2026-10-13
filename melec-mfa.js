/* L'Atelier MELEC : double authentification de l'enseignant (application Authenticator).
   - À la connexion : si un Authenticator est activé, le code à 6 chiffres est demandé
     avant d'ouvrir l'espace (session de niveau aal2).
   - Menu « Mon compte » → « Double authentification » : activer (QR code), ajouter
     un second téléphone, ou désactiver.
   Les élèves ne sont pas concernés. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const api = () => window.MelecPortal;
  const esc = value => api().escapeHtml(value);
  const cleanCode = value => String(value || '').replace(/\D/g, '');

  function friendlyError(error) {
    const text = String(error && error.message || error || '');
    if (/invalid|incorrect|expired/i.test(text) && /code|totp|challenge/i.test(text)) return 'Code incorrect ou expiré. Attendez le code suivant dans l’application et réessayez.';
    if (/aal2|AAL2|assurance/i.test(text)) return 'Confirmez d’abord votre identité avec le code Authenticator (reconnectez-vous).';
    return text || 'Erreur inattendue.';
  }

  // ---- Étape de connexion -------------------------------------------------
  // Résout quand la session est de niveau aal2. L'Authenticator est obligatoire pour l'enseignant :
  // s'il n'en a pas encore, il l'active ici (QR code) avant d'accéder aux données.
  async function requireSecondFactor(gateMessage, isTeacher) {
    if (await api().assuranceLevel() === 'aal2') return;
    const factors = await api().mfaFactors();
    let verified = factors.filter(factor => factor.status === 'verified');
    let setup = null;
    if (!verified.length) {
      if (!isTeacher || !(await isTeacher())) return;
      // Un essai abandonné laisse un appareil « non vérifié » : on le nettoie avant d'en créer un nouveau.
      for (const factor of factors) await api().mfaUnenroll(factor.id).catch(() => {});
      const data = await api().mfaEnroll('Téléphone principal');
      verified = [{ id: data.id }];
      setup = document.createElement('div');
      setup.className = 'mfa-gate-setup';
      setup.innerHTML = `<ol class="mfa-steps"><li>Installez Google Authenticator, Microsoft Authenticator ou une application équivalente.</li><li>Choisissez « Ajouter un compte », puis scannez ce QR code :</li></ol>
        <div class="mfa-qr"><img alt="QR code à scanner avec l’application Authenticator" src="${esc(data.totp.qr_code)}"></div>
        <details class="mfa-secret"><summary>Impossible de scanner ? Saisir la clé à la main</summary><code>${esc(data.totp.secret)}</code></details>`;
    }
    const pane = byId('cloudMfaPane'), form = byId('cloudMfaForm'), input = byId('cloudMfaCode');
    pane.querySelector('.mfa-gate-setup')?.remove();
    if (setup) form.before(setup);
    byId('cloudLoginPane').hidden = true;
    byId('cloudImportPane').hidden = true;
    byId('cloudSignOutGate').hidden = false;
    pane.hidden = false;
    document.documentElement.classList.remove('cloud-resuming');
    gateMessage(setup ? 'Mot de passe accepté. La double authentification est obligatoire pour l’espace enseignant : scannez le QR code, puis saisissez le code affiché.' : 'Mot de passe accepté. Saisissez le code de votre application Authenticator.');
    input.value = '';
    setTimeout(() => input.focus(), 50);
    await new Promise(resolve => {
      form.onsubmit = async event => {
        event.preventDefault();
        const code = cleanCode(input.value);
        if (code.length !== 6) return gateMessage('Le code comporte 6 chiffres.', 'error');
        const button = form.querySelector('button[type=submit]');
        button.disabled = true;
        gateMessage('Vérification du code…');
        let lastError = null;
        // Plusieurs téléphones peuvent être enregistrés : on essaie chacun.
        for (const factor of verified) {
          try { await api().mfaVerify(factor.id, code); lastError = null; break; }
          catch (error) { lastError = error; }
        }
        button.disabled = false;
        if (lastError) { input.select(); return gateMessage(friendlyError(lastError), 'error'); }
        pane.hidden = true;
        setup?.remove();
        form.onsubmit = null;
        resolve();
      };
    });
  }

  // ---- Gestion depuis « Mon compte » ---------------------------------------
  const dialog = byId('mfaDialog'), body = byId('mfaBody'), statusLine = byId('mfaStatus');
  function setStatus(message, error) { statusLine.textContent = message || ''; statusLine.classList.toggle('error', !!error); }

  async function render() {
    setStatus('');
    body.innerHTML = '<p>Chargement…</p>';
    let factors;
    try { factors = await api().mfaFactors(); }
    catch (error) { body.innerHTML = ''; return setStatus(friendlyError(error), true); }
    const verified = factors.filter(factor => factor.status === 'verified');
    if (!verified.length) {
      body.innerHTML = `<p>Protégez votre espace enseignant : en plus du mot de passe, un code à 6 chiffres affiché par une application sur votre téléphone sera demandé à chaque connexion.</p>
        <ol class="mfa-steps"><li>Installez <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou une application équivalente sur votre téléphone.</li><li>Cliquez sur « Activer », puis scannez le QR code avec l’application.</li><li>Saisissez le code affiché pour confirmer.</li></ol>
        <div class="mfa-actions"><button type="button" id="mfaStart">Activer la double authentification</button></div>`;
      byId('mfaStart').onclick = () => enroll(factors, 'Téléphone principal');
      return;
    }
    body.innerHTML = `<p class="mfa-on"><strong>Activée.</strong> Le code Authenticator est demandé à chaque connexion.</p>
      <ul class="mfa-list">${verified.map(factor => `<li><span>${esc(factor.friendly_name || 'Authenticator')}</span>${factor.created_at && !isNaN(Date.parse(factor.created_at)) ? `<small>ajouté le ${esc(new Date(factor.created_at).toLocaleDateString('fr-FR'))}</small>` : ''}<button type="button" class="warn" data-remove="${esc(factor.id)}">Retirer</button></li>`).join('')}</ul>
      <p class="mfa-help">Conseil : enregistrez un second appareil (autre téléphone ou tablette). Si vous perdez votre téléphone, il vous permettra toujours de vous connecter.</p>
      <div class="mfa-actions"><button type="button" id="mfaAdd">Ajouter un second appareil</button></div>`;
    byId('mfaAdd').onclick = () => enroll(factors, 'Appareil de secours');
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => {
      // La double authentification est obligatoire : le dernier appareil ne peut pas être retiré.
      if (verified.length === 1) return setStatus('La double authentification est obligatoire. Ajoutez d’abord un second appareil, puis retirez celui-ci.', true);
      const last = false;
      if (!confirm('Retirer cet appareil ? Il ne pourra plus générer de code pour ce compte.')) return;
      button.disabled = true;
      try { await api().mfaUnenroll(button.dataset.remove); await render(); setStatus(last ? 'Double authentification désactivée.' : 'Appareil retiré.'); }
      catch (error) { button.disabled = false; setStatus(friendlyError(error), true); }
    });
  }

  async function enroll(factors, defaultName) {
    setStatus('');
    try {
      // Un essai abandonné laisse un appareil « non vérifié » : on le nettoie avant d'en créer un nouveau.
      for (const factor of factors.filter(f => f.status !== 'verified')) await api().mfaUnenroll(factor.id).catch(() => {});
      const used = new Set(factors.map(f => f.friendly_name));
      let name = defaultName, n = 2;
      while (used.has(name)) name = defaultName + ' ' + n++;
      const data = await api().mfaEnroll(name);
      body.innerHTML = `<ol class="mfa-steps"><li>Dans l’application Authenticator, choisissez « Ajouter un compte » puis « Scanner un QR code ».</li><li>Scannez ce code :</li></ol>
        <div class="mfa-qr"><img alt="QR code à scanner avec l’application Authenticator" src="${esc(data.totp.qr_code)}"></div>
        <details class="mfa-secret"><summary>Impossible de scanner ? Saisir la clé à la main</summary><code>${esc(data.totp.secret)}</code></details>
        <form id="mfaConfirm" class="mfa-confirm" autocomplete="off"><label for="mfaCode">3. Code affiché dans l’application</label>
        <input id="mfaCode" inputmode="numeric" maxlength="7" autocomplete="one-time-code" required><button type="submit">Confirmer</button></form>`;
      byId('mfaCode').focus();
      byId('mfaConfirm').onsubmit = async event => {
        event.preventDefault();
        const code = cleanCode(byId('mfaCode').value);
        if (code.length !== 6) return setStatus('Le code comporte 6 chiffres.', true);
        const button = event.target.querySelector('button');
        button.disabled = true;
        try {
          await api().mfaVerify(data.id, code);
          await render();
          setStatus('C’est activé. Le code sera demandé à votre prochaine connexion.');
        } catch (error) { button.disabled = false; setStatus(friendlyError(error), true); }
      };
    } catch (error) { setStatus(friendlyError(error), true); }
  }

  const open = byId('mfaOpen');
  if (open && dialog) open.addEventListener('click', () => {
    open.closest('details')?.removeAttribute('open');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    render();
  });

  window.MelecMfa = { requireSecondFactor };
})();
