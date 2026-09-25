(function () {
  'use strict';
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
          const box = document.createElement('div'); box.className = 'lesson-file';
          const label = document.createElement('strong'); label.textContent = asset.file_name; box.append(label);
          if (String(asset.mime_type || '').startsWith('image/')) {
            const image = document.createElement('img');
            image.className = 'lesson-image'; image.alt = asset.file_name;
            try {
              const blob = asset.local_blob || await MelecPortal.download(asset.object_path);
              const url = URL.createObjectURL(blob); urls.push(url); image.src = url;
              box.append(image);
            } catch (error) { const note = document.createElement('span'); note.textContent = 'Image inaccessible : ' + error.message; box.append(note); }
          } else if (asset.mime_type === 'application/pdf') {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Consulter';
            button.onclick = async () => {
              const opened = box.querySelector('iframe');
              if (opened) { opened.remove(); button.textContent = 'Consulter'; button.setAttribute('aria-expanded','false'); return; }
              button.disabled = true;
              try {
                const blob = asset.local_blob || await MelecPortal.download(asset.object_path);
                const url = URL.createObjectURL(blob); urls.push(url);
                const viewer = asset.mime_type === 'application/pdf' ? document.createElement('iframe') : document.createElement('img');
                viewer.src = url + (asset.mime_type === 'application/pdf' ? '#toolbar=0&navpanes=0' : '');
                viewer.title = asset.file_name; viewer.loading = 'lazy'; box.append(viewer);
                button.textContent = 'Réduire le PDF'; button.setAttribute('aria-expanded','true');
              } catch (error) { alert(error.message); }
              finally { button.disabled = false; }
            };
            box.append(button);
          } else {
            const note = document.createElement('span'); note.textContent = 'Consultation Word en préparation'; box.append(note);
          }
          wrapper.append(box);
        }
      }
      target.append(wrapper);
    }
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }
  window.MelecContent = { sanitize, videoUrl, render };
})();
