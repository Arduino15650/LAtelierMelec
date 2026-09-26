(function () {
  'use strict';
  let pdfPreviewClose = null;
  function closePdfPreview() {
    if (pdfPreviewClose) pdfPreviewClose();
  }
  function openPdfPreview(blob, title, category) {
    closePdfPreview();
    const url = URL.createObjectURL(blob);
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const pane = document.createElement('section');
    pane.className = 'student-pdf-preview';
    pane.setAttribute('role', 'dialog');
    pane.setAttribute('aria-modal', 'true');
    pane.setAttribute('aria-label', 'Aperçu du PDF ' + title);
    const heading = document.createElement('div'); heading.className = 'student-pdf-preview-heading';
    const label = document.createElement('strong'); label.textContent = 'Aperçu · ' + category + ' · ' + title;
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'Fermer';
    heading.append(label, closeButton);
    const card = document.createElement('div'); card.className = 'student-pdf-preview-card';
    const actions = document.createElement('div'); actions.className = 'student-pdf-preview-actions';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Réduire le PDF';
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Ouvrir / imprimer ce PDF';
    actions.append(toggle, link);
    const frame = document.createElement('iframe'); frame.src = url + '#toolbar=1&navpanes=0';
    frame.title = title; frame.className = 'student-pdf-preview-frame';
    card.append(actions, frame); pane.append(heading, card); document.body.append(pane);
    document.body.style.overflow = 'hidden';
    const onKeydown = event => { if (event.key === 'Escape') closePdfPreview(); };
    document.addEventListener('keydown', onKeydown);
    pdfPreviewClose = () => {
      document.removeEventListener('keydown', onKeydown);
      pane.remove();
      document.body.style.overflow = previousOverflow;
      URL.revokeObjectURL(url);
      pdfPreviewClose = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    closeButton.onclick = closePdfPreview;
    toggle.onclick = () => {
      frame.hidden = !frame.hidden;
      toggle.textContent = frame.hidden ? 'Afficher le PDF' : 'Réduire le PDF';
    };
    closeButton.focus();
  }
  window.MelecPdfPreview = {open:openPdfPreview, close:closePdfPreview};
  const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','STRIKE','SUB','SUP','SPAN','FONT','H2','H3','H4','UL','OL','LI','BLOCKQUOTE','TABLE','THEAD','TBODY','TR','TH','TD','A']);
  const fonts = new Set(['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS']);
  const sizes = {'1':'10px','2':'12px','3':'14px','4':'16px','5':'18px','6':'24px','7':'32px'};
  function safeColor(value) {
    const color = String(value || '').trim();
    return /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(color) ? color : '';
  }
  function sanitize(html) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
      if (!allowed.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        [...node.childNodes].forEach(child => fragment.append(clean(child)));
        return fragment;
      }
      const output = document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName.toLowerCase());
      const style = node.style;
      const face = node.getAttribute('face') || style.fontFamily.replaceAll('"','').replaceAll("'",'');
      if (fonts.has(face)) output.style.fontFamily = face;
      const size = node.tagName === 'FONT' ? sizes[node.getAttribute('size')] : style.fontSize;
      if (size && (/^(10|12|14|16|18|20|24|28|32|36|48)px$/.test(size) || Object.values(sizes).includes(size))) output.style.fontSize = size;
      const color = safeColor(node.getAttribute('color') || style.color);
      const background = safeColor(style.backgroundColor);
      if (color) output.style.color = color;
      if (background) output.style.backgroundColor = background;
      if (['left','center','right','justify'].includes(style.textAlign) && ['P','DIV','H2','H3','H4'].includes(node.tagName)) output.style.textAlign = style.textAlign;
      if (node.tagName === 'A') {
        try {
          const url = new URL(node.getAttribute('href') || '', location.href);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            output.href = url.href; output.target = '_blank'; output.rel = 'noopener noreferrer';
          }
        } catch { /* URL invalide */ }
      }
      if (node.tagName === 'TD' || node.tagName === 'TH') {
        const colspan = Number(node.getAttribute('colspan'));
        if (Number.isInteger(colspan) && colspan > 1 && colspan <= 6) output.colSpan = colspan;
      }
      [...node.childNodes].forEach(child => output.append(clean(child)));
      return output;
    }
    const safe = document.createElement('div');
    [...parsed.body.childNodes].forEach(node => safe.append(clean(node)));
    return safe.innerHTML;
  }
  function videoUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      if (url.hostname === 'youtu.be') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(url.pathname.slice(1));
      if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) {
        const id = url.searchParams.get('v');
        if (id) return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id);
      }
      if (['vimeo.com','www.vimeo.com'].includes(url.hostname)) return 'https://player.vimeo.com/video/' + encodeURIComponent(url.pathname.slice(1));
    } catch { /* URL invalide */ }
    return null;
  }
  async function render(blocks, target, assets = []) {
    target.replaceChildren();
    target.classList.add('lesson-content');
    const assetMap = new Map(assets.map(asset => [asset.id, asset]));
    const urls = [];
    for (const block of Array.isArray(blocks) ? blocks : []) {
      const wrapper = document.createElement('div'); wrapper.className = 'lesson-block';
      if (block.type === 'html') {
        wrapper.innerHTML = sanitize(block.html);
      } else if (block.type === 'table') {
        const table = document.createElement('table');
        for (const row of Array.isArray(block.rows) ? block.rows.slice(0,30) : []) {
          const tr = table.insertRow();
          for (const cell of Array.isArray(row) ? row.slice(0,12) : []) tr.insertCell().textContent = String(cell ?? '').slice(0,1000);
        }
        wrapper.append(table);
      } else if (block.type === 'video') {
        const safeUrl = videoUrl(block.url);
        if (safeUrl) {
          const iframe = document.createElement('iframe'); iframe.src = safeUrl;
          iframe.loading = 'lazy'; iframe.allow = 'fullscreen; picture-in-picture'; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          iframe.title = 'Vidéo du cours'; wrapper.append(iframe);
        }
      } else if (block.type === 'asset') {
        const asset = assetMap.get(block.assetId);
        if (asset) {
          const box = document.createElement('div'); box.className = 'lesson-file'; box.style.display = 'grid'; box.style.justifyItems = 'start';
          const customTitle = String(block.title || '').trim().slice(0,180);
          const comment = String(block.comment || '').trim().slice(0,500);
          if (block.titleHtml || customTitle) { const label = document.createElement('div'); label.className = 'lesson-file-title'; label.innerHTML = sanitize(block.titleHtml || customTitle); box.append(label); }
          if (String(asset.mime_type || '').startsWith('image/')) {
            const image = document.createElement('img');
            image.className = 'lesson-image'; image.alt = customTitle || 'Image du cours'; image.style.maxWidth = '100%'; image.style.height = 'auto';
            const width = Number(block.width);
            if (Number.isInteger(width) && width >= 25 && width <= 100) image.style.width = width + '%';
            try {
              const blob = asset.local_blob || await MelecPortal.download(asset.object_path);
              const url = URL.createObjectURL(blob); urls.push(url); image.src = url;
              box.append(image);
            } catch (error) { const note = document.createElement('span'); note.textContent = 'Image inaccessible : ' + error.message; box.append(note); }
          } else if (asset.mime_type === 'application/pdf') {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Consulter';
            button.onclick = async () => {
              button.disabled = true;
              try {
                const blob = asset.local_blob || await MelecPortal.download(asset.object_path);
                openPdfPreview(blob, customTitle || asset.file_name, 'Cours et TD');
              } catch (error) { alert(error.message); }
              finally { button.disabled = false; }
            };
            box.append(button);
          } else {
            const note = document.createElement('span'); note.textContent = 'Consultation Word en préparation'; box.append(note);
          }
          if (block.commentHtml || comment) { const caption = document.createElement('div'); caption.className = 'lesson-file-comment'; caption.innerHTML = sanitize(block.commentHtml || comment); box.append(caption); }
          wrapper.append(box);
        }
      }
      target.append(wrapper);
    }
    return () => { closePdfPreview(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }
  window.MelecContent = { sanitize, videoUrl, render };
})();
