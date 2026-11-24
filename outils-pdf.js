/* L'Atelier MELEC · Mes outils : mise en page A4 (ajustement sur une page, sauts de page)
   et création du PDF.

   Le PDF est redessiné à partir de la page affichée : chaque mot est placé à sa position
   exacte, en texte réel (sélectionnable, lisible par les logiciels de recrutement), avec les
   polices intégrées au PDF (Helvetica, Times, Courier) : le fichier reste très léger.
   Fonds, filets, barres de niveau et pastilles sont redessinés en vectoriel ; la photo et
   la signature sont compressées. */
(function () {
  'use strict';
  const R = () => window.MelecOutilsRendu;
  const PAGE_W = 794, PAGE_H = 1123, PT = 595.28 / 794;
  const FAMILY = { arimo: 'helvetica', arial: 'helvetica', helvetica: 'helvetica', 'liberation sans': 'helvetica', tinos: 'times', 'times new roman': 'times', times: 'times', 'liberation serif': 'times', cousine: 'courier', 'courier new': 'courier', courier: 'courier', 'liberation mono': 'courier' };
  const DESCENT = { helvetica: 0.212, times: 0.216, courier: 0.3 };

  // ───── Feuille de style de la page (zone isolée) et polices ─────
  let sheetPromise = null;
  function pageSheet() {
    if (!sheetPromise) sheetPromise = fetch('./outils-mise-en-page.css?v=20261124-6').then(r => { if (!r.ok) throw new Error('Mise en page indisponible'); return r.text(); })
      .then(css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); return sheet; })
      .catch(error => { sheetPromise = null; throw error; });
    return sheetPromise;
  }
  let fontsPromise = null;
  function loadFonts() {
    if (!fontsPromise) {
      if (!document.querySelector('link[data-outils-fonts]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.dataset.outilsFonts = '1';
        link.href = 'https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400;0,700;1,400;1,700&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&family=Cousine:wght@400;700&display=swap';
        document.head.append(link);
      }
      const wanted = ['400 12px Arimo', '700 12px Arimo', 'italic 400 12px Arimo', '400 12px Tinos', '700 12px Tinos', 'italic 400 12px Tinos', '400 12px Cousine', '700 12px Cousine'];
      const all = Promise.all(wanted.map(f => document.fonts.load(f).catch(() => null)));
      fontsPromise = Promise.race([all, new Promise(resolve => setTimeout(resolve, 4000))]).then(() => document.fonts.ready);
    }
    return fontsPromise;
  }
  // Polices embarquées (fichiers /fonts) : chargées à la demande, pour l'aperçu et pour le PDF.
  const faceCache = new Map();
  function fontInfo(key) { return R().FONT_LIST.find(f => f[0] === key); }
  function ensureFont(key) {
    const f = fontInfo(key);
    if (!f || !f[3]) return Promise.resolve();
    if (!faceCache.has(key)) {
      const faces = [...f[3]].map(st => new FontFace('OT-' + key, 'url(./fonts/' + key + '-' + st + '.ttf)', { weight: st === 'b' ? '700' : '400', style: st === 'i' ? 'italic' : 'normal', display: 'swap' }));
      faceCache.set(key, Promise.all(faces.map(face => face.load().then(loaded => document.fonts.add(loaded)).catch(() => null))));
    }
    return faceCache.get(key);
  }
  async function useFonts(data) {
    const r = R().resolved(data);
    await Promise.race([Promise.all([ensureFont(r.headKey), ensureFont(r.bodyKey)]), new Promise(resolve => setTimeout(resolve, 6000))]);
  }
  const fileCache = new Map();
  async function fontFile(key, st) {
    const name = key + '-' + st;
    if (!fileCache.has(name)) fileCache.set(name, fetch('./fonts/' + name + '.ttf').then(r => { if (!r.ok) throw new Error('Police indisponible'); return r.arrayBuffer(); }).then(buf => {
      const bytes = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }).catch(error => { fileCache.delete(name); throw error; }));
    return fileCache.get(name);
  }
  async function mount(host, page) {
    const sheet = await pageSheet();
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    root.replaceChildren(page);
    return page;
  }

  // ───── Mise en page : ajustement et sauts de page ─────
  const DENSITY = { airy: 1.04, normal: 1, compact: 0.94 };
  function rel(el, page) {
    const p = page.getBoundingClientRect(), r = el.getBoundingClientRect(), s = p.width / PAGE_W || 1;
    return { top: (r.top - p.top) / s, bottom: (r.bottom - p.top) / s, left: (r.left - p.left) / s, right: (r.right - p.left) / s };
  }
  function contentHeight(page) {
    page.classList.add('od-measure');
    page.style.setProperty('--ph', '0px');
    const s = page.getBoundingClientRect().width / PAGE_W || 1;
    const height = page.getBoundingClientRect().height / s;
    page.classList.remove('od-measure');
    return height;
  }
  function firstKeepAfter(el) {
    let next = el.nextElementSibling;
    while (next && !next.getClientRects().length) next = next.nextElementSibling;
    if (!next) return null;
    return next.classList.contains('od-keep') ? next : next.querySelector('.od-keep') || next;
  }
  // Repousse sur la page suivante tout bloc (expérience, paragraphe, titre + premier élément)
  // qui serait coupé par le bas de page.
  function paginate(page, k) {
    const TOP = 40 * k, BOTTOM = 34 * k;
    page.querySelectorAll('[data-push]').forEach(el => { el.style.marginTop = ''; el.removeAttribute('data-push'); });
    const keeps = [...page.querySelectorAll('.od-keep')];
    for (let round = 0; round < 4; round++) {
      let changed = false;
      for (const el of keeps) {
        if (!el.getClientRects().length) continue;
        const r = rel(el, page);
        let bottom = r.bottom;
        if (el.classList.contains('od-keep-next')) { const next = firstKeepAfter(el); if (next) bottom = Math.max(bottom, rel(next, page).bottom); }
        const index = Math.floor(r.top / PAGE_H), limit = (index + 1) * PAGE_H - BOTTOM;
        if (bottom > limit && r.top < limit && bottom - r.top < PAGE_H * 0.7) {
          const push = (index + 1) * PAGE_H + TOP - r.top;
          const current = parseFloat(getComputedStyle(el).marginTop) || 0;
          el.style.marginTop = (current + push) + 'px';
          el.setAttribute('data-push', '1');
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  // Ajuste la taille du texte pour tenir sur une page (sans descendre sous 82 %), sinon passe
  // sur deux pages (trois au plus) en coupant proprement entre les blocs.
  function layout(page, data, kind) {
    page.querySelectorAll('.od-break').forEach(n => n.remove());
    const base = (kind === 'cv' ? DENSITY[data.density] || 1 : 1) * (Number(page.dataset.size) || 1);
    const fit = kind === 'lm' || data.fit !== false;
    let k = base;
    page.style.setProperty('--k', String(k));
    page.querySelectorAll('[data-push]').forEach(el => { el.style.marginTop = ''; el.removeAttribute('data-push'); });
    let height = contentHeight(page);
    const natural = height;
    if (fit) {
      while (height > PAGE_H && k > 0.82) { k = Math.round((k - 0.02) * 1000) / 1000; page.style.setProperty('--k', String(k)); height = contentHeight(page); }
    }
    let pages = 1;
    if (height > PAGE_H) {
      paginate(page, k);
      height = contentHeight(page);
      pages = Math.min(3, Math.ceil((height - 2) / PAGE_H));
    }
    page.style.setProperty('--ph', (pages * PAGE_H) + 'px');
    for (let i = 1; i < pages; i++) {
      const mark = document.createElement('div');
      mark.className = 'od-break'; mark.style.top = (i * PAGE_H) + 'px';
      mark.append(Object.assign(document.createElement('span'), { textContent: 'Page ' + (i + 1) }));
      page.append(mark);
    }
    return { pages, k, shrunk: k < base - 0.001, natural, overflow: height > pages * PAGE_H + 2 };
  }

  // ───── Couleurs et formes ─────
  function rgba(value) {
    const m = String(value).match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
  }
  function radius(value, w, h) {
    const v = String(value || '0').split(' ')[0];
    if (v.endsWith('%')) return Math.min(w, h) * parseFloat(v) / 100;
    return parseFloat(v) || 0;
  }
  function backgroundBehind(el) {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const c = rgba(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function fontOf(style) {
    const first = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const lower = first.toLowerCase();
    const bold = (parseInt(style.fontWeight, 10) || 400) >= 600;
    const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
    if (lower.startsWith('ot-')) {
      const key = lower.slice(3), f = fontInfo(key), has = f?.[3] || 'r';
      const st = bold && has.includes('b') ? 'b' : italic && has.includes('i') ? 'i' : 'r';
      return { fam: 'ot-' + key, style: st === 'b' ? 'bold' : st === 'i' ? 'italic' : 'normal', file: [key, st] };
    }
    const fam = FAMILY[lower] || (/mono|courier/.test(lower) ? 'courier' : /serif/.test(lower) && !/sans/.test(lower) ? 'times' : 'helvetica');
    return { fam, style: bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal' };
  }
  // Position de la ligne de base : mesurée sur la police réellement affichée.
  const metricCanvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const metricCache = new Map();
  function fontMetrics(style, size) {
    const key = style.fontStyle + '|' + style.fontWeight + '|' + size + '|' + style.fontFamily;
    if (!metricCache.has(key)) {
      metricCanvas.font = style.fontStyle + ' ' + style.fontWeight + ' ' + size + 'px ' + style.fontFamily;
      const m = metricCanvas.measureText('Hg');
      metricCache.set(key, m.fontBoundingBoxAscent ? { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent } : null);
    }
    return metricCache.get(key);
  }
  function transformText(text, style) {
    if (style.textTransform === 'uppercase') return text.toLocaleUpperCase('fr');
    if (style.textTransform === 'lowercase') return text.toLocaleLowerCase('fr');
    return text;
  }

  // Version noir et blanc (impression) : gris calculé selon la luminance.
  const grayOf = c => { const v = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b); return { r: v, g: v, b: v, a: c.a }; };
  function grayCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 4) { const v = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
  }
  let GRAY = false;

  // ───── Images : photo (JPEG), signature et icônes (PNG) ─────
  function loadImage(src) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Image illisible')); img.src = src; });
  }
  async function rasterImg(el, box, style) {
    const img = await loadImage(el.currentSrc || el.src);
    const scale = 3, w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const photo = el.classList.contains('od-photo');
    const rad = radius(style.borderTopLeftRadius, box.w, box.h) * scale;
    if (photo) { const bg = backgroundBehind(el); ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`; ctx.fillRect(0, 0, w, h); }
    ctx.save();
    if (rad > 0) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, w, h, Math.min(rad, w / 2, h / 2)); else ctx.rect(0, 0, w, h); ctx.clip(); }
    if (style.objectFit === 'cover') {
      const ratio = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * ratio, dh = img.naturalHeight * ratio;
      const [px, py] = (style.objectPosition || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
      ctx.drawImage(img, (w - dw) * (isNaN(px) ? 0.5 : px), (h - dh) * (isNaN(py) ? 0.5 : py), dw, dh);
    } else ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    if (GRAY) grayCanvas(canvas);
    return photo ? { data: canvas.toDataURL('image/jpeg', 0.86), format: 'JPEG' } : { data: canvas.toDataURL('image/png'), format: 'PNG' };
  }
  const iconCache = new Map();
  async function rasterSvg(el, box, style) {
    const key = el.innerHTML + style.color + Math.round(box.w) + GRAY;
    if (iconCache.has(key)) return iconCache.get(key);
    const clone = el.cloneNode(true);
    const size = Math.round(box.w * 4);
    clone.setAttribute('width', size); clone.setAttribute('height', size);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelectorAll('[stroke="currentColor"]').forEach(n => n.setAttribute('stroke', style.color));
    clone.querySelectorAll('[fill="currentColor"]').forEach(n => n.setAttribute('fill', style.color));
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)));
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    if (GRAY) grayCanvas(canvas);
    const out = { data: canvas.toDataURL('image/png'), format: 'PNG' };
    iconCache.set(key, out);
    return out;
  }

  // ───── Relevé de la page : formes, images et mots, dans l'ordre d'affichage ─────
  async function collect(page) {
    const ops = [];
    const P = page.getBoundingClientRect(), s = P.width / PAGE_W || 1;
    const box = r => ({ x: (r.left - P.left) / s, y: (r.top - P.top) / s, w: r.width / s, h: r.height / s });
    const range = document.createRange();
    async function walk(el) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.classList.contains('od-break')) return;
      const rect = el.getBoundingClientRect();
      const b = box(rect);
      if (el instanceof SVGElement) {
        if (el.tagName.toLowerCase() === 'svg' && b.w > 0) ops.push({ kind: 'image', ...b, image: await rasterSvg(el, b, style) });
        return;
      }
      const rad = radius(style.borderTopLeftRadius, b.w, b.h);
      if (el.tagName === 'IMG') {
        if (b.w > 0 && b.h > 0) { try { ops.push({ kind: 'image', ...b, image: await rasterImg(el, b, style) }); } catch { /* image absente */ } }
        borders(style, b, rad);
        return;
      }
      const bg = rgba(style.backgroundColor);
      if (bg && bg.a > 0 && b.w > 0 && b.h > 0) ops.push({ kind: 'rect', ...b, color: bg, rad, fill: true });
      borders(style, b, rad);
      for (const child of el.childNodes) {
        if (child.nodeType === 1) await walk(child);
        else if (child.nodeType === 3 && child.data.trim()) text(child, style);
      }
    }
    function borders(style, b, rad) {
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ side, w: parseFloat(style['border' + side + 'Width']) || 0, color: rgba(style['border' + side + 'Color']), style: style['border' + side + 'Style'] }));
      const visible = sides.filter(x => x.w > 0 && x.style !== 'none' && x.color && x.color.a > 0);
      if (visible.length === 4 && rad > 0 && visible.every(x => x.w === visible[0].w)) {
        ops.push({ kind: 'rect', ...b, color: visible[0].color, rad, stroke: visible[0].w });
      } else for (const x of visible) {
        const strip = x.side === 'Top' ? { x: b.x, y: b.y, w: b.w, h: x.w } : x.side === 'Bottom' ? { x: b.x, y: b.y + b.h - x.w, w: b.w, h: x.w }
          : x.side === 'Left' ? { x: b.x, y: b.y, w: x.w, h: b.h } : { x: b.x + b.w - x.w, y: b.y, w: x.w, h: b.h };
        ops.push({ kind: 'rect', ...strip, color: x.color, rad: 0, fill: true });
      }
    }
    function text(node, style) {
      const color = rgba(style.color) || { r: 0, g: 0, b: 0, a: 1 };
      const font = fontOf(style);
      const size = parseFloat(style.fontSize);
      const metrics = fontMetrics(style, size);
      const re = /\S+/g;
      let m;
      while ((m = re.exec(node.data))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter(r => r.width > 0);
        if (!rects.length) continue;
        const withBase = b => ({ ...b, base: metrics ? b.y + (b.h - (metrics.asc + metrics.desc) / s) / 2 + metrics.asc / s : null });
        if (rects.length === 1) ops.push({ kind: 'text', ...withBase(box(rects[0])), str: transformText(m[0], style), font, size, color });
        else {
          // Mot coupé sur deux lignes : lettre par lettre.
          for (let i = 0; i < m[0].length; i++) {
            range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1);
            const r = range.getClientRects()[0];
            if (r && r.width > 0) ops.push({ kind: 'text', ...withBase(box(r)), str: transformText(m[0][i], style), font, size, color });
          }
        }
        if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(m[0])) ops.at(-1).link = 'mailto:' + m[0];
        else if (/^https?:\/\/\S+$/i.test(m[0])) ops.at(-1).link = m[0];
      }
    }
    await walk(page);
    return ops;
  }

  let jsPdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './jspdf.umd.min.js';
      script.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('Module PDF indisponible')));
      script.onerror = () => { jsPdfPromise = null; reject(new Error('Module PDF indisponible (connexion ?)')); };
      document.head.append(script);
    });
    return jsPdfPromise;
  }

  // Dessine les relevés dans le PDF, page par page.
  function draw(doc, ops, pages, first = true) {
    let gstate = 1;
    if (GRAY) for (const op of ops) if (op.color) op.color = grayOf(op.color);
    const alpha = a => { if (a !== gstate) { doc.setGState(new doc.GState({ opacity: a, 'stroke-opacity': a })); gstate = a; } };
    for (let p = 0; p < pages; p++) {
      if (p || !first) doc.addPage('a4', 'portrait');
      const top = p * PAGE_H, bottom = top + PAGE_H;
      for (const op of ops) {
        if (op.kind === 'text') {
          const mid = op.y + op.h / 2;
          if (mid < top || mid >= bottom) continue;
          doc.setFont(op.font.fam, op.font.style);
          doc.setFontSize(op.size * PT);
          doc.setTextColor(op.color.r, op.color.g, op.color.b);
          alpha(op.color.a);
          const target = op.w * PT, actual = doc.getTextWidth(op.str);
          let space = (target - actual) / Math.max(1, op.str.length);
          if (Math.abs(space) > op.size * PT * 0.25) space = 0;
          const baseline = op.base ?? (op.y + op.h - (DESCENT[op.font.fam] ?? 0.22) * op.size - (op.h - op.size * 1.117) / 2);
          doc.text(op.str, op.x * PT, (baseline - top) * PT, { charSpace: space, baseline: 'alphabetic' });
          if (op.link) doc.link(op.x * PT, (op.y - top) * PT, op.w * PT, op.h * PT, { url: op.link });
          continue;
        }
        const y0 = Math.max(op.y, top), y1 = Math.min(op.y + op.h, bottom);
        if (y1 <= y0) continue;
        const clipped = y0 !== op.y || y1 !== op.y + op.h;
        const x = op.x * PT, y = (y0 - top) * PT, w = op.w * PT, h = (y1 - y0) * PT;
        if (op.kind === 'image') {
          if (clipped) continue;
          alpha(1);
          doc.addImage(op.image.data, op.image.format, x, y, w, h, undefined, 'FAST');
          continue;
        }
        alpha(op.color.a);
        const rad = clipped ? 0 : Math.min(op.rad, op.w / 2, op.h / 2) * PT;
        if (op.stroke) {
          doc.setDrawColor(op.color.r, op.color.g, op.color.b); doc.setLineWidth(op.stroke * PT);
          const inset = op.stroke * PT / 2;
          if (rad > 0 && rad >= w / 2 - 0.01 && rad >= h / 2 - 0.01) doc.ellipse(x + w / 2, y + h / 2, w / 2 - inset, h / 2 - inset, 'S');
          else if (rad > 0) doc.roundedRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, rad, rad, 'S');
          else doc.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, 'S');
        } else {
          doc.setFillColor(op.color.r, op.color.g, op.color.b);
          if (rad > 0 && rad >= w / 2 - 0.01 && rad >= h / 2 - 0.01) doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 'F');
          else if (rad > 0) doc.roundedRect(x, y, w, h, rad, rad, 'F');
          else doc.rect(x, y, w, h, 'F');
        }
      }
    }
    alpha(1);
  }

  // Crée un PDF à partir d'un ou plusieurs documents (CV puis lettre, par exemple).
  // options : gray (noir et blanc), photo (false = sans photo), fit (true = tenir sur une page), title, author.
  async function buildPdfs(items, options = {}) {
    await loadFonts();
    const host = document.createElement('div');
    host.className = 'ot-hidden-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.append(host);
    GRAY = Boolean(options.gray);
    try {
      const JsPDF = await loadJsPdf();
      const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
      let total = 0;
      const registered = new Set();
      for (const [index, item] of items.entries()) {
        const data = R().clean(item.kind, JSON.parse(JSON.stringify(item.data)));
        if (options.photo === false && item.kind === 'cv') data.photo = '';
        if (options.fit && item.kind === 'cv') data.fit = true;
        if (item.blank) data.fit = false;
        await useFonts(data);
        const page = item.blank ? R().renderBlank(item.kind, data) : item.kind === 'cv' ? R().renderCv(data) : R().renderLetter(data);
        page.classList.add('od-export');
        if (options.gray) { page.classList.add('od-print'); page.classList.remove('od-side-dark', 'od-side-tinted'); }
        await mount(host, page);
        const info = layout(page, data, item.kind);
        const ops = await collect(page);
        for (const op of ops) {
          if (!op.font?.file) continue;
          const [key, st] = op.font.file, name = key + '-' + st + '.ttf';
          if (registered.has(name)) continue;
          registered.add(name);
          doc.addFileToVFS(name, await fontFile(key, st));
          doc.addFont(name, 'ot-' + key, st === 'b' ? 'bold' : st === 'i' ? 'italic' : 'normal');
        }
        draw(doc, ops, info.pages, index === 0);
        total += info.pages;
      }
      const kinds = [...new Set(items.map(i => i.kind))];
      doc.setProperties({ title: options.title || (items[0]?.blank ? (kinds[0] === 'cv' ? 'CV vierge à remplir' : 'Lettre de motivation vierge à remplir') : kinds.length > 1 ? 'CV et lettre de motivation' : kinds[0] === 'cv' ? 'Curriculum vitae' : 'Lettre de motivation'), author: options.author || '', subject: 'Candidature', creator: 'L’Atelier MELEC' });
      doc.setLanguage?.('fr-FR');
      return { blob: doc.output('blob'), pages: total };
    } finally { GRAY = false; host.remove(); }
  }
  const buildPdf = (data, kind, meta = {}) => buildPdfs([{ data, kind }], meta);
  function fileName(data, kind) {
    const p = data.person || {};
    const part = v => R().safe(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const who = [part(p.first), part(p.last)].filter(Boolean).join('_') || 'document';
    const extra = kind === 'lm' && data.recipient?.company ? '_' + part(data.recipient.company).slice(0, 30) : '';
    return (kind === 'cv' ? 'CV_' : 'Lettre_motivation_') + who + extra + '.pdf';
  }
  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function download(data, kind, meta) {
    const result = await buildPdf(data, kind, meta);
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName(data, kind);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return result;
  }

  window.MelecOutilsPdf = { PAGE_W, PAGE_H, pageSheet, loadFonts, useFonts, ensureFont, mount, layout, collect, buildPdf, buildPdfs, download, save, fileName, rgba, loadJsPdf };
})();
