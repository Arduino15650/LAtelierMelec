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
    let closed = false, busy = false, current = 1, currentRender = null;
    const panel = document.createElement('div'); panel.className = 'student-pdf-panel';
    const controls = document.createElement('div'); controls.className = 'student-pdf-controls';
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '← Page précédente';
    const pageCount = document.createElement('span'); pageCount.setAttribute('aria-live','polite');
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Page suivante →';
    controls.append(previous,pageCount,next);
    const canvas = document.createElement('canvas'); canvas.className = 'student-pdf-page'; canvas.setAttribute('role','img');
    panel.append(controls,canvas); mount.replaceChildren(panel);
    async function showPage(pageNumber) {
      if (closed || busy || !mayRead()) return;
      busy = true; previous.disabled = true; next.disabled = true;
      try {
        const page = await documentPdf.getPage(pageNumber);
        if (closed || !mayRead()) return;
        const natural = page.getViewport({scale:1});
        const available = Math.max(250, Math.min(mount.clientWidth - 16, 1100));
        const viewport = page.getViewport({scale: available / natural.width});
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
      } finally {
        busy = false;
        previous.disabled = closed || current <= 1;
        next.disabled = closed || current >= documentPdf.numPages;
      }
    }
    previous.onclick = () => showPage(current - 1).catch(error => { pageCount.textContent = error.message; });
    next.onclick = () => showPage(current + 1).catch(error => { pageCount.textContent = error.message; });
    const onResize = () => showPage(current).catch(() => {});
    window.addEventListener('resize',onResize);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener('resize',onResize);
      currentRender?.cancel();
      documentPdf.destroy().catch(() => {});
      panel.remove();
    };
    try { await showPage(1); } catch (error) { cleanup(); throw error; }
    return cleanup;
  }
  window.MelecStudentPdf = {render};
})();
