(function () {
  'use strict';
  let libraries;
  function loadLibraries() {
    if (!libraries) libraries = Promise.all([
      import('./pdf.min.mjs'),
      new Promise((resolve, reject) => {
        if (window.jspdf?.jsPDF) return resolve(window.jspdf.jsPDF);
        const script = document.createElement('script');
        script.src = './jspdf.umd.min.js';
        script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('Moteur d’export PDF indisponible.'));
        script.onerror = () => reject(new Error('Chargement du moteur d’export PDF impossible.'));
        document.head.append(script);
      })
    ]).then(([pdfjs, jsPDF]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', document.baseURI).href;
      return {pdfjs, jsPDF};
    }).catch(error => { libraries = null; throw error; });
    return libraries;
  }
  const bounded = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  function paint(canvas, pageEntries, scale) {
    const ctx = canvas.getContext('2d');
    for (const entry of pageEntries) {
      if (!entry || !['text','check','stroke'].includes(entry.type)) continue;
      const x = bounded(entry.x,0,1) * canvas.width;
      const y = bounded(entry.y,0,1) * canvas.height;
      if (entry.type === 'text') {
        const value = String(entry.value || '').slice(0,1500);
        if (!value) continue;
        const width = bounded(entry.w,.015,1) * canvas.width;
        const height = bounded(entry.h,.015,1) * canvas.height;
        const fontSize = bounded(Math.min(14 * scale, height / 2), 9 * scale, 18 * scale);
        ctx.save(); ctx.beginPath(); ctx.rect(x,y,width,height); ctx.clip();
        ctx.fillStyle = '#102e4b'; ctx.font = `${fontSize}px Arial, sans-serif`;
        const lineHeight = fontSize * 1.2;
        let lineY = y + fontSize;
        for (const paragraph of value.split(/\r?\n/)) {
          let line = '';
          for (const word of paragraph.split(/\s+/)) {
            const next = line ? line + ' ' + word : word;
            if (line && ctx.measureText(next).width > width - 4 * scale) {
              ctx.fillText(line,x + 2 * scale,lineY); lineY += lineHeight; line = word;
            } else line = next;
          }
          ctx.fillText(line,x + 2 * scale,lineY); lineY += lineHeight;
        }
        ctx.restore();
      } else if (entry.type === 'check' && entry.value) {
        ctx.save(); ctx.strokeStyle = '#000000'; ctx.lineWidth = Math.max(2,2 * scale);
        const size = Math.max(9 * scale,Math.min(bounded(entry.w,.015,1) * canvas.width,bounded(entry.h,.015,1) * canvas.height));
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+size,y+size); ctx.moveTo(x+size,y); ctx.lineTo(x,y+size); ctx.stroke(); ctx.restore();
      } else if (entry.type === 'stroke' && Array.isArray(entry.points) && entry.points.length > 1) {
        ctx.save(); ctx.strokeStyle = /^#[0-9a-f]{6}$/i.test(entry.color || '') ? entry.color : '#d12b2b';
        ctx.lineWidth = bounded(entry.width,1,8) * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); entry.points.slice(0,400).forEach((point,index) => {
          const px = bounded(point?.[0],0,1) * canvas.width, py = bounded(point?.[1],0,1) * canvas.height;
          if (!index) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }); ctx.stroke(); ctx.restore();
      }
    }
  }
  async function download(sourceBlob, entries, filename, onProgress = () => {}) {
    const {pdfjs,jsPDF} = await loadLibraries();
    const task = pdfjs.getDocument({data:new Uint8Array(await sourceBlob.arrayBuffer()),isEvalSupported:false,enableScripting:false});
    const source = await task.promise;
    let output;
    try {
      for (let number=1; number<=source.numPages; number++) {
        onProgress(`Préparation du PDF : page ${number} / ${source.numPages}…`);
        const page = await source.getPage(number);
        const natural = page.getViewport({scale:1});
        const scale = Math.min(1.6,Math.sqrt(8000000 / (natural.width * natural.height)));
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        paint(canvas,(Array.isArray(entries) ? entries : []).filter(entry => entry.page === number),scale);
        if (!output) output = new jsPDF({unit:'pt',format:[natural.width,natural.height],orientation:natural.width>natural.height?'landscape':'portrait',compress:true});
        else output.addPage([natural.width,natural.height],natural.width>natural.height?'landscape':'portrait');
        output.addImage(canvas.toDataURL('image/jpeg',.88),'JPEG',0,0,natural.width,natural.height,undefined,'FAST');
        canvas.width = canvas.height = 0;
        if (number % 4 === 0) await new Promise(resolve => setTimeout(resolve,0));
      }
      const safe = String(filename || 'TP-complete.pdf').replace(/[\\/:*?"<>|]/g,'-').slice(0,150);
      output.save(safe.toLowerCase().endsWith('.pdf') ? safe : safe + '.pdf');
      onProgress('PDF complété téléchargé.');
    } finally { await source.destroy(); }
  }
  window.MelecTpResponseExport = {download};
})();
