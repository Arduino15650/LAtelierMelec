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
      fontSize: entry.type === 'text' && entry.fontSize != null && Number.isFinite(Number(entry.fontSize)) ? clamp(entry.fontSize, 5, 32) : null,
      value: entry.type === 'check' ? Boolean(entry.value) : entry.type === 'stroke' ? '' : String(entry.value || '').slice(0, 1500),
      label: String(entry.label || '').slice(0, 120), source: entry.source === 'pdf' ? 'pdf' : 'manual',
      color: /^#[0-9a-f]{6}$/i.test(entry.color || '') ? entry.color : '#d12b2b',
      width: clamp(entry.width, 1, 8), aspect: clamp(entry.aspect || 1, .4, 2.5),
      points: entry.type === 'stroke' && Array.isArray(entry.points) ? entry.points.slice(0, 400).filter(p => Array.isArray(p) && p.length === 2).map(p => [clamp(p[0],0,1),clamp(p[1],0,1)]) : []
    }));
    let currentPage = 1, currentAspect = 1, currentScale = 1, mode = '', timer = null, dirty = false, saving = Promise.resolve(), drawing = null, retryCount = 0;
    const textSamplesByPage = new Map();
    function nearbyFontSize(x, y) {
      const samples = textSamplesByPage.get(currentPage) || [];
      if (!samples.length) return 11;
      let nearest = null, distance = Infinity;
      for (const sample of samples) {
        const d = Math.abs(sample.y - y) * 2 + Math.abs(sample.x - x) * .35;
        if (d < distance) { distance = d; nearest = sample; }
      }
      return nearest?.size || 11;
    }
    const actions = document.createElement('details'); actions.className = 'student-pdf-form-actions';
    const summary = document.createElement('summary'); summary.textContent = '✎ Outils de réponse';
    const tools = document.createElement('div'); tools.className = 'student-pdf-form-tools';
    const addText = document.createElement('button'); addText.type = 'button'; addText.textContent = 'Texte'; addText.title = 'Ajouter un champ texte par double-clic ou double-tap';
    const addCheck = document.createElement('button'); addCheck.type = 'button'; addCheck.textContent = 'Croix ×'; addCheck.title = 'Placer une petite croix par double-clic ou double-tap';
    const pen = document.createElement('button'); pen.type = 'button'; pen.textContent = '✎ Stylo';
    const colorLabel = document.createElement('label'); colorLabel.className = 'student-pdf-color-label'; colorLabel.textContent = 'Couleur ';
    const color = document.createElement('input'); color.type = 'color'; color.value = '#d12b2b'; color.setAttribute('aria-label','Couleur du stylo'); colorLabel.append(color);
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = '↶ Trait'; undo.title = 'Effacer le dernier trait';
    const status = document.createElement('span'); status.className = 'student-pdf-save-status'; status.setAttribute('role','status');
    status.textContent = 'Enregistrement automatique';
    tools.append(addText,addCheck,pen,colorLabel,undo);
    actions.append(summary,tools);
    const compact = window.matchMedia('(max-width: 700px)');
    const updateCompact = () => { if (!compact.matches) actions.open = true; else actions.open = false; };
    updateCompact(); compact.addEventListener('change',updateCompact);
    panel.insertBefore(actions, stage.parentElement);
    panel.insertBefore(status, stage.parentElement);
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
      if (mode) status.textContent = mode === 'pen' ? 'Tracez avec le doigt ou le stylet. Appuyez de nouveau sur Stylo pour quitter.' : 'Double-cliquez ou touchez deux fois le PDF pour placer ' + (mode === 'text' ? 'un texte.' : 'une croix.');
      else status.textContent = 'Lecture du PDF · réponses enregistrées automatiquement.';
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
        retryCount = 0;
        if (!dirty) status.textContent = 'Réponses enregistrées.';
      }).catch(error => {
        dirty = true;
        status.textContent = 'Échec de l’enregistrement : ' + error.message + (retryCount < 3 ? ' — nouvel essai automatique.' : ' — modifiez une réponse pour réessayer.');
        if (retryCount++ < 3 && mayRead()) timer = setTimeout(() => persist().catch(() => {}),3000 * retryCount);
        throw error;
      });
      return saving;
    }
    function changed() {
      dirty = true;
      retryCount = 0;
      status.textContent = 'Modifications non encore enregistrées…';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => persist().catch(() => {}), 600);
    }

    function addPositionHandle(wrapper, entry, kind) {
      const handle = document.createElement('button'); handle.type = 'button';
      handle.className = kind === 'move' ? 'student-pdf-move-field' : 'student-pdf-resize-field';
      handle.textContent = kind === 'move' ? '⠿' : '↘';
      handle.setAttribute('aria-label', kind === 'move' ? 'Déplacer cette réponse' : 'Redimensionner cette zone de texte');
      handle.addEventListener('pointerdown', event => {
        if (!mayRead()) return;
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX, startY = event.clientY;
        const start = {x:entry.x,y:entry.y,w:entry.w,h:entry.h};
        const rect = stage.getBoundingClientRect();
        let moved = false;
        const move = next => {
          next.preventDefault(); next.stopPropagation(); moved = true;
          const dx = (next.clientX - startX) / rect.width;
          const dy = (next.clientY - startY) / rect.height;
          if (kind === 'move') {
            entry.x = clamp(start.x + dx,0,1-entry.w);
            entry.y = clamp(start.y + dy,0,1-entry.h);
            wrapper.style.left = (entry.x * 100) + '%'; wrapper.style.top = (entry.y * 100) + '%';
          } else {
            entry.w = clamp(start.w + dx,Math.min(.04,1-entry.x),1-entry.x);
            entry.h = clamp(start.h + dy,Math.min(.025,1-entry.y),1-entry.y);
            wrapper.style.width = (entry.w * 100) + '%'; wrapper.style.height = (entry.h * 100) + '%';
          }
        };
        const finish = finalEvent => {
          finalEvent.preventDefault(); finalEvent.stopPropagation();
          handle.removeEventListener('pointermove',move);
          handle.removeEventListener('pointerup',finish);
          handle.removeEventListener('pointercancel',finish);
          if (moved) changed();
        };
        handle.setPointerCapture(event.pointerId);
        handle.addEventListener('pointermove',move);
        handle.addEventListener('pointerup',finish);
        handle.addEventListener('pointercancel',finish);
      });
      wrapper.append(handle);
    }

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
        const control = entry.type === 'check' ? document.createElement('button') : document.createElement('textarea');
        control.setAttribute('aria-label', entry.label || (entry.type === 'check' ? 'Case à cocher' : 'Réponse libre'));
        if (entry.type === 'check') {
          control.type = 'button'; control.className = 'student-pdf-cross';
          control.textContent = entry.value ? '×' : '';
          control.setAttribute('aria-pressed',String(Boolean(entry.value)));
          control.onclick = () => { if (!mayRead()) return; entry.value = !entry.value; control.textContent = entry.value ? '×' : ''; control.setAttribute('aria-pressed',String(entry.value)); changed(); };
        } else {
          control.value = String(entry.value || ''); control.maxLength = 1500;
          control.style.fontSize = (clamp(entry.fontSize || nearbyFontSize(entry.x,entry.y),5,32) * currentScale) + 'px';
          control.style.lineHeight = '1.15';
          control.oninput = () => { if (!mayRead()) { control.value = entry.value; return; } entry.value = control.value; changed(); };
          control.onchange = () => persist().catch(() => {});
        }
        wrapper.append(control);
        if (entry.source === 'manual') {
          addPositionHandle(wrapper,entry,'move');
          if (entry.type === 'text') addPositionHandle(wrapper,entry,'resize');
          const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'student-pdf-remove-field';
          remove.textContent = '×'; remove.setAttribute('aria-label', 'Supprimer cette réponse');
          remove.onclick = () => { if (!mayRead()) return; entries.splice(entries.indexOf(entry), 1); drawFields(); changed(); };
          wrapper.append(remove);
        }
        layer.append(wrapper);
      }
    }
    function addAtPosition(event) {
      if (!['text','check'].includes(mode) || !mayRead() || event.target.closest('.student-pdf-field') || entries.length >= 500) return;
      const rect = stage.getBoundingClientRect();
      const type = mode;
      const x = clamp((event.clientX - rect.left) / rect.width, 0, type === 'check' ? .976 : .96);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, type === 'check' ? .976 : .95);
      const entry = {
        id: 'manual:' + crypto.randomUUID(), page: currentPage, type,
        x, y, w: type === 'check' ? .016 : Math.min(.3, 1 - x),
        h: type === 'check' ? .016 : .05,
        fontSize: type === 'text' ? nearbyFontSize(x,y) : null,
        value: type === 'check' ? true : '',
        label: type === 'check' ? 'Coche ajoutée' : 'Réponse ajoutée', source: 'manual'
      };
      entries.push(entry); drawFields(); changed();
      if (type === 'text') layer.lastElementChild?.querySelector('textarea')?.focus();
      setMode('');
    }
    function onDoubleClick(event) { if (event.pointerType === 'touch') return; event.preventDefault(); addAtPosition(event); }
    stage.addEventListener('dblclick',onDoubleClick);
    let lastTouch = null;
    function onTouchEnd(event) {
      if (!['text','check'].includes(mode) || event.target.closest('.student-pdf-field')) return;
      const touch = event.changedTouches[0]; if (!touch) return;
      const now = Date.now();
      const near = lastTouch && now - lastTouch.time < 400 && Math.hypot(touch.clientX-lastTouch.x,touch.clientY-lastTouch.y) < 32;
      if (near) {
        event.preventDefault();
        addAtPosition({clientX:touch.clientX,clientY:touch.clientY,target:event.target});
        lastTouch = null;
      } else lastTouch = {time:now,x:touch.clientX,y:touch.clientY};
    }
    stage.addEventListener('touchend',onTouchEnd,{passive:false});

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
    const onVisibility = () => { if (document.visibilityState === 'hidden' && dirty) persist().catch(() => {}); };
    const onBeforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('beforeunload',onBeforeUnload);

    async function renderPage(page, viewport, number) {
      currentPage = number;
      currentScale = viewport?.scale || 1;
      currentAspect = viewport?.width && viewport?.height ? viewport.width / viewport.height : 1;
      const annotations = await page.getAnnotations({intent:'display'});
      const natural = page.getViewport({scale:1});
      if (!textSamplesByPage.has(number)) {
        try {
          const content = await page.getTextContent();
          const samples = content.items.filter(item => item.str?.trim() && Array.isArray(item.transform)).map(item => {
            const [px,py] = natural.convertToViewportPoint(item.transform[4],item.transform[5]);
            const size = Number(item.height) || Math.hypot(item.transform[2],item.transform[3]);
            return {x:clamp(px / natural.width,0,1),y:clamp((py - size / 2) / natural.height,0,1),size:clamp(size,5,32)};
          }).filter(sample => Number.isFinite(sample.size));
          textSamplesByPage.set(number,samples);
        } catch { textSamplesByPage.set(number,[]); }
      }
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
          label:String(annotation.fieldName || 'Champ du PDF').slice(0,120), source:'pdf',
          fontSize:type === 'text' ? clamp(annotation.defaultAppearanceData?.fontSize || nearbyFontSize(x,y),5,32) : null
        });
      }
      let adapted = false;
      for (const entry of entries) if (entry.page === number && entry.type === 'text' && !entry.fontSize) {
        entry.fontSize = nearbyFontSize(entry.x,entry.y); adapted = true;
      }
      drawFields();
      if (adapted) changed();
    }
    function cleanup() {
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('beforeunload',onBeforeUnload);
      stage.removeEventListener('dblclick',onDoubleClick);
      stage.removeEventListener('touchend',onTouchEnd);
      compact.removeEventListener('change',updateCompact);
      stage.removeEventListener('pointerdown',onPointerDown);
      stage.removeEventListener('pointermove',onPointerMove);
      stage.removeEventListener('pointerup',onPointerEnd);
      stage.removeEventListener('pointercancel',onPointerEnd);
      if (timer) persist().catch(() => {});
      actions.remove();
      status.remove();
    }
    return {renderPage, flush:persist, cleanup};
  }
  window.MelecPdfForms = {create};
})();
