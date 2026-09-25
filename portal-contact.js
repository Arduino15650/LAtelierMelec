(function () {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const counter = document.getElementById('contactCount');
  const status = document.getElementById('contactStatus');
  const area = form.elements.comment;
  area.addEventListener('input', () => { counter.textContent = `${area.value.length} / 500 caractères`; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.website) return;
    if (!data.comment || data.comment.length > 500) {
      status.textContent = 'Le commentaire doit contenir entre 1 et 500 caractères.';
      status.classList.add('error');
      return;
    }
    button.disabled = true;
    status.textContent = 'Envoi en cours…';
    status.classList.remove('error');
    try {
      await MelecPortal.invoke('melec-contact', data, false);
      form.reset();
      counter.textContent = '0 / 500 caractères';
      status.textContent = 'Votre message a été transmis à l’enseignant.';
    } catch (error) {
      status.textContent = 'Envoi impossible : ' + error.message;
      status.classList.add('error');
    } finally { button.disabled = false; }
  });
})();
