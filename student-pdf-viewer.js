(function () {
  'use strict';
  const scriptBase = document.currentScript?.src || document.baseURI;
  let libraryPromise;
  function library() {
    if (!libraryPromise) libraryPromise = import('./pdf.min.mjs').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', scriptBase).href;
      return pdfjs;
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }

  // Documents consultés sur le site : ni enregistrement ni impression.
  // Tant qu'une visionneuse est ouverte, Ctrl/Cmd + S et Ctrl/Cmd + P sont neutralisés ;
  // à l'impression, la visionneuse est masquée (feuille de style pdf-mobile.css).
  let openViewers = 0;
  window.addEventListener('keydown', event => {
    if (!openViewers || !(event.ctrlKey || event.metaKey)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 's' || key === 'p') { event.preventDefault(); event.stopPropagation(); }
  }, true);
  const editable = target => Boolean(target?.closest?.('textarea,input,[contenteditable="true"]'));
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function button(text, title) {
    const element = document.createElement('button'); element.type = 'button'; element.textContent = text;
    if (title) { element.title = title; element.setAttribute('aria-label', title); }
    return element;
  }
  function pageSurface(className) {
    const stage = document.createElement('div'); stage.className = 'student-pdf-stage' + (className ? ' ' + className : '');
    const canvas = document.createElement('canvas'); canvas.className = 'student-pdf-page'; canvas.setAttribute('role','img');
    const textLayer = document.createElement('div'); textLayer.className = 'student-pdf-text-layer textLayer';
    stage.append(canvas,textLayer);
    return {stage, canvas, textLayer, task:null};
  }

  async function render(blob, mount, mayRead = () => true, formOptions = null) {
    const pdfjs = await library();
    if (!mayRead()) throw new Error('L’accès à ce document a expiré.');
    const task = pdfjs.getDocument({data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableScripting: false});
    const documentPdf = await task.promise;
    const pages = documentPdf.numPages;
    // fit : « page » = page entière visible, « width » = toute la largeur disponible.
    let closed = false, busy = false, current = 1, zoom = 1, fit = 'page', spread = false, pendingPage = null, lastLayout = '', fallbackFullscreen = false;
    const panel = document.createElement('div'); panel.className = 'student-pdf-panel';
    const controls = document.createElement('div'); controls.className = 'student-pdf-controls';
    const navigation = document.createElement('div'); navigation.className = 'student-pdf-navigation';
    const previous = button('←','Page précédente');
    const pageCount = document.createElement('span'); pageCount.className = 'student-pdf-page-count'; pageCount.setAttribute('aria-live','polite');
    const orientation = document.createElement('span'); orientation.className = 'student-pdf-sr-only';
    const next = button('→','Page suivante');
    navigation.append(previous,pageCount,next);
    const zoomControls = document.createElement('div'); zoomControls.className = 'student-pdf-zoom';
    const zoomOut = button('−','Dézoomer');
    const zoomValue = document.createElement('output'); zoomValue.setAttribute('aria-live','polite'); zoomValue.textContent = '100 %';
    const zoomIn = button('+','Zoomer');
    zoomControls.append(zoomOut,zoomValue,zoomIn);
    const display = document.createElement('div'); display.className = 'student-pdf-display';
    const wholePage = button('Page entière','Afficher la page entière');
    const fullWidth = button('Largeur','Occuper toute la largeur');
    const twoPages = button('2 pages','Afficher deux pages côte à côte');
    const fullscreen = button('⛶ Plein écran','Afficher en plein écran');
    // L'écriture (outils de réponse) se fait page par page : la double page est réservée à la lecture.
    if (formOptions || pages < 2) twoPages.hidden = true;
    display.append(wholePage,fullWidth,twoPages,fullscreen);
    controls.append(navigation,zoomControls,display,orientation);
    const scroll = document.createElement('div'); scroll.className = 'student-pdf-scroll';
    const spreadRow = document.createElement('div'); spreadRow.className = 'student-pdf-spread';
    const first = pageSurface(''), second = pageSurface('student-pdf-second');
    const fieldLayer = document.createElement('div'); fieldLayer.className = 'student-pdf-field-layer';
    first.stage.append(fieldLayer);
    second.stage.hidden = true;
    spreadRow.append(first.stage,second.stage); scroll.append(spreadRow); panel.append(controls,scroll); mount.replaceChildren(panel);
    const stage = first.stage;
    const formController = window.MelecPdfForms?.create(panel,stage,fieldLayer,mayRead,formOptions) || null;
    openViewers++;
    const onContextMenu = event => { if (!editable(event.target)) event.preventDefault(); };
    const onDragStart = event => { if (!editable(event.target)) event.preventDefault(); };
    panel.addEventListener('contextmenu',onContextMenu);
    panel.addEventListener('dragstart',onDragStart);

    const isFullscreen = () => fallbackFullscreen || fullscreenElement() === panel;
    const spreadActive = () => spread && !formOptions && pages > 1 && (isFullscreen() ? panel.clientWidth : mount.clientWidth) >= 640;
    const step = () => spreadActive() ? 2 : 1;
    function layoutKey() {
      return [Math.floor(isFullscreen() ? panel.clientWidth : mount.clientWidth), Math.floor(window.innerHeight), Math.min(window.devicePixelRatio || 1, 2), isFullscreen()].join(':');
    }
    function available() {
      if (isFullscreen()) {
        // Hauteur de l'écran moins les barres d'outils du lecteur.
        let used = 16;
        for (const child of panel.children) if (child !== scroll && child.offsetParent !== null) used += child.offsetHeight + 5;
        return {width: Math.max(1, panel.clientWidth - 24), height: Math.max(240, window.innerHeight - used), cap: 4};
      }
      return {width: Math.max(1, mount.clientWidth - 12), height: Math.max(240, Math.min(window.innerHeight * .8, 900)), cap: 1.6};
    }
    async function draw(surface, page, viewport) {
      const {stage: target, canvas, textLayer} = surface;
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      target.style.width = viewport.width + 'px';
      target.style.height = viewport.height + 'px';
      target.style.setProperty('--scale-factor', String(viewport.scale));
      canvas.setAttribute('aria-label', 'Page ' + page.pageNumber + ' sur ' + pages);
      surface.task = page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0]});
      await surface.task.promise;
      if (closed) return;
      textLayer.replaceChildren();
      if (pdfjs.TextLayer && page.streamTextContent) {
        try {
          const selectable = new pdfjs.TextLayer({textContentSource:page.streamTextContent(), container:textLayer, viewport});
          await selectable.render();
        } catch (error) { console.warn('Sélection de texte PDF indisponible', error); }
      }
    }
    function refreshButtons() {
      const twoActive = spreadActive();
      previous.disabled = closed || current <= 1;
      next.disabled = closed || current + step() > pages;
      zoomOut.disabled = closed || zoom <= .5;
      zoomIn.disabled = closed || zoom >= 2.5;
      wholePage.setAttribute('aria-pressed', String(fit === 'page' && zoom === 1));
      fullWidth.setAttribute('aria-pressed', String(fit === 'width' && zoom === 1));
      twoPages.setAttribute('aria-pressed', String(twoActive));
      twoPages.textContent = spread ? '1 page' : '2 pages';
      twoPages.title = spread ? 'Revenir à une seule page' : 'Afficher deux pages côte à côte';
      twoPages.setAttribute('aria-label', twoPages.title);
      fullscreen.textContent = isFullscreen() ? '✕ Quitter le plein écran' : '⛶ Plein écran';
    }
    async function showPage(pageNumber) {
      if (closed || !mayRead()) return;
      if (busy) { pendingPage = pageNumber; return; }
      busy = true; previous.disabled = true; next.disabled = true;
      try {
        const twoActive = spreadActive();
        // En double page, les pages vont par paires : 1-2, 3-4, 5-6…
        if (twoActive) pageNumber -= (pageNumber - 1) % 2;
        pageNumber = Math.max(1, Math.min(pages, pageNumber));
        const page = await documentPdf.getPage(pageNumber);
        const partner = twoActive && pageNumber < pages ? await documentPdf.getPage(pageNumber + 1) : null;
        if (closed || !mayRead()) return;
        const changingPage = pageNumber !== current;
        const horizontalFocus = scroll.scrollWidth > 0 ? (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth : .5;
        const verticalFocus = scroll.scrollHeight > scroll.clientHeight ? (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight : 0;
        const natural = page.getViewport({scale:1});
        const partnerNatural = partner ? partner.getViewport({scale:1}) : null;
        // Proportions réelles de chaque page conservées (paysage, rotation).
        const room = available();
        const gap = twoActive ? 10 : 0;
        const totalWidth = twoActive ? natural.width + (partnerNatural ? partnerNatural.width : natural.width) : natural.width;
        const tallest = Math.max(natural.height, partnerNatural ? partnerNatural.height : 0);
        const widthScale = (room.width - gap) / totalWidth;
        const fitScale = fit === 'width' ? Math.min(widthScale, room.cap) : Math.min(widthScale, room.height / tallest, room.cap);
        const scale = fitScale * zoom;
        spreadRow.classList.toggle('is-spread', twoActive);
        second.stage.hidden = !partner;
        const work = [draw(first, page, page.getViewport({scale}))];
        if (partner) work.push(draw(second, partner, partner.getViewport({scale})));
        await Promise.all(work);
        if (closed) return;
        if (formController) await formController.renderPage(page,page.getViewport({scale}),pageNumber);
        current = pageNumber;
        pageCount.textContent = (partner ? current + '-' + (current + 1) : current) + ' / ' + pages;
        orientation.textContent = natural.width > natural.height ? 'Paysage' : 'Portrait';
        zoomValue.textContent = Math.round(zoom * 100) + ' %';
        scroll.scrollLeft = changingPage ? Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2) : horizontalFocus * scroll.scrollWidth - scroll.clientWidth / 2;
        scroll.scrollTop = changingPage ? 0 : verticalFocus * scroll.scrollHeight - scroll.clientHeight / 2;
        lastLayout = layoutKey();
      } finally {
        busy = false;
        refreshButtons();
        if (!closed && pendingPage !== null) {
          const requested = pendingPage; pendingPage = null;
          Promise.resolve().then(() => showPage(requested)).catch(error => { pageCount.textContent = error.message; });
        }
      }
    }
    const report = error => { pageCount.textContent = error.message; };
    previous.onclick = () => showPage(current - step()).catch(report);
    next.onclick = () => showPage(current + step()).catch(report);
    function setZoom(value) {
      zoom = Math.max(.5, Math.min(2.5, value));
      zoomValue.textContent = Math.round(zoom * 100) + ' %';
      showPage(current).catch(report);
    }
    zoomOut.onclick = () => setZoom(zoom - .25);
    zoomIn.onclick = () => setZoom(zoom + .25);
    wholePage.onclick = () => { fit = 'page'; setZoom(1); };
    fullWidth.onclick = () => { fit = 'width'; setZoom(1); };
    twoPages.onclick = () => { spread = !spread; showPage(current).catch(report); };
    function setFallbackFullscreen(on) {
      fallbackFullscreen = on;
      panel.classList.toggle('student-pdf-fullscreen', on);
      document.documentElement.classList.toggle('student-pdf-fullscreen-open', on);
      showPage(current).catch(report);
    }
    fullscreen.onclick = async () => {
      if (fallbackFullscreen) return setFallbackFullscreen(false);
      if (fullscreenElement() === panel) {
        try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {}
        return;
      }
      const request = panel.requestFullscreen || panel.webkitRequestFullscreen;
      // iPhone : pas de plein écran natif pour un élément, le lecteur occupe alors toute la fenêtre.
      if (!request) return setFallbackFullscreen(true);
      try { await request.call(panel); } catch { setFallbackFullscreen(true); }
    };
    const onFullscreenChange = () => { if (!closed) showPage(current).catch(report); };
    document.addEventListener('fullscreenchange',onFullscreenChange);
    document.addEventListener('webkitfullscreenchange',onFullscreenChange);
    const onKeydown = event => {
      if (fallbackFullscreen && event.key === 'Escape') { event.stopPropagation(); setFallbackFullscreen(false); }
    };
    document.addEventListener('keydown',onKeydown,true);
    // Sur écran tactile, glisser verticalement change de page quand la page tient à l'écran.
    let touchStart = null;
    const onTouchStart = event => {
      if (formOptions || zoom !== 1 || scroll.scrollHeight > scroll.clientHeight + 8) return;
      const point = event.touches[0];
      touchStart = point ? {x:point.clientX,y:point.clientY} : null;
    };
    const onTouchEnd = event => {
      if (!touchStart || formOptions || zoom !== 1 || scroll.scrollHeight > scroll.clientHeight + 8) return;
      const point = event.changedTouches[0];
      if (!point) return;
      const dx = point.clientX - touchStart.x, dy = point.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dy) < 70 || Math.abs(dx) > 45) return;
      const target = dy < 0 ? current + step() : current - step();
      if (target >= 1 && target <= pages) showPage(target).catch(report);
    };
    scroll.addEventListener('touchstart',onTouchStart,{passive:true});
    scroll.addEventListener('touchend',onTouchEnd,{passive:true});
    const onResize = () => { if (layoutKey() !== lastLayout) showPage(current).catch(() => {}); };
    window.addEventListener('resize',onResize);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(mount);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      openViewers = Math.max(0, openViewers - 1);
      if (fullscreenElement() === panel) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
      document.documentElement.classList.remove('student-pdf-fullscreen-open');
      window.removeEventListener('resize',onResize);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange',onFullscreenChange);
      document.removeEventListener('keydown',onKeydown,true);
      scroll.removeEventListener('touchstart',onTouchStart);
      scroll.removeEventListener('touchend',onTouchEnd);
      panel.removeEventListener('contextmenu',onContextMenu);
      panel.removeEventListener('dragstart',onDragStart);
      observer?.disconnect();
      first.task?.cancel(); second.task?.cancel();
      formController?.cleanup();
      documentPdf.destroy().catch(() => {});
      panel.remove();
    };
    cleanup.flush = () => formController?.flush() || Promise.resolve();
    try { await showPage(1); } catch (error) { cleanup(); throw error; }
    return cleanup;
  }
  window.MelecStudentPdf = {render};
})();
