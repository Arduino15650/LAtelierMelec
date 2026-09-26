(function () {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function create(panel, stage, layer, mayRead, options) {
    if (!options || typeof options.save !== 'function') return null;
    const entries = (Array.isArray(options.entries) ? options.entries : []).filter(entry =>
      entry && typeof entry.id === 'string' && entry.id.length <= 120 &&
      Number.isInteger(entry.page) && entry.page > 0 && ['text','check'].includes(entry.type)
    ).slice(0, 500).map(entry => ({
      id: entry.id, page: entry.page, type: entry.type,
      x: clamp(entry.x, 0, 1), y: clamp(entry.y, 0, 1),
      w: clamp(entry.w, .015, 1), h: clamp(entry.h, .015, 1),
      value: entry.type === 'check' ? Boolean(entry.value) : String(entry.value || '').slice(0, 1500),
      label: String(entry.label || '').slice(0, 120), source: entry.source === 'pdf' ? 'pdf' : 'manual'
    }));
    let currentPage = 1, mode = '', timer = null, dirty = false, saving = Promise.resolve();
    const actions = document.createElement('div'); actions.className = 'student-pdf-form-actions';
    const addText = document.createElement('button'); addText.type = 'button'; addText.textContent = 'Ajouter du texte';
    const addCheck = document.createElement('button'); addCheck.type = 'button'; addCheck.textContent = 'Ajouter une coche';
    const saveButton = document.createElement('button'); saveButton.type = 'button'; saveButton.textContent = 'Enregistrer les réponses';
    const status = document.createElement('span'); status.className = 'student-pdf-save-status'; status.setAttribute('role','status');
    status.textContent = 'Cliquez dans les champs bleus ou ajoutez du texte et des coches.';
    actions.append(addText,addCheck,saveButton,status);
    panel.insertBefore(actions, stage.parentElement);

    function setMode(next) {
      mode = mode === next ? '' : next;
      addText.setAttribute('aria-pressed', String(mode === 'text'));
      addCheck.setAttribute('aria-pressed', String(mode === 'check'));
      stage.classList.toggle('student-pdf-placing', Boolean(mode));
      if (mode) status.textContent = 'Touchez la page pour placer ' + (mode === 'text' ? 'une zone de texte.' : 'une case à cocher.');
    }
    addText.onclick = () => setMode('text');
    addCheck.onclick = () => setMode('check');

    function snapshot() { return entries.map(entry => ({...entry})); }
    function persist() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!dirty) return saving;
      if (!mayRead()) { status.textContent = 'Temps du TP écoulé : enregistrement refusé.'; return saving; }
      dirty = false;
      const copy = snapshot();
      status.textContent = 'Enregistrement…';
      saving = saving.catch(() => {}).then(() => options.save(copy)).then(() => {
        if (!dirty) status.textContent = 'Réponses enregistrées.';
      }).catch(error => {
        dirty = true;
        status.textContent = 'Échec de l’enregistrement : ' + error.message + ' — réessayez.';
        throw error;
      });
      return saving;
    }
    function changed() {
      dirty = true;
      status.textContent = 'Modifications non encore enregistrées…';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => persist().catch(() => {}), 600);
    }
    saveButton.onclick = () => persist().catch(() => {});

    function drawFields() {
      layer.replaceChildren();
      for (const entry of entries.filter(item => item.page === currentPage)) {
        const wrapper = document.createElement('div'); wrapper.className = 'student-pdf-field';
        wrapper.style.left = (entry.x * 100) + '%'; wrapper.style.top = (entry.y * 100) + '%';
        wrapper.style.width = (entry.w * 100) + '%'; wrapper.style.height = (entry.h * 100) + '%';
        const control = entry.type === 'check' ? document.createElement('input') : document.createElement('textarea');
        control.setAttribute('aria-label', entry.label || (entry.type === 'check' ? 'Case à cocher' : 'Réponse libre'));
        if (entry.type === 'check') {
          control.type = 'checkbox'; control.checked = Boolean(entry.value);
          control.onchange = () => { if (!mayRead()) { control.checked = !control.checked; return; } entry.value = control.checked; changed(); };
        } else {
          control.value = String(entry.value || ''); control.maxLength = 1500;
          control.oninput = () => { if (!mayRead()) { control.value = entry.value; return; } entry.value = control.value; changed(); };
          control.onchange = () => persist().catch(() => {});
        }
        wrapper.append(control);
        if (entry.source === 'manual') {
          const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'student-pdf-remove-field';
          remove.textContent = '×'; remove.setAttribute('aria-label', 'Supprimer cette réponse');
          remove.onclick = () => { if (!mayRead()) return; entries.splice(entries.indexOf(entry), 1); drawFields(); changed(); };
          wrapper.append(remove);
        }
        layer.append(wrapper);
      }
    }
    function addAtClick(event) {
      if (!mode || !mayRead() || event.target.closest('.student-pdf-field') || entries.length >= 500) return;
      const rect = stage.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, .98);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, .97);
      const type = mode;
      const entry = {
        id: 'manual:' + crypto.randomUUID(), page: currentPage, type,
        x, y, w: type === 'check' ? .035 : Math.min(.3, 1 - x),
        h: type === 'check' ? .035 : .05,
        value: type === 'check' ? true : '',
        label: type === 'check' ? 'Coche ajoutée' : 'Réponse ajoutée', source: 'manual'
      };
      entries.push(entry); drawFields(); changed();
      if (type === 'text') layer.lastElementChild?.querySelector('textarea')?.focus();
    }
    stage.addEventListener('click', addAtClick);

    async function renderPage(page, viewport, number) {
      currentPage = number;
      const annotations = await page.getAnnotations({intent:'display'});
      const natural = page.getViewport({scale:1});
      for (const annotation of annotations) {
        const type = annotation.fieldType === 'Tx' ? 'text' : annotation.fieldType === 'Btn' && annotation.checkBox ? 'check' : null;
        if (!type || !annotation.rect || !annotation.id) continue;
        const id = 'pdf:' + annotation.id;
        if (entries.some(entry => entry.id === id)) continue;
        const [x1,y1,x2,y2] = natural.convertToViewportRectangle(annotation.rect);
        const x = clamp(Math.min(x1,x2) / natural.width, 0, 1);
        const y = clamp(Math.min(y1,y2) / natural.height, 0, 1);
        entries.push({
          id, page:number, type, x, y,
          w:clamp(Math.abs(x2-x1) / natural.width, .015, 1-x),
          h:clamp(Math.abs(y2-y1) / natural.height, .015, 1-y),
          value:type === 'check' ? Boolean(annotation.fieldValue && annotation.fieldValue !== 'Off') : String(annotation.fieldValue || ''),
          label:String(annotation.fieldName || 'Champ du PDF').slice(0,120), source:'pdf'
        });
      }
      drawFields();
    }
    function cleanup() {
      stage.removeEventListener('click', addAtClick);
      if (timer) persist().catch(() => {});
      actions.remove();
    }
    return {renderPage, flush:persist, cleanup};
  }
  window.MelecPdfForms = {create};
})();
