(function () {
  'use strict';
  let libraryPromise;
  function library() {
    if (!libraryPromise) libraryPromise = import('./pdf.min.mjs').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', document.baseURI).href;
      return pdfjs;
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }

  async function render(blob, mount, mayRead = () => true) {
    const pdfjs = await library();
    if (!mayRead()) throw new Error('L’accès à ce document a expiré.');
    const task = pdfjs.getDocument({data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableScripting: false});
    const documentPdf = await task.promise;
    let closed = false, busy = false, current = 1, currentRender = null, pendingPage = null, lastLayout = '';
    const panel = document.createElement('div'); panel.className = 'student-pdf-panel';
    const controls = document.createElement('div'); controls.className = 'student-pdf-controls';
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '← Page précédente';
    const pageCount = document.createElement('span'); pageCount.setAttribute('aria-live','polite');
    const orientation = document.createElement('span'); orientation.className = 'student-pdf-orientation';
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Page suivante →';
    controls.append(previous,pageCount,orientation,next);
    const canvas = document.createElement('canvas'); canvas.className = 'student-pdf-page'; canvas.setAttribute('role','img');
    panel.append(controls,canvas); mount.replaceChildren(panel);
    // This removes the browser's ordinary "Save image as" menu on the canvas.
    // It is a UI deterrent, not protection against screenshots or developer tools.
    panel.addEventListener('contextmenu', event => event.preventDefault(), true);
    panel.addEventListener('dragstart', event => event.preventDefault(), true);
    function layoutKey() {
      return [Math.floor(mount.clientWidth), Math.floor(window.innerHeight), Math.min(window.devicePixelRatio || 1, 2)].join(':');
    }
    async function showPage(pageNumber) {
      if (closed || !mayRead()) return;
      if (busy) { pendingPage = pageNumber; return; }
      busy = true; previous.disabled = true; next.disabled = true;
      try {
        const page = await documentPdf.getPage(pageNumber);
        if (closed || !mayRead()) return;
        const natural = page.getViewport({scale:1});
        // Preserve the page's real proportions, including landscape pages and rotation.
        const availableWidth = Math.max(1, Math.min(mount.clientWidth - 20, 1200));
        const availableHeight = Math.max(160, Math.min(window.innerHeight * .78, 900));
        const viewport = page.getViewport({scale: Math.min(availableWidth / natural.width, availableHeight / natural.height)});
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        canvas.setAttribute('aria-label', 'Page ' + pageNumber + ' sur ' + documentPdf.numPages);
        currentRender = page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0]});
        await currentRender.promise;
        if (closed) return;
        current = pageNumber;
        pageCount.textContent = 'Page ' + current + ' / ' + documentPdf.numPages;
        orientation.textContent = natural.width > natural.height ? 'Paysage' : 'Portrait';
        lastLayout = layoutKey();
      } finally {
        busy = false;
        previous.disabled = closed || current <= 1;
        next.disabled = closed || current >= documentPdf.numPages;
        if (!closed && pendingPage !== null) {
          const requested = pendingPage; pendingPage = null;
          Promise.resolve().then(() => showPage(requested)).catch(error => { pageCount.textContent = error.message; });
        }
      }
    }
    previous.onclick = () => showPage(current - 1).catch(error => { pageCount.textContent = error.message; });
    next.onclick = () => showPage(current + 1).catch(error => { pageCount.textContent = error.message; });
    const onResize = () => { if (layoutKey() !== lastLayout) showPage(current).catch(() => {}); };
    window.addEventListener('resize',onResize);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(mount);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener('resize',onResize);
      observer?.disconnect();
      currentRender?.cancel();
      documentPdf.destroy().catch(() => {});
      panel.remove();
    };
    try { await showPage(1); } catch (error) { cleanup(); throw error; }
    return cleanup;
  }
  window.MelecStudentPdf = {render};
})();
