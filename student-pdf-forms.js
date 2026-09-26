(function () {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function create(panel, stage, layer, mayRead, options) {
    if (!options || typeof options.save !== 'function') return null;
    const entries = (Array.isArray(options.entries) ? options.entries : []).filter(entry =>
      entry && typeof entry.id === 'string' && entry.id.length <= 120 &&
      Number.isInteger(entry.page) && entry.page > 0 && ['text','check','stroke'].includes(entry.type)
    ).slice(0, 500).map(entry => ({
      id: entry.id, page: entry.page, type: entry.type,
      x: clamp(entry.x, 0, 1), y: clamp(entry.y, 0, 1),
      w: clamp(entry.w, .015, 1), h: clamp(entry.h, .015, 1),
      value: entry.type === 'check' ? Boolean(entry.value) : entry.type === 'stroke' ? '' : String(entry.value || '').slice(0, 1500),
      label: String(entry.label || '').slice(0, 120), source: entry.source === 'pdf' ? 'pdf' : 'manual',
      color: /^#[0-9a-f]{6}$/i.test(entry.color || '') ? entry.color : '#d12b2b',
      width: clamp(entry.width, 1, 8), aspect: clamp(entry.aspect || 1, .4, 2.5),
      points: entry.type === 'stroke' && Array.isArray(entry.points) ? entry.points.slice(0, 400).filter(p => Array.isArray(p) && p.length === 2).map(p => [clamp(p[0],0,1),clamp(p[1],0,1)]) : []
    }));
    let currentPage = 1, currentAspect = 1, mode = '', timer = null, dirty = false, saving = Promise.resolve(), drawing = null;
    const actions = document.createElement('div'); actions.className = 'student-pdf-form-actions';
    const addText = document.createElement('button'); addText.type = 'button'; addText.textContent = 'Ajouter du texte';
    const addCheck = document.createElement('button'); addCheck.type = 'button'; addCheck.textContent = 'Ajouter une coche';
    const pen = document.createElement('button'); pen.type = 'button'; pen.textContent = '✎ Stylo';
    const colorLabel = document.createElement('label'); colorLabel.className = 'student-pdf-color-label'; colorLabel.textContent = 'Couleur ';
    const color = document.createElement('input'); color.type = 'color'; color.value = '#d12b2b'; color.setAttribute('aria-label','Couleur du stylo'); colorLabel.append(color);
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Effacer le dernier trait';
    const saveButton = document.createElement('button'); saveButton.type = 'button'; saveButton.textContent = 'Enregistrer les réponses';
    const status = document.createElement('span'); status.className = 'student-pdf-save-status'; status.setAttribute('role','status');
    status.textContent = 'Cliquez dans les champs bleus ou ajoutez du texte et des coches.';
    actions.append(addText,addCheck,pen,colorLabel,undo,saveButton,status);
    panel.insertBefore(actions, stage.parentElement);
    const strokeLayer = document.createElementNS('http://www.w3.org/2000/svg','svg');
    strokeLayer.setAttribute('viewBox','0 0 1000 1000'); strokeLayer.setAttribute('preserveAspectRatio','none');
    strokeLayer.classList.add('student-pdf-stroke-layer');
    stage.insertBefore(strokeLayer, layer);

    function setMode(next) {
      mode = mode === next ? '' : next;
      addText.setAttribute('aria-pressed', String(mode === 'text'));
      addCheck.setAttribute('aria-pressed', String(mode === 'check'));
      pen.setAttribute('aria-pressed', String(mode === 'pen'));
      stage.classList.toggle('student-pdf-placing', mode === 'text' || mode === 'check');
      stage.classList.toggle('student-pdf-pen-active', mode === 'pen');
      if (mode) status.textContent = mode === 'pen' ? 'Dessinez sur la page avec le doigt, la souris ou le stylet.' : 'Touchez la page pour placer ' + (mode === 'text' ? 'une zone de texte.' : 'une case à cocher.');
    }
    addText.onclick = () => setMode('text');
    addCheck.onclick = () => setMode('check');
    pen.onclick = () => setMode('pen');
    undo.onclick = () => {
      if (!mayRead()) return;
      const index = entries.findLastIndex(entry => entry.page === currentPage && entry.type === 'stroke');
      if (index < 0) return;
      entries.splice(index,1); drawFields(); changed();
    };

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
      strokeLayer.replaceChildren();
      for (const entry of entries.filter(item => item.page === currentPage && item.type === 'stroke')) {
        const polyline = document.createElementNS('http://www.w3.org/2000/svg','polyline');
        polyline.setAttribute('points', entry.points.map(p => `${p[0] * 1000},${p[1] * 1000}`).join(' '));
        polyline.setAttribute('fill','none'); polyline.setAttribute('stroke',entry.color);
        polyline.setAttribute('stroke-width',String(entry.width * 1000 / Math.max(stage.clientWidth,1)));
        polyline.setAttribute('stroke-linecap','round'); polyline.setAttribute('stroke-linejoin','round');
        strokeLayer.append(polyline);
      }
      for (const entry of entries.filter(item => item.page === currentPage && item.type !== 'stroke')) {
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

    function pointAt(event) {
      const rect = stage.getBoundingClientRect();
      return [clamp((event.clientX - rect.left) / rect.width,0,1),clamp((event.clientY - rect.top) / rect.height,0,1)];
    }
    function onPointerDown(event) {
      if (mode !== 'pen' || !mayRead() || entries.length >= 500 || event.target.closest('.student-pdf-field')) return;
      event.preventDefault();
      drawing = {id:'stroke:' + crypto.randomUUID(),page:currentPage,type:'stroke',x:0,y:0,w:1,h:1,value:'',label:'Tracé',source:'manual',color:color.value,width:3,aspect:currentAspect,points:[pointAt(event)]};
      entries.push(drawing); stage.setPointerCapture(event.pointerId); drawFields();
    }
    function onPointerMove(event) {
      if (!drawing) return;
      event.preventDefault();
      const point = pointAt(event), last = drawing.points.at(-1);
      if (drawing.points.length < 400 && Math.hypot(point[0]-last[0],point[1]-last[1]) >= .002) {
        drawing.points.push(point); drawFields();
      }
    }
    function onPointerEnd(event) {
      if (!drawing) return;
      event.preventDefault();
      if (drawing.points.length === 1) drawing.points.push(pointAt(event));
      drawing = null; drawFields(); changed();
    }
    stage.addEventListener('pointerdown',onPointerDown);
    stage.addEventListener('pointermove',onPointerMove);
    stage.addEventListener('pointerup',onPointerEnd);
    stage.addEventListener('pointercancel',onPointerEnd);

    async function renderPage(page, viewport, number) {
      currentPage = number;
      currentAspect = viewport?.width && viewport?.height ? viewport.width / viewport.height : 1;
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
      stage.removeEventListener('pointerdown',onPointerDown);
      stage.removeEventListener('pointermove',onPointerMove);
      stage.removeEventListener('pointerup',onPointerEnd);
      stage.removeEventListener('pointercancel',onPointerEnd);
      if (timer) persist().catch(() => {});
      actions.remove();
    }
    return {renderPage, flush:persist, cleanup};
  }
  window.MelecPdfForms = {create};
})();
