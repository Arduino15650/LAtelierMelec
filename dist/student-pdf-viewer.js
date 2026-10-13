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

  async function render(blob, mount, mayRead = () => true, formOptions = null) {
    const pdfjs = await library();
    if (!mayRead()) throw new Error('L’accès à ce document a expiré.');
    const task = pdfjs.getDocument({data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableScripting: false});
    const documentPdf = await task.promise;
    let closed = false, busy = false, current = 1, zoom = 1, currentRender = null, pendingPage = null, lastLayout = '';
    const panel = document.createElement('div'); panel.className = 'student-pdf-panel';
    const controls = document.createElement('div'); controls.className = 'student-pdf-controls';
    const navigation = document.createElement('div'); navigation.className = 'student-pdf-navigation';
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '←'; previous.title='Page précédente'; previous.setAttribute('aria-label','Page précédente');
    const pageCount = document.createElement('span'); pageCount.className = 'student-pdf-page-count'; pageCount.setAttribute('aria-live','polite');
    const orientation = document.createElement('span'); orientation.className = 'student-pdf-sr-only';
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '→'; next.title='Page suivante'; next.setAttribute('aria-label','Page suivante');
    navigation.append(previous,pageCount,next);
    const zoomControls = document.createElement('div'); zoomControls.className = 'student-pdf-zoom';
    const zoomOut = document.createElement('button'); zoomOut.type = 'button'; zoomOut.textContent = '−'; zoomOut.title='Dézoomer'; zoomOut.setAttribute('aria-label','Dézoomer');
    const zoomValue = document.createElement('output'); zoomValue.setAttribute('aria-live','polite'); zoomValue.textContent = '100 %';
    const zoomIn = document.createElement('button'); zoomIn.type = 'button'; zoomIn.textContent = '+'; zoomIn.title='Zoomer'; zoomIn.setAttribute('aria-label','Zoomer');
    const fit = document.createElement('button'); fit.type = 'button'; fit.textContent = 'Ajuster'; fit.title='Adapter à l’écran';
    zoomControls.append(zoomOut,zoomValue,zoomIn,fit);
    controls.append(navigation,zoomControls,orientation);
    const scroll = document.createElement('div'); scroll.className = 'student-pdf-scroll';
    const stage = document.createElement('div'); stage.className = 'student-pdf-stage';
    const canvas = document.createElement('canvas'); canvas.className = 'student-pdf-page'; canvas.setAttribute('role','img');
    const textLayer = document.createElement('div'); textLayer.className = 'student-pdf-text-layer textLayer';
    const fieldLayer = document.createElement('div'); fieldLayer.className = 'student-pdf-field-layer';
    stage.append(canvas,textLayer,fieldLayer); scroll.append(stage); panel.append(controls,scroll); mount.replaceChildren(panel);
    const formController = window.MelecPdfForms?.create(panel,stage,fieldLayer,mayRead,formOptions) || null;
    function layoutKey() {
      return [Math.floor(mount.clientWidth), Math.floor(window.innerHeight), Math.min(window.devicePixelRatio || 1, 2)].join(':');
    }
    async function showPage(pageNumber) {
      if (closed || !mayRead()) return;
      if (busy) { pendingPage = pageNumber; return; }
      busy = true; previous.disabled = true; next.disabled = true;
      zoomOut.disabled = true; zoomIn.disabled = true; fit.disabled = true;
      try {
        const page = await documentPdf.getPage(pageNumber);
        if (closed || !mayRead()) return;
        const changingPage = pageNumber !== current;
        const horizontalFocus = scroll.scrollWidth > 0 ? (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth : .5;
        const verticalFocus = scroll.scrollHeight > scroll.clientHeight ? (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight : 0;
        const natural = page.getViewport({scale:1});
        // Preserve the page's real proportions, including landscape pages and rotation.
        const availableWidth = Math.max(1, mount.clientWidth - 12);
        const availableHeight = Math.max(240, Math.min(window.innerHeight * .72, 850));
        // At 100 %, keep the whole page visible and cap enlargement on large screens.
        // The explicit zoom buttons remain available up to 250 %.
        const fitScale = Math.min(availableWidth / natural.width, availableHeight / natural.height, 1.3);
        const viewport = page.getViewport({scale: fitScale * zoom});
        const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        stage.style.width = viewport.width + 'px';
        stage.style.height = viewport.height + 'px';
        stage.style.setProperty('--scale-factor', String(viewport.scale));
        canvas.setAttribute('aria-label', 'Page ' + pageNumber + ' sur ' + documentPdf.numPages);
        currentRender = page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0]});
        await currentRender.promise;
        if (closed) return;
        textLayer.replaceChildren();
        if (pdfjs.TextLayer && page.streamTextContent) {
          try {
            const selectable = new pdfjs.TextLayer({
              textContentSource:page.streamTextContent(), container:textLayer, viewport
            });
            await selectable.render();
          } catch (error) { console.warn('Sélection de texte PDF indisponible', error); }
        }
        if (formController) await formController.renderPage(page,viewport,pageNumber);
        current = pageNumber;
        pageCount.textContent = current + ' / ' + documentPdf.numPages;
        orientation.textContent = natural.width > natural.height ? 'Paysage' : 'Portrait';
        zoomValue.textContent = Math.round(zoom * 100) + ' %';
        scroll.scrollLeft = changingPage ? Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2) : horizontalFocus * scroll.scrollWidth - scroll.clientWidth / 2;
        scroll.scrollTop = changingPage ? 0 : verticalFocus * scroll.scrollHeight - scroll.clientHeight / 2;
        lastLayout = layoutKey();
      } finally {
        busy = false;
        previous.disabled = closed || current <= 1;
        next.disabled = closed || current >= documentPdf.numPages;
        zoomOut.disabled = closed || zoom <= .5;
        zoomIn.disabled = closed || zoom >= 2.5;
        fit.disabled = closed || zoom === 1;
        if (!closed && pendingPage !== null) {
          const requested = pendingPage; pendingPage = null;
          Promise.resolve().then(() => showPage(requested)).catch(error => { pageCount.textContent = error.message; });
        }
      }
    }
    previous.onclick = () => showPage(current - 1).catch(error => { pageCount.textContent = error.message; });
    next.onclick = () => showPage(current + 1).catch(error => { pageCount.textContent = error.message; });
    function setZoom(value) {
      zoom = Math.max(.5, Math.min(2.5, value));
      zoomValue.textContent = Math.round(zoom * 100) + ' %';
      showPage(current).catch(error => { pageCount.textContent = error.message; });
    }
    zoomOut.onclick = () => setZoom(zoom - .25);
    zoomIn.onclick = () => setZoom(zoom + .25);
    fit.onclick = () => setZoom(1);
    // On touch screens, the read-only viewer also supports a vertical swipe
    // between pages when the current fitted page does not need scrolling.
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
      const target = dy < 0 ? current + 1 : current - 1;
      if (target >= 1 && target <= documentPdf.numPages) showPage(target).catch(error => { pageCount.textContent = error.message; });
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
      window.removeEventListener('resize',onResize);
      scroll.removeEventListener('touchstart',onTouchStart);
      scroll.removeEventListener('touchend',onTouchEnd);
      observer?.disconnect();
      currentRender?.cancel();
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
