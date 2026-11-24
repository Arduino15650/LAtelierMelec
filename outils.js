/* L'Atelier MELEC · Mes outils : CV et lettres de motivation.
   - Espace élève : onglet « Mes outils » (création, modification, suppression, PDF, correcteur,
     envoi à l'enseignant pour relecture).
   - Espace enseignant : onglet « CV et lettres » (lecture, PDF, commentaire, « à corriger » / « validé »).
   Données : table student_career_docs (supabase/migrations/…_documents_candidature.sql).
   Modèles et page A4 : outils-rendu.js ; mise en page et PDF : outils-pdf.js. */
(function () {
  'use strict';
  const R = window.MelecOutilsRendu, PDF = window.MelecOutilsPdf;
  if (!R || !PDF) return;
  const TABLE = 'student_career_docs';
  const LIST_FIELDS = 'id,student_id,kind,title,review_status,submitted_at,teacher_comment,reviewed_at,updated_at,created_at';
  const STATUS = { draft: 'Brouillon', submitted: 'Envoyé à l’enseignant', changes: 'À corriger', approved: 'Validé par l’enseignant' };
  const KIND = { cv: 'CV', lm: 'Lettre de motivation' };
  const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const LT_URL = 'https://api.languagetool.org/v2/check';

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }
  const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const statusChip = s => el('span', { class: 'ot-chip ot-st-' + s, text: STATUS[s] || s });
  const defaultTitle = (kind, data) => {
    const who = [data.person?.first, data.person?.last].filter(Boolean).join(' ');
    if (kind === 'cv') return 'CV' + (who ? ' · ' + who : '');
    return 'Lettre' + (data.recipient?.company ? ' · ' + data.recipient.company : who ? ' · ' + who : '');
  };

  // ───── Champs de saisie ─────
  function field(label, value, onInput, opts = {}) {
    const attrs = { value: value || '', maxlength: opts.max || 160, placeholder: opts.placeholder || '', type: opts.type || 'text', spellcheck: opts.spell === false ? 'false' : 'true', lang: 'fr', autocomplete: 'off', inputmode: opts.inputmode };
    const input = opts.area ? el('textarea', { ...attrs, rows: opts.rows || 4, type: null }) : el('input', attrs);
    if (opts.area) input.value = value || '';
    const count = opts.count ? el('span', { class: 'ot-count' }) : null;
    const update = () => { if (count) { const n = input.value.length; count.textContent = n + ' / ' + opts.count + ' caractères'; count.classList.toggle('over', n > opts.count); } };
    input.addEventListener('input', () => { onInput(input.value); update(); });
    update();
    return el('label', { class: 'ot-field' + (opts.cls ? ' ' + opts.cls : '') }, el('span', { text: label }), input, opts.hint ? el('small', { class: 'ot-help', text: opts.hint }) : null, count);
  }
  const switchBtn = (on, label, onClick) => el('button', { type: 'button', class: 'ot-switch', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: onClick });
  const chips = (items, isOn, onPick, label) => el('div', { class: 'ot-chips', role: 'group', 'aria-label': label }, items.map(([value, text]) =>
    el('button', { type: 'button', 'aria-pressed': String(isOn(value)), text, onclick: () => onPick(value) })));

  // Miniatures des organisations (CV et lettre) : simples rectangles.
  const SHEETS = {
    lateral: [[0, 0, 32, 100, 'a'], [38, 7, 40, 6, 'd'], [38, 18, 52, 3, 'l'], [38, 24, 48, 3, 'l'], [38, 34, 52, 3, 'l'], [38, 40, 44, 3, 'l'], [7, 8, 18, 14, 'p']],
    'lateral-d': [[68, 0, 32, 100, 'a'], [8, 7, 40, 6, 'd'], [8, 18, 52, 3, 'l'], [8, 24, 48, 3, 'l'], [8, 34, 52, 3, 'l'], [8, 40, 44, 3, 'l'], [75, 8, 18, 14, 'p']],
    ats: [[25, 6, 50, 6, 'd'], [20, 15, 60, 2, 'l'], [8, 22, 84, 1, 'a'], [8, 28, 84, 3, 'l'], [8, 34, 80, 3, 'l'], [8, 44, 84, 3, 'l'], [8, 50, 78, 3, 'l'], [8, 60, 84, 3, 'l']],
    bandeau: [[0, 0, 100, 20, 'a'], [6, 4, 16, 12, 'p'], [27, 6, 40, 5, 'w'], [8, 28, 54, 3, 'l'], [8, 34, 50, 3, 'l'], [8, 44, 54, 3, 'l'], [70, 28, 22, 3, 'l'], [70, 34, 20, 3, 'l']],
    deux: [[8, 6, 50, 6, 'd'], [76, 4, 16, 12, 'p'], [8, 18, 84, 1.5, 'a'], [8, 26, 38, 3, 'l'], [8, 32, 36, 3, 'l'], [54, 26, 38, 3, 'l'], [54, 32, 34, 3, 'l'], [8, 42, 38, 3, 'l'], [54, 42, 38, 3, 'l']],
    frise: [[8, 5, 14, 11, 'p'], [27, 7, 40, 6, 'd'], [26, 24, 1, 60, 'a'], [24, 26, 5, 3.5, 'a'], [24, 44, 5, 3.5, 'a'], [31, 26, 36, 3, 'l'], [31, 44, 34, 3, 'l'], [74, 24, 20, 3, 'l']],
    bento: [[8, 5, 14, 11, 'p'], [27, 7, 40, 6, 'd'], [6, 22, 52, 22, 'c'], [62, 22, 32, 30, 'c'], [6, 48, 52, 24, 'c'], [62, 56, 32, 16, 'c']],
    fr: [[8, 6, 30, 10, 'd'], [58, 20, 34, 8, 'c'], [58, 32, 28, 3, 'l'], [8, 40, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [8, 62, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    'bandeau-lm': [[0, 0, 100, 15, 'a'], [8, 5, 40, 5, 'w'], [58, 22, 34, 8, 'c'], [8, 36, 40, 3, 'a'], [8, 46, 84, 3, 'l'], [8, 52, 80, 3, 'l'], [8, 60, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    cv: [[8, 6, 50, 7, 'd'], [8, 16, 84, 1.5, 'a'], [58, 24, 34, 8, 'c'], [8, 38, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [8, 62, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    'lateral-lm': [[0, 0, 28, 100, 'a'], [36, 10, 30, 7, 'c'], [36, 24, 40, 3, 'a'], [36, 34, 56, 3, 'l'], [36, 40, 52, 3, 'l'], [36, 48, 56, 3, 'l'], [66, 80, 24, 4, 'a']],
    minimal: [[30, 6, 40, 6, 'd'], [45, 15, 10, 1, 'a'], [8, 26, 30, 7, 'c'], [8, 38, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [64, 80, 24, 4, 'a']],
    mail: [[6, 6, 88, 86, 'o'], [12, 12, 50, 5, 'c'], [12, 22, 40, 3, 'a'], [12, 30, 74, 3, 'l'], [12, 36, 70, 3, 'l'], [12, 44, 74, 3, 'l'], [12, 58, 30, 4, 'a']]
  };
  function sheet(id, accent) {
    const colors = { a: accent, d: '#1d2530', l: '#d5dbe3', p: '#9aa7b6', w: '#ffffff', c: '#e7ecf2' };
    return el('div', { class: 'ot-tile-sheet', 'aria-hidden': 'true' }, (SHEETS[id] || []).map(([x, y, w, h, c]) => {
      const span = el('span');
      span.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%;` + (c === 'o' ? 'border:2px solid #d5dbe3;' : 'background:' + colors[c] + ';');
      return span;
    }));
  }

  // ───── Photo et signature : réduites et compressées avant enregistrement ─────
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choisissez une image (JPEG, PNG…).'));
      if (file.size > 15e6) return reject(new Error('Image trop lourde (15 Mo au plus).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
      img.src = url;
    });
  }
  async function photoFromFile(file) {
    const img = await readImage(file);
    const ratio = 4 / 5, W = 360, H = 450;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
    const canvas = el('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
    for (const q of [0.85, 0.75, 0.6, 0.45]) { const url = canvas.toDataURL('image/jpeg', q); if (url.length < 190000) return url; }
    throw new Error('Photo trop détaillée : essayez une autre image.');
  }
  function trimCanvas(source) {
    const ctx = source.getContext('2d');
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = 6, out = el('canvas');
    out.width = x1 - x0 + 2 * pad; out.height = y1 - y0 + 2 * pad;
    out.getContext('2d').drawImage(source, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  async function signatureFromFile(file) {
    const img = await readImage(file);
    const scale = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight);
    const canvas = el('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Fond clair rendu transparent : la signature se pose sur la page sans cadre blanc.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) { const v = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3; if (v > 200) pixels.data[i + 3] = 0; }
    ctx.putImageData(pixels, 0, 0);
    const cut = trimCanvas(canvas) || canvas;
    const url = cut.toDataURL('image/png');
    if (url.length < 115000) return url;
    throw new Error('Image de signature trop lourde : recadrez-la sur la signature.');
  }

  // ───── Correcteur (orthographe, grammaire, conjugaison, syntaxe) ─────
  // Le texte des rubriques est envoyé au service LanguageTool (Allemagne, RGPD) ; les
  // coordonnées (e-mail, téléphone, adresse) et le nom ne sont jamais envoyés.
  let lastCheck = 0;
  function kindOf(match) {
    const id = (match.rule?.id || '') + ' ' + (match.rule?.category?.id || '');
    const type = match.rule?.issueType || '';
    if (type === 'misspelling' || /TYPOS|HUNSPELL|MORFOLOGIK/.test(id)) return ['spell', 'Orthographe'];
    if (/CONJ|VERBE|VERB|VINF|VAVOIR|VETRE|IMPERATIF|PP_|PPA|PASSE|INFINITI|SUBJ|FUTUR|_VB/.test(id)) return ['grammar', 'Conjugaison'];
    if (/ACCORD|AGREEMENT|GENRE|NOMBRE|PLURI|SING|^D_N|_D_N|SONT_SON|_GN/.test(id)) return ['grammar', 'Accord'];
    if (/PUNCT|VIRG|COMMA|POINT|DOUBLE_PUNCT/.test(id) || type === 'typographical') return ['punct', 'Ponctuation'];
    if (/STYLE|REDUND|REPET|COLLOQ|FAMILIER/.test(id) || type === 'style') return ['style', 'Style'];
    if (/CASING|MAJ/.test(id)) return ['grammar', 'Majuscule'];
    return ['grammar', 'Grammaire'];
  }
  async function checkTexts(fields) {
    const parts = [];
    let text = '';
    for (const f of fields) {
      const value = f.get();
      if (!value || !value.trim()) continue;
      if (text) text += '\n\n';
      parts.push({ f, start: text.length, length: value.length, value });
      text += value;
    }
    if (!text.trim()) return [];
    const wait = 4000 - (Date.now() - lastCheck);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCheck = Date.now();
    const body = new URLSearchParams({ text: text.slice(0, 19000), language: 'fr', disabledRules: 'FRENCH_WHITESPACE,APOS_TYP,TIRET,ESPACE_APRES_POINT,DOUBLE_PUNCTUATION,WHITESPACE_RULE,FR_SPLIT_WORDS_HYPHEN', disabledCategories: 'TYPOGRAPHY' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try { response = await fetch(LT_URL, { method: 'POST', body, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch { throw new Error('Correcteur injoignable : vérifiez la connexion. Le soulignement rouge du navigateur reste actif dans les champs.'); }
    finally { clearTimeout(timer); }
    if (response.status === 429) throw new Error('Beaucoup de vérifications en même temps dans la classe : réessayez dans une minute.');
    if (!response.ok) throw new Error('Correcteur indisponible pour le moment (' + response.status + ').');
    const json = await response.json();
    const out = [];
    for (const m of json.matches || []) {
      const part = parts.find(p => m.offset >= p.start && m.offset + m.length <= p.start + p.length);
      if (!part) continue;
      const offset = m.offset - part.start;
      const wrong = part.value.slice(offset, offset + m.length);
      if (/^\[.*\]$/.test(wrong) || /\[[^\]]*$/.test(part.value.slice(0, offset))) continue; // passage à compléter
      const [cls, label] = kindOf(m);
      out.push({ field: part.f, offset, length: m.length, wrong, message: m.message, short: m.shortMessage, replacements: (m.replacements || []).slice(0, 4).map(r => r.value), cls, label, rule: m.rule?.id || '' });
    }
    return out;
  }

  // ───── Éditeur (élève) ─────
  function createEditor(ctx) {
    // ctx : { doc, onChange(), onStructure(), cvList(), loadDoc(id), notify(text) }
    const doc = ctx.doc;
    let data = doc.data;
    let tab = 'content', openSection = doc.kind === 'cv' ? 'profil' : 'moi', themeFilter = '';
    let spell = { state: 'idle', items: [], error: '', ignored: new Set() };
    const panel = el('div', { class: 'ot-panel' });
    const stageScale = el('div', { class: 'ot-scale' });
    const pageHost = el('div', { class: 'ot-page-host' });
    stageScale.append(pageHost);
    const stage = el('div', { class: 'ot-stage' }, stageScale);
    const info = el('div', { class: 'ot-preview-bar', role: 'status', 'aria-live': 'polite' });
    const checks = el('div', { class: 'ot-group ot-checks', 'aria-live': 'polite' });
    const preview = el('div', { class: 'ot-preview' }, info, stage, checks);
    async function drawChecks() {
      let list;
      if (doc.kind === 'cv') list = R.cvChecks(data, lastLayout.pages);
      else { const h = await ctx.cvHints().catch(() => null); list = R.letterChecks(data, h?.text || ''); if (lastLayout.pages > 1) list.unshift([false, 'La lettre dépasse une page']); }
      fill(checks, el('h3', { text: doc.kind === 'cv' ? 'Qualité du CV · ' + R.cvScore(data).score + ' / 100' : 'Qualité de la lettre' }),
        el('ul', { class: 'ot-checklist' }, list.map(([ok, text]) => el('li', { class: ok ? 'ok' : 'todo' }, el('span', { class: 'ot-check-mark', 'aria-hidden': 'true', text: ok ? '✓' : '!' }), el('span', { text: ok ? text : 'À améliorer : ' + text })))));
    }
    let lastLayout = { pages: 1, k: 1 };
    let renderTicket = 0;
    const paint = async () => {
      const ticket = ++renderTicket;
      await PDF.loadFonts();
      await PDF.useFonts(data);
      if (ticket !== renderTicket) return;
      const page = doc.kind === 'cv' ? R.renderCv(data) : R.renderLetter(data);
      await PDF.mount(pageHost, page);
      if (ticket !== renderTicket) return;
      lastLayout = PDF.layout(page, data, doc.kind);
      const width = stage.clientWidth - 24 || 600;
      const scale = Math.min(1, width / R.PAGE_W);
      stageScale.style.transform = 'scale(' + scale + ')';
      stageScale.style.width = R.PAGE_W + 'px';
      stage.style.height = (lastLayout.pages * R.PAGE_H * scale + 24) + 'px';
      fill(info, el('span', { text: lastLayout.pages + ' page' + (lastLayout.pages > 1 ? 's' : '') + ' A4' + (lastLayout.shrunk ? ' · texte ajusté à ' + Math.round(lastLayout.k * 100) + ' % pour tenir' : '') }),
        doc.kind === 'lm' ? el('span', { text: R.letterWords(data) + ' mots (conseillé : 250 à 400)' }) : el('span', { text: 'Score du CV : ' + R.cvScore(data).score + ' / 100' }));
      drawChecks();
    };
    const repaint = debounce(paint, 220);
    const resize = new ResizeObserver(debounce(() => paint(), 150));
    resize.observe(stage);
    const changed = () => { data = R.clean(doc.kind, data); doc.data = data; ctx.onChange(); repaint(); };
    const set = (fn) => { fn(data); changed(); };
    const restructure = (fn) => { fn(data); changed(); drawPanel(); };

    // Onglets du panneau
    function drawPanel() {
      const tabs = el('div', { class: 'ot-tabs', role: 'tablist' }, [['content', 'Contenu'], ['look', 'Apparence'], ['spell', 'Correcteur' + (spell.items.length ? ' (' + spell.items.length + ')' : '')]].map(([id, label]) =>
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { tab = id; drawPanel(); } })));
      const body = tab === 'look' ? look() : tab === 'spell' ? spellPanel() : doc.kind === 'cv' ? cvContent() : lmContent();
      fill(panel, tabs, body);
    }

    // ── CV : contenu
    function photoBox() {
      const input = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
        const file = input.files[0]; input.value = '';
        try { const url = await photoFromFile(file); restructure(d => { d.photo = url; d.photoPos = { x: 50, y: 50 }; }); }
        catch (error) { ctx.notify(error.message); }
      } });
      const prev = el('div', { class: 'ot-photo-prev' }, data.photo ? el('img', { src: data.photo, alt: 'Votre photo' }) : 'Pas de photo');
      if (data.photo) prev.firstChild.style.objectPosition = data.photoPos.x + '% ' + data.photoPos.y + '%';
      const slider = (label, key) => {
        const range = el('input', { type: 'range', min: 0, max: 100, value: data.photoPos[key], 'aria-label': label });
        range.addEventListener('input', () => { set(d => { d.photoPos[key] = Number(range.value); }); prev.firstChild.style.objectPosition = data.photoPos.x + '% ' + data.photoPos.y + '%'; });
        return el('label', { class: 'ot-field' }, el('span', { text: label }), range);
      };
      return el('div', { class: 'ot-photo-box' }, prev, el('div', { class: 'ot-panel' },
        el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'ot-mini', text: data.photo ? 'Changer la photo' : 'Importer une photo', onclick: () => input.click() }),
          data.photo ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Retirer', onclick: () => restructure(d => { d.photo = ''; }) }) : null, input),
        data.photo ? [slider('Cadrage horizontal', 'x'), slider('Cadrage vertical', 'y')] : el('p', { class: 'ot-help', text: 'Photo d’identité récente, de face, sur fond clair. Facultative en France : vous pouvez aussi choisir « sans photo » dans Apparence.' })));
    }
    function identity() {
      const p = data.person;
      const f = (label, key, opts) => field(label, p[key], v => set(d => { d.person[key] = v; }), opts);
      return el('div', { class: 'ot-group' }, el('h3', { text: 'Identité et coordonnées' }), doc.kind === 'cv' ? photoBox() : null,
        el('div', { class: 'ot-row' }, f('Prénom', 'first', { max: 60, spell: false }), f('Nom', 'last', { max: 60, spell: false })),
        doc.kind === 'cv' ? f('Titre sous le nom', 'title', { max: 120, placeholder: 'Ex. : Élève en Bac Pro MELEC · recherche stage PFMP' }) : null,
        el('div', { class: 'ot-row' }, f('E-mail', 'email', { max: 120, type: 'email', spell: false }), f('Téléphone', 'phone', { max: 30, type: 'tel', spell: false, inputmode: 'tel' })),
        f('Adresse', 'address', { max: 160, placeholder: 'N° et rue (facultatif sur un CV)' }),
        el('div', { class: 'ot-row' }, f('Code postal et ville', 'city', { max: 80 }), doc.kind === 'cv' ? f('Âge ou date de naissance (facultatif)', 'birth', { max: 40 }) : null),
        doc.kind === 'cv' ? f('Site ou profil en ligne (facultatif)', 'web', { max: 160, spell: false, placeholder: 'https://…' }) : null);
    }
    function score() {
      const s = R.cvScore(data);
      const meter = el('div', { class: 'ot-meter' }, el('span'));
      meter.firstChild.style.width = s.score + '%';
      return el('div', { class: 'ot-group' }, el('div', { class: 'ot-score' }, el('strong', { text: 'CV complet à ' + s.score + ' %' }), meter),
        s.tips.length ? el('ul', { class: 'ot-tips' }, s.tips.map(t => el('li', { text: t }))) : el('p', { class: 'ot-ok', text: 'Votre CV est complet. Pensez au correcteur avant de l’envoyer.' }));
    }
    const LIST_LABELS = {
      experiences: ['Poste ou mission', 'Entreprise', 'Ex. : Électricien stagiaire (PFMP)'], formation: ['Diplôme ou formation', 'Établissement', 'Ex. : Bac Pro MELEC'],
      projets: ['Réalisation', 'Cadre (atelier, entreprise…)', 'Ex. : Câblage d’un tableau de logement'], engagement: ['Rôle', 'Association ou structure', 'Ex. : Délégué de classe'],
      autre: ['Intitulé', 'Organisme', '']
    };
    function sectionEditor(s) {
      const x = data.sections[s.id];
      const parts = [field('Titre de la rubrique', x.title, v => set(d => { d.sections[s.id].title = v; }), { max: 60, placeholder: s.label }), el('p', { class: 'ot-help', text: s.help })];
      if (s.type === 'text') parts.push(field('Texte', x.text, v => set(d => { d.sections[s.id].text = v; }), { area: true, rows: 5, max: 1200, count: 450, hint: 'Conseil : 300 à 450 caractères. Une ligne commençant par « - » devient une puce.' }));
      if (s.type === 'list') {
        const [t, o, ph] = LIST_LABELS[s.id] || LIST_LABELS.autre;
        x.items.forEach((item, index) => {
          const f = (label, key, opts) => field(label, item[key], v => set(d => { d.sections[s.id].items[index][key] = v; }), opts);
          parts.push(el('div', { class: 'ot-item' }, f(t, 'title', { max: 160, placeholder: ph }),
            el('div', { class: 'ot-row' }, f(o, 'org', { max: 120 }), f('Ville', 'place', { max: 80 })),
            el('div', { class: 'ot-row' }, f('Début', 'start', { max: 30, placeholder: 'Ex. : mai 2026' }), f('Fin', 'end', { max: 30, placeholder: 'Ex. : juin 2026 ou « en cours »' })),
            f('Missions et résultats', 'desc', { area: true, rows: 4, max: 900, count: 400, hint: 'Une mission par ligne commençant par « - », avec un verbe d’action : « - Câblage de 12 tableaux de logements neufs ».' }),
            el('div', { class: 'ot-item-tools' },
              el('button', { type: 'button', text: '▲', 'aria-label': 'Monter', disabled: index === 0, onclick: () => restructure(d => { const l = d.sections[s.id].items; [l[index - 1], l[index]] = [l[index], l[index - 1]]; }) }),
              el('button', { type: 'button', text: '▼', 'aria-label': 'Descendre', disabled: index === x.items.length - 1, onclick: () => restructure(d => { const l = d.sections[s.id].items; [l[index + 1], l[index]] = [l[index], l[index + 1]]; }) }),
              el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => restructure(d => { d.sections[s.id].items.splice(index, 1); }) }))));
        });
        if (x.items.length < 12) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].items.push(R.emptyItem()); }) }));
      }
      if (s.type === 'refs') {
        x.items.forEach((item, index) => {
          const f = (label, key, opts) => field(label, item[key], v => set(d => { d.sections[s.id].items[index][key] = v; }), opts);
          parts.push(el('div', { class: 'ot-item' }, el('div', { class: 'ot-row' }, f('Nom', 'name', { max: 80, spell: false }), f('Fonction', 'role', { max: 100 })),
            el('div', { class: 'ot-row' }, f('Entreprise', 'org', { max: 100 }), f('Téléphone ou e-mail', 'contact', { max: 120, spell: false })),
            el('div', { class: 'ot-item-tools' }, el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => restructure(d => { d.sections[s.id].items.splice(index, 1); }) }))));
        });
        if (x.items.length < 4) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter une référence', onclick: () => restructure(d => { d.sections[s.id].items.push({ name: '', role: '', org: '', contact: '' }); }) }));
        parts.push(el('p', { class: 'ot-help', text: 'Demandez toujours l’accord de la personne avant de la citer.' }));
      }
      if (s.type === 'tags') {
        x.tags.forEach((tag, index) => parts.push(el('div', { class: 'ot-tag-row' },
          el('input', { value: tag, maxlength: 120, 'aria-label': s.label + ' ' + (index + 1), spellcheck: 'true', lang: 'fr', oninput: e => set(d => { d.sections[s.id].tags[index] = e.target.value; }) }),
          el('button', { type: 'button', class: 'ot-mini warn', text: '×', 'aria-label': 'Retirer', onclick: () => restructure(d => { d.sections[s.id].tags.splice(index, 1); }) }))));
        if (x.tags.length < 16) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].tags.push('Nouvel élément'); }) }));
        if (R.SUGGESTIONS[s.id]) parts.push(el('p', { class: 'ot-help', text: 'Suggestions (cliquez pour ajouter ou retirer) :' }),
          chips(R.SUGGESTIONS[s.id].map(v => [v, v]), v => x.tags.includes(v), v => restructure(d => { const l = d.sections[s.id].tags; const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else if (l.length < 16) l.push(v); }), 'Suggestions'));
      }
      if (s.type === 'levels') {
        x.levels.forEach((lv, index) => parts.push(el('div', { class: 'ot-level-row' },
          el('input', { value: lv.label, maxlength: 80, 'aria-label': 'Intitulé', placeholder: 'Intitulé', spellcheck: 'true', lang: 'fr', oninput: e => set(d => { d.sections[s.id].levels[index].label = e.target.value; }) }),
          el('div', { class: 'ot-level-sub' }, el('select', { 'aria-label': 'Niveau', onchange: e => set(d => { d.sections[s.id].levels[index].level = Number(e.target.value); }) }, [1, 2, 3, 4, 5].map(n => el('option', { value: n, text: n + ' · ' + R.LEVEL_NAMES[n], selected: lv.level === n }))),
          el('input', { value: lv.detail, maxlength: 40, placeholder: s.id === 'langues' ? 'Ex. : B1' : 'Précision', title: 'Précision facultative (ex. : B1, 3 ans…)', 'aria-label': 'Précision facultative', oninput: e => set(d => { d.sections[s.id].levels[index].detail = e.target.value; }) }),
          el('button', { type: 'button', class: 'ot-mini warn', text: '×', 'aria-label': 'Retirer', onclick: () => restructure(d => { d.sections[s.id].levels.splice(index, 1); }) })))));
        if (x.levels.length < 14) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].levels.push({ label: '', level: 3, detail: '' }); }) }));
        if (R.SUGGESTIONS[s.id]) parts.push(el('p', { class: 'ot-help', text: 'Suggestions :' }),
          chips(R.SUGGESTIONS[s.id].map(v => [v, v]), v => x.levels.some(l => l.label === v), v => restructure(d => { const l = d.sections[s.id].levels; const i = l.findIndex(e => e.label === v); if (i >= 0) l.splice(i, 1); else if (l.length < 14) l.push({ label: v, level: 3, detail: '' }); }), 'Suggestions'));
      }
      return parts;
    }
    let dragId = '';
    function sectionRows(defs, order, isOn, toggle, move, editor, label, reorder, customLabel) {
      const on = order.filter(id => isOn(id)), off = order.filter(id => !isOn(id));
      const offStd = off.filter(id => !defs.find(x => x.id === id).custom);
      const offCustom = off.filter(id => defs.find(x => x.id === id).custom);
      return el('div', { class: 'ot-group' }, el('h3', { text: label + ' (' + on.length + ' affichées)' }),
        el('p', { class: 'ot-help', text: 'Activez, masquez ou glissez chaque rubrique pour la déplacer (ou utilisez les flèches) ; cliquez sur son nom pour la remplir.' }),
        on.map((id, index) => {
          const s = defs.find(x => x.id === id);
          const open = openSection === id;
          const own = doc.kind === 'cv' ? (data.sections[id].title || '').trim() : '';
          const title = own || s.label;
          const row = el('div', { class: 'ot-sec' + (open ? ' open' : ''), draggable: 'true', 'data-id': id },
            el('div', { class: 'ot-sec-head' }, el('span', { class: 'ot-grip', 'aria-hidden': 'true', text: '⠿' }), switchBtn(true, 'Masquer « ' + title + ' »', () => toggle(id)),
              el('button', { type: 'button', class: 'ot-sec-name', 'aria-expanded': String(open), text: title, onclick: () => { openSection = open ? '' : id; drawPanel(); } }),
              el('button', { type: 'button', text: '▲', 'aria-label': 'Monter « ' + title + ' »', disabled: index === 0, onclick: () => move(id, on[index - 1]) }),
              el('button', { type: 'button', text: '▼', 'aria-label': 'Descendre « ' + title + ' »', disabled: index === on.length - 1, onclick: () => move(id, on[index + 1]) })),
            open ? el('div', { class: 'ot-sec-body' }, editor(s)) : null);
          row.addEventListener('dragstart', e => { if (e.target.closest('input,textarea,select')) { e.preventDefault(); return; } dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); row.classList.add('dragging'); });
          row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragId = ''; });
          row.addEventListener('dragover', e => { if (dragId && dragId !== id) { e.preventDefault(); row.classList.add('drop'); } });
          row.addEventListener('dragleave', () => row.classList.remove('drop'));
          row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drop'); if (dragId && dragId !== id) reorder(dragId, id); });
          return row;
        }),
        offStd.length ? [el('p', { class: 'ot-help', text: (doc.kind === 'cv' ? 'Rubriques' : 'Paragraphes') + ' à ajouter :' }),
          el('div', { class: 'ot-chips' }, offStd.map(id => el('button', { type: 'button', text: '＋ ' + defs.find(x => x.id === id).label, onclick: () => { openSection = id; toggle(id); } })))] : null,
        offCustom.length ? el('button', { type: 'button', class: 'ot-mini', text: '＋ ' + customLabel, onclick: () => { openSection = offCustom[0]; toggle(offCustom[0]); } }) : null);
    }
    const moveBefore = (list, a, b) => { const i = list.indexOf(a); if (i < 0) return; list.splice(i, 1); const j = list.indexOf(b); list.splice(j < 0 ? list.length : (i <= j ? j + 1 : j), 0, a); };
    const swap = (list, a, b) => { const i = list.indexOf(a), j = list.indexOf(b); if (i >= 0 && j >= 0) [list[i], list[j]] = [list[j], list[i]]; };
    function cvContent() {
      return [score(), identity(), sectionRows(R.CV_SECTIONS, data.order, id => data.sections[id].on,
        id => restructure(d => { d.sections[id].on = !d.sections[id].on; }), (a, b) => restructure(d => swap(d.order, a, b)), sectionEditor, 'Rubriques',
        (a, b) => restructure(d => moveBefore(d.order, a, b)), 'Rubrique personnalisée')];
    }

    // ── Lettre : contenu
    function fillFromType(onlyEmpty) {
      const type = R.LETTER_TYPES[data.type];
      restructure(d => {
        if (!onlyEmpty || !d.object.trim()) d.object = type.object;
        for (const b of R.LETTER_BLOCKS) {
          const model = b.id === 'accroche' ? type.accroche : b.model;
          if (model && (!onlyEmpty || !d.blocks[b.id].text.trim())) d.blocks[b.id].text = model;
        }
      });
    }
    async function copyFromCv(id, what) {
      try {
        const cv = await ctx.loadDoc(id);
        if (!cv) return;
        restructure(d => {
          if (what === 'person') { for (const k of ['first', 'last', 'email', 'phone', 'address', 'city', 'title']) d.person[k] = cv.data.person[k] || d.person[k]; }
          else for (const k of R.STYLE_KEYS) d[k] = cv.data[k];
        });
        ctx.notify(what === 'person' ? 'Coordonnées reprises du CV.' : 'Thème, couleurs, polices, tailles et style des titres repris du CV.');
      } catch (error) { ctx.notify(error.message); }
    }
    function cvPicker(label, what) {
      const list = ctx.cvList();
      if (!list.length) return null;
      const select = el('select', { 'aria-label': label }, el('option', { value: '', text: label + '…' }), list.map(c => el('option', { value: c.id, text: c.title || 'CV' })));
      select.addEventListener('change', () => { if (select.value) copyFromCv(select.value, what); select.value = ''; });
      return select;
    }
    function lmContent() {
      const words = R.letterWords(data);
      const placeholders = (JSON.stringify(data.blocks) + data.object).match(/\[[^\]]{2,60}\]/g) || [];
      const typeGroup = el('div', { class: 'ot-group' }, el('h3', { text: 'Type de lettre' }),
        chips(Object.entries(R.LETTER_TYPES).map(([id, t]) => [id, t.name]), v => data.type === v, v => restructure(d => { d.type = v; }), 'Type de lettre'),
        el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', class: 'ot-mini', text: 'Remplir les blocs vides avec le modèle', onclick: () => fillFromType(true) }),
          el('button', { type: 'button', class: 'ot-mini subtle', text: 'Tout remplacer par le modèle', onclick: () => { if (confirm('Remplacer tout le texte de la lettre par le modèle « ' + R.LETTER_TYPES[data.type].name + ' » ?')) fillFromType(false); } })),
        el('p', { class: words > 400 || (words && words < 150) ? 'ot-warn' : 'ot-help', text: words + ' mots. Une bonne lettre compte 250 à 400 mots et tient sur une page.' }),
        placeholders.length ? el('p', { class: 'ot-warn', text: 'À compléter avant l’envoi : ' + [...new Set(placeholders)].slice(0, 6).join(', ') + '.' }) : null);
      const p = data.person, rc = data.recipient;
      const who = el('div', { class: 'ot-group' }, el('h3', { text: 'Mes coordonnées' }), cvPicker('Reprendre les coordonnées d’un CV', 'person'),
        el('div', { class: 'ot-row' }, field('Prénom', p.first, v => set(d => { d.person.first = v; }), { max: 60, spell: false }), field('Nom', p.last, v => set(d => { d.person.last = v; }), { max: 60, spell: false })),
        field('Adresse', p.address, v => set(d => { d.person.address = v; }), { max: 160 }),
        el('div', { class: 'ot-row' }, field('Code postal et ville', p.city, v => set(d => { d.person.city = v; }), { max: 80 }), field('Téléphone', p.phone, v => set(d => { d.person.phone = v; }), { max: 30, type: 'tel', spell: false })),
        field('E-mail', p.email, v => set(d => { d.person.email = v; }), { max: 120, type: 'email', spell: false }));
      const to = el('div', { class: 'ot-group' }, el('h3', { text: 'Destinataire, lieu, date et objet' }),
        field('Entreprise', rc.company, v => set(d => { d.recipient.company = v; }), { max: 120 }),
        el('div', { class: 'ot-row' }, field('Service', rc.service, v => set(d => { d.recipient.service = v; }), { max: 120, placeholder: 'Ex. : Service recrutement' }), field('À l’attention de', rc.contact, v => set(d => { d.recipient.contact = v; }), { max: 120, placeholder: 'Ex. : Madame Durand' })),
        field('Adresse', rc.address, v => set(d => { d.recipient.address = v; }), { max: 160 }), field('Code postal et ville', rc.city, v => set(d => { d.recipient.city = v; }), { max: 80 }),
        el('div', { class: 'ot-row' }, field('Fait à', data.place, v => set(d => { d.place = v; }), { max: 60, placeholder: 'Votre ville' }), field('Date', data.date, v => set(d => { d.date = v; }), { max: 40, placeholder: 'Vide = date du jour' })),
        field('Objet', data.object, v => set(d => { d.object = v; }), { max: 200, placeholder: R.LETTER_TYPES[data.type].object }),
        field('Référence de l’offre', data.ref, v => set(d => { d.ref = v; }), { max: 80, placeholder: 'Ex. : n° 48213 (si annonce)', spell: false }));
      const blocks = sectionRows(R.LETTER_BLOCKS, data.order, id => data.blocks[id].on, id => restructure(d => { d.blocks[id].on = !d.blocks[id].on; }), (a, b) => restructure(d => swap(d.order, a, b)), b => {
        const area = field('Texte', data.blocks[b.id].text, v => set(d => { d.blocks[b.id].text = v; }), { area: true, rows: b.id === 'appel' ? 1 : 5, max: 1500, count: b.id === 'appel' || b.id === 'politesse' ? 0 : 700 });
        const ta = area.querySelector('textarea');
        const insert = tip => { const v = ta.value; const at = ta.selectionStart ?? v.length; ta.value = v ? v.slice(0, at) + (at && !/\s$/.test(v.slice(0, at)) ? ' ' : '') + tip.replace(/…$/, '') + v.slice(at) : tip.replace(/…$/, ''); ta.dispatchEvent(new Event('input')); ta.focus(); };
        const model = b.id === 'accroche' ? R.LETTER_TYPES[data.type].accroche : b.model;
        return [b.help ? el('p', { class: 'ot-help', text: b.help }) : null, area,
          el('p', { class: 'ot-help', text: 'Débuts de phrases (cliquez pour insérer) :' }), el('div', { class: 'ot-chips' }, (b.tips || []).map(t => el('button', { type: 'button', text: t, onclick: () => insert(t) }))),
          fromCvBox(insert),
          model ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Utiliser le texte d’exemple', onclick: () => { ta.value = model; ta.dispatchEvent(new Event('input')); } }) : null];
      }, 'Paragraphes', (a, b) => restructure(d => moveBefore(d.order, a, b)), 'Paragraphe libre');
      const show = data.show;
      const options = el('div', { class: 'ot-group' }, el('h3', { text: 'Éléments de la page' }),
        R.LETTER_OPTIONAL.map(o => el('div', { class: 'ot-sec-head' }, switchBtn(show[o.id], (show[o.id] ? 'Masquer ' : 'Afficher ') + o.label, () => restructure(d => { d.show[o.id] = !d.show[o.id]; })), el('span', { text: o.label }))),
        show.ps ? field('P.-S.', data.ps, v => set(d => { d.ps = v; }), { area: true, rows: 2, max: 400 }) : null,
        show.pj ? field('Mention des pièces jointes', data.pj, v => set(d => { d.pj = v; }), { max: 120 }) : null);
      return [typeGroup, who, to, blocks, options, show.signature ? signatureGroup() : null];
    }
    // « Reprendre de mon CV » : habilitations, compétences, stages et qualités du CV le plus récent.
    function fromCvBox(insert) {
      const box = el('div', { class: 'ot-fromcv' });
      ctx.cvHints().then(h => {
        if (!h || !h.items.length) { fill(box, el('p', { class: 'ot-help', text: 'Créez d’abord votre CV : ses habilitations, compétences et stages pourront être repris ici en un clic.' })); return; }
        fill(box, el('p', { class: 'ot-help', text: 'Reprendre de mon CV :' }), el('div', { class: 'ot-chips' }, h.items.map(t => el('button', { type: 'button', class: 'ot-cvchip', text: '⛓ ' + t, onclick: () => insert(t) }))));
      }).catch(() => fill(box));
      return box;
    }
    function signatureGroup() {
      const s = data.sign;
      const parts = [el('h3', { text: 'Signature' }), chips([['typed', 'Nom écrit'], ['drawn', 'Signer au doigt ou à la souris'], ['image', 'Importer une image']], v => s.mode === v, v => restructure(d => { d.sign.mode = v; }), 'Signature')];
      if (s.mode === 'drawn') {
        const pad = el('canvas', { class: 'ot-pad', width: 600, height: 200, 'aria-label': 'Zone de signature' });
        const g = pad.getContext('2d');
        g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#13243a';
        if (s.image) { const img = new Image(); img.onload = () => g.drawImage(img, (600 - img.width) / 2, (200 - img.height) / 2); img.src = s.image; }
        let drawing = false, drawn = false;
        const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * 600 / r.width, (e.clientY - r.top) * 200 / r.height]; };
        pad.addEventListener('pointerdown', e => { drawing = true; drawn = true; pad.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...pos(e)); });
        pad.addEventListener('pointermove', e => { if (!drawing) return; g.lineTo(...pos(e)); g.stroke(); });
        const end = () => { drawing = false; };
        pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
        parts.push(pad, el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', class: 'ot-mini', text: 'Valider la signature', onclick: () => { if (!drawn && s.image) return; const cut = trimCanvas(pad); if (!cut) { ctx.notify('Signez dans le cadre blanc.'); return; } const url = cut.toDataURL('image/png'); if (url.length > 115000) { ctx.notify('Signature trop chargée : effacez et recommencez plus simplement.'); return; } restructure(d => { d.sign.image = url; }); ctx.notify('Signature enregistrée.'); } }),
          el('button', { type: 'button', class: 'ot-mini subtle', text: 'Effacer', onclick: () => { g.clearRect(0, 0, 600, 200); drawn = false; restructure(d => { d.sign.image = ''; }); } })));
      } else if (s.mode === 'image') {
        const input = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const file = input.files[0]; input.value = ''; try { const url = await signatureFromFile(file); restructure(d => { d.sign.image = url; }); } catch (error) { ctx.notify(error.message); } } });
        parts.push(el('p', { class: 'ot-help', text: 'Photo de votre signature à l’encre foncée sur une feuille blanche : le fond blanc est retiré automatiquement.' }),
          el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'ot-mini', text: s.image ? 'Changer l’image' : 'Choisir une image', onclick: () => input.click() }), s.image ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Retirer', onclick: () => restructure(d => { d.sign.image = ''; }) }) : null, input));
      } else parts.push(el('p', { class: 'ot-help', text: 'Votre prénom et votre nom sont écrits en italique à la place de la signature.' }));
      return el('div', { class: 'ot-group' }, parts);
    }

    // ── Apparence (CV et lettre) : organisation, thème, puis « Personnaliser » juste dessous.
    function swatchRow(list, current, label, onPick, themeColor) {
      const color = el('input', { type: 'color', value: current || themeColor || '#0b7f74', 'aria-label': label + ' : couleur libre', title: 'Couleur libre', onchange: e => onPick(e.target.value) });
      return el('div', { class: 'ot-swatches', role: 'group', 'aria-label': label }, list.map(([value, name]) => {
        const b = el('button', { type: 'button', class: 'ot-swatch' + (value === '' ? ' ot-swatch-theme' : ''), title: name, 'aria-label': name, 'aria-pressed': String(current === value), onclick: () => onPick(value) });
        b.style.setProperty('--sw', value || themeColor || '#888');
        if (!value) b.textContent = '↺';
        return b;
      }), color);
    }
    function look() {
      const r = R.resolved(data);
      const layouts = doc.kind === 'cv' ? R.LAYOUTS : R.LETTER_LAYOUTS;
      const sheetId = id => doc.kind === 'lm' && (id === 'bandeau' || id === 'lateral') ? id + '-lm' : id;
      const theme = R.THEMES.find(t => t.id === data.theme) || R.THEMES[0];
      const layoutGroup = el('div', { class: 'ot-group' }, el('div', { class: 'ot-toolbar' }, el('h3', { text: doc.kind === 'cv' ? 'Organisation du CV' : 'Organisation de la lettre' }),
          ctx.openLibrary ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Voir la bibliothèque en grand', onclick: () => ctx.openLibrary() }) : null),
        el('div', { class: 'ot-tiles' }, layouts.map(l => el('button', { type: 'button', class: 'ot-tile', 'aria-pressed': String(data.layout === l.id), title: l.hint, onclick: () => restructure(d => { d.layout = l.id; }) },
          sheet(sheetId(l.id), r.accent), el('strong', { text: l.name }), el('small', { text: l.hint })))));
      const themes = R.THEMES.filter(t => !themeFilter || t.level === themeFilter || (themeFilter === 'ATS' && t.ats));
      const themeGroup = el('div', { class: 'ot-group' }, el('h3', { text: 'Thème (' + R.THEMES.length + ')' }),
        chips([['', 'Tous'], ...R.THEME_LEVELS.map(l => [l, l]), ['ATS', 'Compatibles ATS']], v => themeFilter === v, v => { themeFilter = v; drawPanel(); }, 'Filtrer les thèmes'),
        doc.kind === 'lm' ? cvPicker('Assortir à un de mes CV (thème, couleurs, polices…)', 'theme') : null,
        el('div', { class: 'ot-tiles' }, themes.map(t => {
          const tile = el('button', { type: 'button', class: 'ot-tile', 'aria-pressed': String(data.theme === t.id), title: t.desc, onclick: () => restructure(d => { d.theme = t.id; d.accent = ''; d.sideColor = ''; d.titleColor = ''; d.levelColor = ''; d.palette = ''; d.headFont = ''; d.bodyFont = ''; d.titleStyle = ''; }) },
            sheet(doc.kind === 'cv' ? (data.layout || 'lateral') : sheetId(data.layout), t.accent), el('strong', { text: t.name + (t.ats ? ' · ATS' : '') }), el('small', { text: t.level }));
          const side = tile.querySelector('.ot-tile-sheet span');
          if (side && doc.kind === 'cv' && (data.layout === 'lateral' || data.layout === 'lateral-d')) side.style.background = t.side === '#ffffff' ? '#eef1f5' : t.side;
          return tile;
        })),
        el('p', { class: 'ot-help', text: theme.desc || '' }));

      // Personnaliser
      const sub = (title, ...children) => el('div', { class: 'ot-subgroup' }, el('h4', { text: title }), children);
      const warnings = R.styleWarnings(data);
      const palettes = el('div', { class: 'ot-palettes' }, R.PALETTES.map(pal => el('button', { type: 'button', class: 'ot-palette', 'aria-pressed': String(data.palette === pal.id), title: pal.name, onclick: () => restructure(d => { d.palette = pal.id; d.accent = pal.accent; d.sideColor = pal.side; d.titleColor = pal.title; d.levelColor = ''; }) },
        el('span', { class: 'ot-palette-dots', 'aria-hidden': 'true' }, [pal.side, pal.accent, pal.title].map(c => { const dot = el('span'); dot.style.background = c; return dot; })), el('span', { text: pal.name }))));
      const fontSelect = (label, key, current) => {
        const select = el('select', { 'aria-label': label, onchange: e => restructure(d => { d[key] = e.target.value; }) },
          el('option', { value: '', text: 'Celle du thème (' + (R.FONT_LABELS[key === 'headFont' ? theme.head : theme.body] || '') + ')', selected: !current }),
          el('optgroup', { label: 'Polices modernes (intégrées au PDF)' }, R.FONT_LIST.filter(f => f[3]).map(f => el('option', { value: f[0], text: f[1], selected: current === f[0] }))),
          el('optgroup', { label: 'Polices très légères' }, R.FONT_LIST.filter(f => !f[3]).map(f => el('option', { value: f[0], text: f[1], selected: current === f[0] }))));
        return el('label', { class: 'ot-field' }, el('span', { text: label }), select);
      };
      const sample = el('div', { class: 'ot-font-sample' }, el('strong', { text: [data.person.first, data.person.last].filter(Boolean).join(' ') || 'Lucas Martin' }), el('span', { text: 'Électricien · câblage, mise en service et dépannage.' }));
      sample.firstChild.style.fontFamily = r.head; sample.lastChild.style.fontFamily = r.body;
      PDF.useFonts(data).then(() => { sample.classList.add('ready'); });
      const opt = (label, key, list) => el('div', { class: 'ot-field' }, el('span', { text: label }), chips(list, v => data[key] === v, v => restructure(d => { d[key] = v; }), label));
      const custom = el('div', { class: 'ot-group ot-custom' },
        el('div', { class: 'ot-toolbar' }, el('h3', { text: '⚙ Personnaliser' }),
          el('button', { type: 'button', class: 'ot-mini subtle', text: '↺ Revenir au thème « ' + theme.name + ' »', onclick: () => restructure(d => { for (const k of ['accent', 'sideColor', 'titleColor', 'levelColor', 'palette', 'headFont', 'bodyFont', 'titleStyle']) d[k] = ''; d.textSize = 'm'; d.nameSize = 'm'; d.icons = true; d.sideWidth = 'normal'; if (d.photoSize) { d.photoSize = 'm'; d.photoBorder = false; d.photoShape = ''; } }) })),
        warnings.length ? el('div', { class: 'ot-warn', role: 'alert' }, el('strong', { text: 'Lisibilité : ' }), warnings.join(' ')) : el('p', { class: 'ot-ok', text: '✓ Couleurs bien lisibles.' }),
        sub('Palettes prêtes', palettes),
        sub('Couleur principale', swatchRow(R.ACCENTS, data.accent, 'Couleur principale', v => restructure(d => { d.accent = v; d.palette = ''; }), theme.accent)),
        sub(doc.kind === 'cv' ? 'Couleur de la colonne ou du bandeau' : 'Couleur de la colonne ou du bandeau (organisations concernées)', swatchRow(R.SIDE_COLORS, data.sideColor, 'Couleur de la colonne', v => restructure(d => { d.sideColor = v; d.palette = ''; }), theme.side),
          el('p', { class: 'ot-help', text: 'Le texte de la colonne passe automatiquement en clair ou en foncé.' })),
        sub('Couleur des titres et du nom', swatchRow(R.ACCENTS.map(([v, n]) => [v, n === 'Couleur du thème' ? 'Comme la couleur principale' : n]), data.titleColor, 'Couleur des titres', v => restructure(d => { d.titleColor = v; d.palette = ''; }), r.title)),
        doc.kind === 'cv' ? sub('Couleur des barres et points de niveau', swatchRow(R.ACCENTS.map(([v, n]) => [v, n === 'Couleur du thème' ? 'Comme la couleur principale' : n]), data.levelColor, 'Couleur des niveaux', v => restructure(d => { d.levelColor = v; }), r.accent)) : null,
        sub('Polices', el('div', { class: 'ot-row' }, fontSelect('Titres et nom', 'headFont', data.headFont), fontSelect('Texte', 'bodyFont', data.bodyFont)), sample,
          el('p', { class: 'ot-help', text: 'Les polices modernes sont intégrées au PDF : il s’affiche à l’identique partout (PDF d’environ 50 à 200 Ko).' })),
        sub('Tailles', opt('Taille du texte', 'textSize', [['s', 'Petite'], ['m', 'Normale'], ['l', 'Grande']]), opt('Taille du nom', 'nameSize', [['s', 'Petite'], ['m', 'Normale'], ['l', 'Grande']])),
        sub('Titres des rubriques', opt('Style', 'titleStyle', R.TITLE_STYLES)),
        doc.kind === 'cv' ? sub('Photo', opt('Forme', 'photoShape', [['', 'Comme le thème'], ['round', 'Ronde'], ['rounded', 'Coins arrondis'], ['square', 'Carrée'], ['none', 'Sans photo']]),
          opt('Taille', 'photoSize', [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']]),
          el('div', { class: 'ot-sec-head' }, switchBtn(data.photoBorder, 'Bordure colorée autour de la photo', () => restructure(d => { d.photoBorder = !d.photoBorder; })), el('span', { text: 'Bordure colorée autour de la photo' }))) : null,
        sub('Mise en page', opt('Largeur de la colonne', 'sideWidth', [['narrow', 'Étroite'], ['normal', 'Normale'], ['wide', 'Large']]),
          el('div', { class: 'ot-sec-head' }, switchBtn(data.icons, 'Icônes devant les coordonnées', () => restructure(d => { d.icons = !d.icons; })), el('span', { text: 'Icônes devant les coordonnées' })),
          doc.kind === 'cv' ? [opt('Niveaux', 'levelStyle', [['bars', 'Barres'], ['dots', 'Points'], ['text', 'Texte (ATS)']]), opt('Densité', 'density', [['airy', 'Aérée'], ['normal', 'Normale'], ['compact', 'Compacte']]),
            el('div', { class: 'ot-sec-head' }, switchBtn(data.fit, 'Ajuster automatiquement sur une page', () => restructure(d => { d.fit = !d.fit; })), el('span', { text: 'Ajuster automatiquement le texte pour tenir sur une page' }))]
            : opt('Alignement du texte', 'justify', [[true, 'Justifié'], [false, 'Aligné à gauche']])));
      return [layoutGroup, themeGroup, custom];
    }

    // ── Correcteur
    function spellFields() {
      const out = [];
      const add = (label, get, setter) => out.push({ label, get, set: setter });
      if (doc.kind === 'cv') {
        add('Titre sous le nom', () => data.person.title, v => { data.person.title = v; });
        for (const id of data.order) {
          const s = R.CV_SECTIONS.find(x => x.id === id), x = data.sections[id];
          if (!x.on) continue;
          const name = (x.title || '').trim() || s.label;
          const sec = () => data.sections[id];
          if (x.title) add(name + ' · titre', () => sec().title, v => { sec().title = v; });
          if (s.type === 'text') add(name, () => sec().text, v => { sec().text = v; });
          if (s.type === 'list') x.items.forEach((item, i) => { for (const k of ['title', 'desc']) add(name + ' · ' + (i + 1) + (k === 'desc' ? ' (missions)' : ''), () => sec().items[i]?.[k] || '', v => { sec().items[i][k] = v; }); });
          if (s.type === 'refs') x.items.forEach((item, i) => add(name, () => sec().items[i]?.role || '', v => { sec().items[i].role = v; }));
          if (s.type === 'tags') x.tags.forEach((t, i) => add(name, () => sec().tags[i] || '', v => { sec().tags[i] = v; }));
          if (s.type === 'levels') x.levels.forEach((l, i) => add(name, () => sec().levels[i]?.label || '', v => { sec().levels[i].label = v; }));
        }
      } else {
        add('Objet', () => data.object, v => { data.object = v; });
        for (const id of data.order) {
          const b = R.LETTER_BLOCKS.find(x => x.id === id);
          if (data.blocks[id].on) add(b.label, () => data.blocks[id].text, v => { data.blocks[id].text = v; });
        }
        if (data.show.ps) add('P.-S.', () => data.ps, v => { data.ps = v; });
      }
      return out;
    }
    async function runSpell() {
      spell = { ...spell, state: 'busy', error: '', items: [] };
      drawPanel();
      try {
        const items = await checkTexts(spellFields());
        spell.items = items.filter(m => !spell.ignored.has(m.rule + '|' + m.wrong));
        spell.state = 'done';
      } catch (error) { spell.state = 'error'; spell.error = error.message; }
      drawPanel();
    }
    function applyFix(item, value) {
      const text = item.field.get();
      if (text.slice(item.offset, item.offset + item.length) !== item.wrong) { ctx.notify('Ce passage a changé : relancez la vérification.'); return; }
      item.field.set(text.slice(0, item.offset) + value + text.slice(item.offset + item.length));
      const delta = value.length - item.length;
      spell.items = spell.items.filter(m => m !== item);
      for (const m of spell.items) if (m.field === item.field && m.offset > item.offset) m.offset += delta;
      changed(); drawPanel();
    }
    function spellPanel() {
      const head = el('div', { class: 'ot-group' }, el('h3', { text: 'Correcteur d’orthographe et de grammaire' }),
        el('p', { class: 'ot-help', text: 'Vérifie l’orthographe, les accords, la conjugaison, la ponctuation et les tournures de tout le document. Cliquez sur une proposition pour corriger. Le texte des rubriques est analysé par le service LanguageTool (Union européenne) ; votre nom et vos coordonnées ne sont pas envoyés.' }),
        el('button', { type: 'button', class: 'portal-button', disabled: spell.state === 'busy', text: spell.state === 'busy' ? 'Vérification en cours…' : spell.state === 'idle' ? 'Vérifier mon document' : 'Relancer la vérification', onclick: runSpell }));
      if (spell.state === 'error') return [head, el('p', { class: 'ot-warn', text: spell.error })];
      if (spell.state === 'done' && !spell.items.length) return [head, el('p', { class: 'ot-ok', text: 'Aucune faute détectée. Relisez quand même à voix haute : aucun correcteur ne remplace une relecture.' })];
      if (!spell.items.length) return [head];
      const counts = spell.items.reduce((acc, m) => { acc[m.label] = (acc[m.label] || 0) + 1; return acc; }, {});
      return [head, el('p', { class: 'ot-help', text: spell.items.length + ' point(s) à revoir : ' + Object.entries(counts).map(([k, n]) => k.toLowerCase() + ' ' + n).join(', ') + '.' }),
        el('div', { class: 'ot-spell' }, spell.items.map(m => {
          const text = m.field.get();
          const from = Math.max(0, text.lastIndexOf(' ', Math.max(0, m.offset - 40)));
          const to = text.indexOf(' ', Math.min(text.length, m.offset + m.length + 40));
          const end = to < 0 ? text.length : to;
          return el('div', { class: 'ot-spell-item k-' + m.cls },
            el('span', { class: 'ot-spell-where', text: m.label + ' · ' + m.field.label }),
            el('p', { class: 'ot-spell-ctx' }, (from > 0 ? '…' : '') + text.slice(from, m.offset).trimStart(), el('mark', { text: m.wrong }), text.slice(m.offset + m.length, end) + (end < text.length ? '…' : '')),
            el('p', { class: 'ot-spell-msg', text: m.message }),
            el('div', { class: 'ot-spell-fix' }, m.replacements.map(v => el('button', { type: 'button', class: 'ot-fix', text: '✓ ' + (v || '(supprimer)'), onclick: () => applyFix(m, v) })),
              el('button', { type: 'button', class: 'subtle', text: 'Ignorer', onclick: () => { spell.ignored.add(m.rule + '|' + m.wrong); spell.items = spell.items.filter(x => x !== m); drawPanel(); } })));
        }))];
    }

    drawPanel();
    paint();
    return {
      node: el('div', { class: 'ot-editor' }, panel, preview),
      layoutInfo: () => lastLayout,
      destroy: () => resize.disconnect(),
      warnings: () => {
        const list = [];
        if (doc.kind === 'lm') {
          const ph = (JSON.stringify(data.blocks) + data.object).match(/\[[^\]]{2,60}\]/g);
          if (ph) list.push('Il reste des passages entre crochets à compléter : ' + [...new Set(ph)].slice(0, 4).join(', ') + '.');
          const w = R.letterWords(data);
          if (w > 420) list.push('La lettre est longue (' + w + ' mots) : visez 250 à 400 mots.');
        } else if (R.cvScore(data).score < 50) list.push('Le CV est encore incomplet (' + R.cvScore(data).score + ' %).');
        if (lastLayout.pages > 1 && doc.kind === 'lm') list.push('La lettre dépasse une page.');
        return list;
      }
    };
  }

  // ───── Miniatures réelles (bibliothèque) : la page A4 réduite ─────
  // La miniature est placée dans la page avant la mise en page (les mesures en ont besoin).
  async function thumb(slot, data, kind, width = 200) {
    const host = el('div', { class: 'ot-thumb-page' });
    const box = el('div', { class: 'ot-thumb', 'aria-hidden': 'true' }, host);
    const scale = width / R.PAGE_W;
    box.style.width = width + 'px'; box.style.height = Math.round(R.PAGE_H * scale) + 'px';
    host.style.transform = 'scale(' + scale + ')';
    slot.replaceWith(box);
    await PDF.useFonts(data);
    const page = kind === 'cv' ? R.renderCv(data) : R.renderLetter(data);
    await PDF.mount(host, page);
    PDF.layout(page, data, kind);
    return box;
  }
  function sampleLetter(layout, theme, base) {
    const d = R.newLetter({ first: 'Lucas', last: 'Martin', email: 'lucas.martin@exemple.fr' }, 'pfmp');
    Object.assign(d.person, { phone: '06 12 34 56 78', address: '12 rue des Lilas', city: '76000 Rouen' });
    Object.assign(d.recipient, { company: 'Entreprise Dupont Électricité', contact: 'Madame Durand', address: '8 rue de l’Industrie', city: '76800 Saint-Étienne-du-Rouvray' });
    d.place = 'Rouen'; d.object = 'Demande de stage (PFMP) du 4 mai au 12 juin';
    for (const b of R.LETTER_BLOCKS) d.blocks[b.id].text = b.id === 'accroche' ? 'Élève en première Bac Pro MELEC, je recherche une entreprise d’accueil pour ma période de formation en milieu professionnel de six semaines.' : (b.model || '').replace(/\[[^\]]+\]/g, '…');
    d.layout = layout; d.theme = theme;
    if (base) for (const k of R.STYLE_KEYS) d[k] = base[k];
    return d;
  }

  // ───── Espace élève ─────
  function initStudent() {
    const tabs = document.getElementById('studentContentTabs');
    const dashboard = document.getElementById('studentDashboard');
    const tp = document.getElementById('studentTpPane');
    const api = window.MelecPortal;
    const EX = window.MelecOutilsExemples;
    if (!tabs || !dashboard || !tp || !api) return;
    const button = el('button', { type: 'button', id: 'studentToolsTab', text: 'Mes outils' });
    tabs.append(button);
    const message = el('p', { class: 'portal-small', role: 'status', 'aria-live': 'polite' });
    const content = el('div', { class: 'ot-space' });
    const pane = el('section', { id: 'studentToolsPane', class: 'student-pane ot-pane' }, el('h2', { text: 'Mes outils · CV et lettres de motivation' }), message, content);
    pane.hidden = true;
    dashboard.append(pane);
    let docs = [], current = null, editor = null, saveTimer = null, saving = Promise.resolve(), dirty = false, requestId = 0, statusLine = null, me = null, hints = null;
    let libTab = 'examples', libFilter = '';
    const notify = text => { message.textContent = text; };
    const historyKey = () => 'melec-outils-pdf:' + (me?.id || '');
    const readHistory = () => { try { return JSON.parse(localStorage.getItem(historyKey()) || '[]').slice(0, 20); } catch { return []; } };
    const writeHistory = list => { try { localStorage.setItem(historyKey(), JSON.stringify(list.slice(0, 20))); } catch { /* stockage indisponible */ } };

    async function whoAmI() {
      if (me) return me;
      const id = await api.userId();
      let first = '', last = '', email = '';
      try { const rows = await api.rest('student_profiles?user_id=eq.' + encodeURIComponent(id) + '&select=first_name,last_name'); first = rows[0]?.first_name || ''; last = rows[0]?.last_name || ''; } catch { /* profil indisponible */ }
      try { email = (await api.user())?.email || ''; } catch { /* e-mail indisponible */ }
      me = { id, first, last, email };
      return me;
    }
    function close() { flush(); editor?.destroy(); editor = null; pane.hidden = true; button.classList.remove('active'); }
    const tpRunning = () => tabs.dataset.tpActive === 'true';
    async function open() {
      if (tpRunning()) { button.classList.add('active'); pane.hidden = false; pane.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else {
        tp.hidden = true;
        dashboard.querySelectorAll('.student-pane').forEach(other => { if (other !== pane) other.hidden = true; });
        tabs.querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
        pane.hidden = false;
      }
      PDF.loadFonts(); PDF.pageSheet().catch(() => {});
      await showHome();
    }
    async function loadList() {
      const user = await whoAmI();
      docs = await api.rest(TABLE + '?student_id=eq.' + encodeURIComponent(user.id) + '&select=' + LIST_FIELDS + '&order=updated_at.desc');
    }
    async function loadDoc(id) {
      const row = (await api.rest(TABLE + '?id=eq.' + encodeURIComponent(id) + '&select=*'))[0];
      if (!row) return null;
      row.data = R.clean(row.kind, row.data);
      return row;
    }
    // Éléments du CV le plus récent, proposés dans la lettre (« Reprendre de mon CV »).
    function cvHints() {
      if (hints) return hints;
      const cv = docs.find(d => d.kind === 'cv');
      if (!cv) return Promise.resolve(null);
      hints = loadDoc(cv.id).then(full => {
        if (!full) return null;
        const S = full.data.sections, items = [];
        S.habilitations.tags.filter(t => t.trim()).forEach(t => items.push(t));
        S.experiences.items.filter(i => i.title.trim()).forEach(i => items.push(i.title + (i.org ? ' chez ' + i.org : '')));
        S.competences.levels.filter(l => l.label.trim()).forEach(l => items.push(l.label));
        S.savoiretre.tags.filter(t => t.trim()).forEach(t => items.push(t));
        const text = S.experiences.items.map(i => i.desc).concat(S.profil.text).join('\n');
        return { items: [...new Set(items)].slice(0, 16), text, data: full.data };
      }).catch(() => null);
      return hints;
    }
    const prepare = async () => { const ticket = ++requestId; await flush(); editor?.destroy(); editor = null; current = null; return ticket; };

    // Accueil : 4 cartes, parcours en 4 étapes, conseils, puis les documents.
    async function showHome(note) {
      const ticket = await prepare();
      notify('Chargement de vos documents…');
      try { await loadList(); } catch (error) { if (ticket === requestId) notify('Documents indisponibles : ' + error.message); return; }
      if (ticket !== requestId || pane.hidden) return;
      hints = null;
      notify(note || 'Vos documents sont enregistrés automatiquement sur votre compte.');
      const cvs = docs.filter(d => d.kind === 'cv'), lms = docs.filter(d => d.kind === 'lm');
      const ago = row => row ? 'modifié le ' + dateFr.format(new Date(row.updated_at)) : '';
      const card = (icon, title, text, onclick) => el('button', { type: 'button', class: 'ot-new ot-card', onclick }, el('span', { class: 'ot-card-ico', 'aria-hidden': 'true', text: icon }), el('strong', { text: title }), el('span', { text }));
      const cards = el('div', { class: 'ot-intro ot-cards' },
        card('📄', 'Mon CV', cvs.length ? cvs.length + ' CV · ' + (cvs[0].title || 'CV') + ' · ' + ago(cvs[0]) : 'Partir d’un exemple professionnel ou d’une page vierge', () => cvs.length === 1 ? showDoc(cvs[0].id) : cvs.length ? document.getElementById('otCvList')?.scrollIntoView({ behavior: 'smooth' }) : showLibrary('examples')),
        card('✉', 'Mes lettres de motivation', lms.length ? lms.length + ' lettre' + (lms.length > 1 ? 's' : '') + ' : ' + lms.slice(0, 2).map(l => '« ' + (l.title || 'Lettre') + ' »').join(', ') : 'Stage, apprentissage, emploi… avec un modèle guidé', () => lms.length === 1 ? showDoc(lms[0].id) : lms.length ? document.getElementById('otLmList')?.scrollIntoView({ behavior: 'smooth' }) : createDoc('lm')),
        card('🎨', 'Bibliothèque de modèles', R.THEMES.length + ' thèmes, ' + (EX?.EXAMPLES.length || 0) + ' exemples de CV, ' + R.LAYOUTS.length + ' organisations de CV et ' + R.LETTER_LAYOUTS.length + ' de lettre', () => showLibrary()),
        card('⤓', 'Mes PDF', 'Générer le CV, la lettre ou les deux en un seul PDF A4', () => showPdf()));
      const steps = el('div', { class: 'ot-group' }, el('h3', { text: 'Le parcours en 4 étapes' }), el('ol', { class: 'ot-steps' },
        [['Je remplis mes informations', 'Identité, photo, formation, PFMP, compétences, langues, permis, loisirs.'],
          ['Je choisis un modèle et un thème', 'Partez d’un exemple professionnel, puis changez l’organisation et le thème quand vous voulez.'],
          ['J’écris ma lettre guidée', 'Vous · Moi · Nous · Conclusion, avec des phrases d’aide et les éléments repris de votre CV.'],
          ['Je vérifie et je génère mes PDF', 'Correcteur d’orthographe, relecture de l’enseignant, puis PDF A4 net, prêt à envoyer ou à imprimer.']]
          .map(([t, d]) => el('li', {}, el('strong', { text: t }), el('span', { text: d })))));
      const advice = el('div', { class: 'ot-group ot-advice' }, el('h3', { text: 'Conseils du professeur' }), el('ul', { class: 'ot-tips' },
        el('li', { text: 'Une page, des verbes d’action, vos habilitations (B1V, BR…) bien visibles.' }),
        el('li', { text: 'Mettez vos PFMP en avant : ce sont vos vraies expériences. Ajoutez des chiffres (« 8 tableaux câblés »).' }),
        el('li', { text: 'Une lettre par entreprise : citez-la et expliquez pourquoi vous la choisissez.' }),
        el('li', { text: 'Votre enseignant peut relire votre CV et laisser des remarques avant l’envoi : utilisez « Envoyer à l’enseignant ».' })));
      const docCard = row => el('div', { class: 'ot-doc' },
        el('span', { class: 'ot-doc-title', text: row.title || KIND[row.kind] }),
        el('span', { class: 'ot-doc-meta' }, el('span', { text: ago(row) }), statusChip(row.review_status)),
        row.teacher_comment ? el('span', { class: 'ot-doc-meta', text: '💬 ' + row.teacher_comment.slice(0, 120) + (row.teacher_comment.length > 120 ? '…' : '') }) : null,
        el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', text: 'Ouvrir', onclick: () => showDoc(row.id) }),
          el('button', { type: 'button', class: 'subtle', text: 'PDF', onclick: () => showPdf(row.kind === 'cv' ? { cv: row.id, what: 'cv' } : { lm: row.id, what: 'lm' }) }),
          el('button', { type: 'button', class: 'subtle', text: 'Dupliquer', onclick: () => duplicate(row) }),
          el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => remove(row) })));
      fill(content, cards, el('div', { class: 'ot-intro' }, steps, advice),
        el('div', { class: 'ot-toolbar', id: 'otCvList' }, el('h3', { text: 'Mes CV (' + cvs.length + ')' }),
          el('button', { type: 'button', class: 'subtle', text: '＋ Partir d’un exemple', onclick: () => showLibrary('examples') }),
          el('button', { type: 'button', class: 'subtle', text: '＋ CV vierge', onclick: () => createDoc('cv') })),
        cvs.length ? el('div', { class: 'ot-list' }, cvs.map(docCard)) : el('p', { class: 'ot-help', text: 'Aucun CV pour l’instant.' }),
        el('div', { class: 'ot-toolbar', id: 'otLmList' }, el('h3', { text: 'Mes lettres de motivation (' + lms.length + ')' }),
          el('button', { type: 'button', class: 'subtle', text: '＋ Nouvelle lettre', onclick: () => createDoc('lm') })),
        lms.length ? el('div', { class: 'ot-list' }, lms.map(docCard)) : el('p', { class: 'ot-help', text: 'Aucune lettre pour l’instant.' }));
    }

    // Bibliothèque : exemples de CV, thèmes, organisations du CV et de la lettre.
    async function showLibrary(tab) {
      const ticket = await prepare();
      if (tab) libTab = tab;
      if (!docs.length) { try { await loadList(); } catch { /* liste indisponible */ } }
      if (ticket !== requestId || pane.hidden) return;
      notify('');
      const cvs = docs.filter(d => d.kind === 'cv'), lms = docs.filter(d => d.kind === 'lm');
      const latest = cvs[0] ? await loadDoc(cvs[0].id).catch(() => null) : null;
      if (ticket !== requestId) return;
      const base = latest?.data || (EX ? EX.sampleCv(EX.EXAMPLES[0].id) : R.newCv({ first: 'Lucas', last: 'Martin' }));
      const tabsBar = el('div', { class: 'ot-tabs', role: 'tablist' }, [['examples', 'Exemples de CV (' + (EX?.EXAMPLES.length || 0) + ')'], ['themes', 'Thèmes (' + R.THEMES.length + ')'], ['cvlayouts', 'Organisations du CV (' + R.LAYOUTS.length + ')'], ['lmlayouts', 'Organisations de la lettre (' + R.LETTER_LAYOUTS.length + ')']]
        .map(([id, label]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(libTab === id), text: label, onclick: () => showLibrary(id) })));
      // Appliquer un thème ou une organisation à un document existant (ou en créer un).
      async function apply(kind, change, choice) {
        try {
          if (choice === 'new') { const who = await whoAmI(); const data = kind === 'cv' ? (latest ? JSON.parse(JSON.stringify(latest.data)) : R.newCv(who)) : R.newLetter(who); change(data); if (kind === 'lm' && latest) Object.assign(data.person, Object.fromEntries(Object.entries(latest.data.person).filter(([k, v]) => v && k in data.person))); return createDoc(kind, data); }
          const row = await loadDoc(choice); if (!row) return;
          change(row.data);
          await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: R.clean(row.kind, row.data) }) });
          await showDoc(row.id);
          notify('Modèle appliqué à « ' + (row.title || KIND[row.kind]) + ' » : vos textes n’ont pas changé.');
        } catch (error) { notify('Impossible d’appliquer le modèle : ' + error.message); }
      }
      const picker = (kind, change, label) => {
        const list = kind === 'cv' ? cvs : lms;
        const select = el('select', { 'aria-label': label }, el('option', { value: '', text: label + '…' }), list.map(d => el('option', { value: d.id, text: 'Appliquer à « ' + (d.title || KIND[d.kind]) + ' »' })), el('option', { value: 'new', text: kind === 'cv' ? '＋ Nouveau CV avec ce modèle' : '＋ Nouvelle lettre avec ce modèle' }));
        select.addEventListener('change', () => { if (select.value) apply(kind, change, select.value); });
        return select;
      };
      const grid = el('div', { class: 'ot-lib-grid' });
      const cards = [];
      if (libTab === 'examples' && EX) {
        for (const ex of EX.EXAMPLES) cards.push([EX.sampleCv(ex.id), 'cv', el('div', { class: 'ot-lib-info' },
          el('strong', { text: ex.name }), el('small', { text: ex.who + ' · thème ' + (R.THEMES.find(t => t.id === ex.theme)?.name || '') + ' · ' + (R.LAYOUTS.find(l => l.id === ex.layout)?.name || '') }),
          el('span', { class: 'ot-help', text: ex.desc }),
          el('button', { type: 'button', class: 'portal-button', text: 'Partir de cet exemple', onclick: async () => {
            const who = await whoAmI();
            const data = EX.cvFromExample(ex.id, who);
            await createDoc('cv', data, 'CV · ' + ex.name);
            notify('Exemple copié dans vos CV. Remplacez chaque expérience, entreprise et date par les vôtres : un CV doit être 100 % vrai.');
          } }))]);
      } else if (libTab === 'themes') {
        const filters = el('div', { class: 'ot-chips' }, [['', 'Tous'], ...R.THEME_LEVELS.map(l => [l, l]), ['ATS', 'Compatibles ATS']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(libFilter === v), text: t, onclick: () => { libFilter = v; showLibrary('themes'); } })));
        for (const t of R.THEMES.filter(t => !libFilter || t.level === libFilter || (libFilter === 'ATS' && t.ats))) {
          const data = { ...JSON.parse(JSON.stringify(base)), theme: t.id, accent: '' };
          cards.push([data, 'cv', el('div', { class: 'ot-lib-info' }, el('strong', { text: t.name + (t.ats ? ' · ATS ✓' : '') }), el('small', { text: t.level }), el('span', { class: 'ot-help', text: t.desc }),
            el('div', { class: 'ot-doc-actions' }, picker('cv', d => { d.theme = t.id; d.accent = ''; }, 'Pour un CV'), picker('lm', d => { d.theme = t.id; d.accent = ''; }, 'Pour une lettre')))]);
        }
        fill(content, tabsBar, el('p', { class: 'ot-help', text: latest ? 'Aperçus réalisés avec votre CV « ' + (latest.title || 'CV') + ' ».' : 'Aperçus réalisés avec un exemple.' }), filters, grid);
      } else if (libTab === 'cvlayouts') {
        for (const l of R.LAYOUTS) {
          const data = { ...JSON.parse(JSON.stringify(base)), layout: l.id };
          cards.push([data, 'cv', el('div', { class: 'ot-lib-info' }, el('strong', { text: l.name }), el('span', { class: 'ot-help', text: l.hint }), picker('cv', d => { d.layout = l.id; }, 'Utiliser'))]);
        }
      } else {
        for (const l of R.LETTER_LAYOUTS) {
          cards.push([sampleLetter(l.id, 'moderne', latest?.data), 'lm', el('div', { class: 'ot-lib-info' }, el('strong', { text: l.name }), el('span', { class: 'ot-help', text: l.hint }), picker('lm', d => { d.layout = l.id; }, 'Utiliser'))]);
        }
      }
      if (libTab !== 'themes') fill(content, tabsBar,
        el('p', { class: 'ot-help', text: libTab === 'examples' ? 'Des CV complets et réalistes pour vous inspirer. Les entreprises sont fictives : gardez la mise en page et la façon d’écrire, remplacez tout le reste par votre parcours.' : 'Thème et organisation se combinent librement : vos textes ne changent pas. « ATS ✓ » : lu sans erreur par les logiciels de tri des candidatures.' }), grid);
      content.prepend(el('div', { class: 'ot-toolbar' }, el('button', { type: 'button', text: '← Mes outils', onclick: () => showHome() }), el('strong', { text: 'Bibliothèque de modèles' })));
      await PDF.loadFonts();
      for (const [data, kind, info] of cards) {
        if (ticket !== requestId) return;
        const slot = el('div', { class: 'ot-thumb' });
        grid.append(el('div', { class: 'ot-lib-card' }, slot, info));
        await thumb(slot, data, kind, 200);
      }
    }

    // Mes PDF : CV, lettre ou les deux en un seul fichier, avec options.
    async function showPdf(preset = {}) {
      const ticket = await prepare();
      if (!docs.length) { try { await loadList(); } catch (error) { notify('Documents indisponibles : ' + error.message); return; } }
      await whoAmI();
      if (ticket !== requestId || pane.hidden) return;
      notify('');
      const cvs = docs.filter(d => d.kind === 'cv'), lms = docs.filter(d => d.kind === 'lm');
      const state = { what: preset.what || (cvs.length && lms.length ? 'both' : cvs.length ? 'cv' : 'lm'), cv: preset.cv || cvs[0]?.id || '', lm: preset.lm || lms[0]?.id || '', photo: true, fit: true, gray: false, name: '' };
      const result = el('div', { role: 'status', 'aria-live': 'polite' });
      const body = el('div', { class: 'ot-panel' });
      const defaultName = () => {
        const who = [me.first, me.last].filter(Boolean).join('_').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '-') || 'document';
        return (state.what === 'both' ? 'Candidature_' : state.what === 'cv' ? 'CV_' : 'Lettre_motivation_') + who + (state.gray ? '_NB' : '') + '.pdf';
      };
      function draw() {
        const select = (list, key, label) => el('label', { class: 'ot-field' }, el('span', { text: label }), (() => { const s = el('select', { onchange: e => { state[key] = e.target.value; } }, list.map(d => el('option', { value: d.id, text: d.title || KIND[d.kind], selected: d.id === state[key] }))); return s; })());
        const check = (key, label) => el('label', { class: 'ot-check' }, el('input', { type: 'checkbox', checked: state[key], onchange: e => { state[key] = e.target.checked; nameInput.placeholder = defaultName(); } }), el('span', { text: label }));
        const nameInput = el('input', { maxlength: 80, value: state.name, placeholder: defaultName(), 'aria-label': 'Nom du fichier', oninput: e => { state.name = e.target.value; } });
        const options = [['cv', 'Le CV', cvs.length], ['lm', 'La lettre', lms.length], ['both', 'CV + lettre (un seul PDF)', cvs.length && lms.length]];
        fill(body,
          el('div', { class: 'ot-group' }, el('h3', { text: 'Que voulez-vous générer ?' }),
            el('div', { class: 'ot-chips' }, options.map(([v, t, ok]) => el('button', { type: 'button', 'aria-pressed': String(state.what === v), disabled: !ok, text: t, onclick: () => { state.what = v; draw(); } }))),
            state.what !== 'lm' && cvs.length ? select(cvs, 'cv', 'CV') : null,
            state.what !== 'cv' && lms.length ? select(lms, 'lm', 'Lettre de motivation') : null,
            !cvs.length && !lms.length ? el('p', { class: 'ot-warn', text: 'Créez d’abord un CV ou une lettre.' }) : null),
          el('div', { class: 'ot-group' }, el('h3', { text: 'Options' }),
            state.what !== 'lm' ? check('photo', 'Inclure la photo d’identité') : null,
            state.what !== 'lm' ? check('fit', 'Tenir sur une page (réduit légèrement le texte si besoin)') : null,
            check('gray', 'Version noir et blanc pour l’impression'),
            el('label', { class: 'ot-field' }, el('span', { text: 'Nom du fichier' }), nameInput)),
          el('button', { type: 'button', class: 'portal-button ot-generate', text: '⬇ Générer et télécharger le PDF', disabled: !cvs.length && !lms.length, onclick: e => generate(e.target) }),
          result,
          el('p', { class: 'ot-help', text: 'Les PDF sont créés sur votre appareil ; vos données restent dans votre espace élève.' }));
      }
      async function generate(btn, again) {
        const opts = again || { ...state };
        const ids = opts.what === 'both' ? [['cv', opts.cv], ['lm', opts.lm]] : [[opts.what, opts[opts.what]]];
        btn.disabled = true; const label = btn.textContent; btn.textContent = 'Création du PDF…';
        try {
          const items = [];
          for (const [kind, id] of ids) { const row = await loadDoc(id); if (!row) throw new Error('document introuvable (supprimé ?)'); items.push({ kind, data: row.data }); }
          const res = await PDF.buildPdfs(items, { gray: opts.gray, photo: opts.photo, fit: opts.fit, author: [me.first, me.last].join(' ') });
          let name = (opts.name || '').trim() || defaultName();
          if (!/\.pdf$/i.test(name)) name += '.pdf';
          name = name.replace(/[\\/:*?"<>|]+/g, '-');
          PDF.save(res.blob, name);
          const size = Math.max(1, Math.round(res.blob.size / 1024)) + ' Ko';
          fill(result, el('p', { class: 'ot-ok', text: '✓ ' + name + ' créé (A4, ' + res.pages + ' page' + (res.pages > 1 ? 's' : '') + ', ' + size + '). Il est aussi rangé dans « Mes PDF » ci-dessous.' }));
          writeHistory([{ name, date: new Date().toISOString(), pages: res.pages, size, opts: { ...opts, name } }, ...readHistory().filter(h => h.name !== name)]);
          drawHistory();
        } catch (error) { fill(result, el('p', { class: 'ot-warn', text: 'PDF impossible : ' + error.message })); }
        btn.disabled = false; btn.textContent = label;
      }
      const historyBox = el('div', { class: 'ot-group' });
      function drawHistory() {
        const list = readHistory();
        fill(historyBox, el('h3', { text: 'Mes PDF (' + list.length + ')' }),
          list.length ? el('div', { class: 'ot-list' }, list.map(h => el('div', { class: 'ot-doc' }, el('span', { class: 'ot-doc-title', text: h.name }),
            el('span', { class: 'ot-doc-meta', text: dateFr.format(new Date(h.date)) + ' · ' + h.pages + ' page' + (h.pages > 1 ? 's' : '') + ' · ' + h.size + (h.opts.gray ? ' · noir et blanc' : '') }),
            el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', text: 'Télécharger à nouveau', title: 'Recrée le PDF avec la dernière version de vos documents', onclick: e => generate(e.target, h.opts) }),
              el('button', { type: 'button', class: 'subtle', text: 'Retirer de la liste', onclick: () => { writeHistory(readHistory().filter(x => x.name !== h.name)); drawHistory(); } })))))
            : el('p', { class: 'ot-help', text: 'Les PDF que vous créez apparaissent ici pour les retélécharger (toujours avec la dernière version de vos documents).' }));
      }
      draw(); drawHistory();
      fill(content, el('div', { class: 'ot-toolbar' }, el('button', { type: 'button', text: '← Mes outils', onclick: () => showHome() }), el('strong', { text: 'Mes PDF' })),
        el('div', { class: 'ot-intro' }, body, historyBox));
    }

    async function createDoc(kind, base, title) {
      try {
        const who = await whoAmI();
        const data = base ? R.clean(kind, base) : kind === 'cv' ? R.newCv(who) : R.newLetter(who);
        if (!base && kind === 'lm') {
          // Lettre : coordonnées et thème repris du CV le plus récent.
          const cv = docs.find(d => d.kind === 'cv');
          if (cv) { const full = await loadDoc(cv.id).catch(() => null); if (full) { Object.assign(data.person, Object.fromEntries(Object.entries(full.data.person).filter(([k, v]) => v && k in data.person))); for (const k of R.STYLE_KEYS) data[k] = full.data[k]; } }
        }
        const rows = await api.rest(TABLE + '?select=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ kind, title: (title || defaultTitle(kind, data)).slice(0, 120), data }) });
        try { await loadList(); } catch { /* liste rechargée plus tard */ }
        await showDoc(rows[0].id);
      } catch (error) { notify('Création impossible : ' + error.message); }
    }
    async function duplicate(row) {
      try { const full = await loadDoc(row.id); if (!full) return; await createDoc(full.kind, full.data, 'Copie de ' + (full.title || KIND[full.kind])); notify('Copie créée : adaptez-la à la nouvelle candidature.'); }
      catch (error) { notify('Copie impossible : ' + error.message); }
    }
    async function remove(row) {
      if (!confirm('Supprimer définitivement « ' + (row.title || KIND[row.kind]) + ' » ? Cette action est irréversible.')) return;
      try { await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' }); await showHome('Document supprimé.'); }
      catch (error) { notify('Suppression impossible : ' + error.message); }
    }
    async function showDoc(id) {
      const ticket = ++requestId;
      await flush();
      notify('Ouverture…');
      let row;
      try { row = await loadDoc(id); } catch (error) { notify('Document indisponible : ' + error.message); return; }
      if (!row) { notify('Ce document n’existe plus.'); return showHome(); }
      if (ticket !== requestId || pane.hidden) return;
      editor?.destroy();
      current = row; dirty = false;
      notify('');
      statusLine = el('span', { class: 'ot-help', role: 'status', text: '✓ Enregistré' });
      const title = el('input', { value: row.title, maxlength: 120, 'aria-label': 'Nom du document', class: 'ot-title-input', oninput: e => { row.title = e.target.value; markDirty(); } });
      const chip = statusChip(row.review_status);
      const sendBtn = el('button', { type: 'button', class: 'subtle', text: row.review_status === 'submitted' ? 'Envoyé ✓ (renvoyer)' : 'Envoyer à l’enseignant', onclick: async () => {
        const warn = editor.warnings();
        if (warn.length && !confirm(warn.join('\n') + '\n\nEnvoyer quand même à votre enseignant ?')) return;
        await flush();
        try {
          const rows = await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id) + '&select=review_status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ review_status: 'submitted' }) });
          row.review_status = rows[0]?.review_status || 'submitted';
          chip.replaceWith(statusChip(row.review_status));
          sendBtn.textContent = 'Envoyé ✓ (renvoyer)';
          notify('Document envoyé à votre enseignant pour relecture. Vous pouvez continuer à le modifier : il voit toujours la dernière version.');
        } catch (error) { notify('Envoi impossible : ' + error.message); }
      } });
      const pdfBtn = el('button', { type: 'button', class: 'portal-button', text: '⤓ Générer le PDF', onclick: async () => {
        const warn = editor.warnings();
        if (warn.length) notify('Attention : ' + warn.join(' '));
        pdfBtn.disabled = true; pdfBtn.textContent = 'Création du PDF…';
        try { await flush(); const res = await PDF.download(row.data, row.kind, { title: row.title, author: [row.data.person.first, row.data.person.last].join(' ') }); if (!warn.length) notify('PDF créé (' + res.pages + ' page' + (res.pages > 1 ? 's' : '') + ', ' + Math.max(1, Math.round(res.blob.size / 1024)) + ' Ko). Pour combiner CV et lettre ou imprimer en noir et blanc : « Mes PDF ».'); }
        catch (error) { notify('PDF impossible : ' + error.message); }
        pdfBtn.disabled = false; pdfBtn.textContent = '⤓ Générer le PDF';
      } });
      editor = createEditor({ doc: row, onChange: markDirty, cvList: () => docs.filter(d => d.kind === 'cv' && d.id !== row.id), loadDoc, notify, cvHints: () => row.kind === 'lm' ? cvHints() : Promise.resolve(null), openLibrary: () => showLibrary(row.kind === 'cv' ? 'themes' : 'lmlayouts') });
      const review = row.teacher_comment || row.review_status === 'changes' || row.review_status === 'approved'
        ? el('div', { class: 'ot-review' }, el('strong', { text: 'Avis de votre enseignant · ' + STATUS[row.review_status] + (row.reviewed_at ? ' · ' + dateFr.format(new Date(row.reviewed_at)) : '') }), row.teacher_comment ? el('p', { text: row.teacher_comment }) : null) : null;
      fill(content,
        el('div', { class: 'ot-toolbar' }, el('button', { type: 'button', text: '← Mes outils', onclick: () => showHome() }), el('strong', { text: KIND[row.kind] }), chip, statusLine,
          el('button', { type: 'button', class: 'subtle', text: '🎨 Bibliothèque', onclick: () => showLibrary(row.kind === 'cv' ? 'themes' : 'lmlayouts') }),
          el('button', { type: 'button', class: 'subtle', text: '⤓ Mes PDF', onclick: async () => { await flush(); showPdf(row.kind === 'cv' ? { cv: row.id, what: 'cv' } : { lm: row.id, what: 'lm' }); } })),
        el('div', { class: 'ot-toolbar' }, el('label', { class: 'ot-field', style: 'flex:1 1 260px' }, el('span', { text: 'Nom du document (pour vous retrouver)' }), title), sendBtn, pdfBtn),
        review, editor.node);
    }
    function markDirty() { dirty = true; if (statusLine) statusLine.textContent = 'Modifications non enregistrées…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 1200); }
    function save() {
      clearTimeout(saveTimer); saveTimer = null;
      const row = current;
      if (!row || !dirty) return saving;
      dirty = false;
      saving = saving.catch(() => {}).then(async () => {
        if (statusLine) statusLine.textContent = 'Enregistrement…';
        const body = JSON.stringify({ title: (row.title || '').slice(0, 120), data: R.clean(row.kind, row.data) });
        const rows = await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id) + '&select=id,updated_at', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body });
        if (!rows.length) { if (current === row) notify('Ce document n’existe plus (supprimé ?).'); return; }
        const summary = docs.find(d => d.id === row.id);
        if (summary) { summary.title = row.title; summary.updated_at = rows[0].updated_at; }
        if (row.kind === 'cv') hints = null;
        if (statusLine && current === row && !dirty) statusLine.textContent = '✓ Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }).catch(error => {
        dirty = true;
        if (statusLine && current === row) statusLine.textContent = 'Échec de l’enregistrement : ' + error.message + ' — nouvel essai dans 5 s.';
        clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 5000);
      });
      return saving;
    }
    function flush() { return dirty ? save() : saving.catch(() => {}); }
    button.addEventListener('click', () => { if (pane.hidden) open(); else if (tpRunning()) close(); });
    tabs.addEventListener('click', event => { const target = event.target.closest('button'); if (target && target !== button && !pane.hidden && !tpRunning()) close(); }, true);
    new MutationObserver(() => { if (!tp.hidden && !pane.hidden && !tpRunning()) close(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
    // Déconnexion : plus rien en mémoire.
    const forget = () => { close(); fill(content); docs = []; current = null; me = null; hints = null; };
    new MutationObserver(() => { if (dashboard.hidden || tabs.hidden) forget(); }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => { if (tabs.hidden) forget(); }).observe(tabs, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('studentRefresh')?.addEventListener('click', () => { if (!pane.hidden) close(); }, true);
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) save(); });
  }

  // ───── Espace enseignant : onglet « CV et lettres » ─────
  async function renderTeacher(host, context) {
    const api = window.MelecPortal;
    const status = context.status || (() => {});
    const ticket = host.dataset.outilsTicket = String(Number(host.dataset.outilsTicket || 0) + 1);
    const live = () => host.isConnected && host.dataset.outilsTicket === ticket;
    const filter = host.dataset.outilsFilter || 'submitted';
    fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'Chargement des CV et lettres…' })));
    let students, docs;
    try {
      const classFilter = context.classId ? '&class_id=eq.' + encodeURIComponent(context.classId) : '';
      students = await api.rest('student_profiles?select=user_id,last_name,first_name,class_id' + classFilter + '&order=last_name.asc,first_name.asc');
      const ids = students.map(s => s.user_id);
      docs = !ids.length ? [] : await api.rest(TABLE + '?select=' + LIST_FIELDS + '&student_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&order=updated_at.desc');
    } catch (error) {
      if (live()) fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'CV et lettres indisponibles : ' + error.message })));
      return;
    }
    if (!live()) return;
    const byId = new Map(students.map(s => [s.user_id, s]));
    const name = s => s ? s.last_name + ' ' + s.first_name : 'Élève inconnu';
    const className = id => context.classes?.find(c => c.id === id)?.name || '';
    const shown = docs.filter(d => filter === 'all' || d.review_status === filter);
    const counts = docs.reduce((acc, d) => { acc[d.review_status] = (acc[d.review_status] || 0) + 1; return acc; }, {});
    const viewer = el('div', { class: 'ot-teacher-viewer' });
    const filters = el('div', { class: 'ot-doc-actions' }, [['submitted', 'À relire'], ['changes', 'À corriger'], ['approved', 'Validés'], ['draft', 'Brouillons'], ['all', 'Tous']].map(([value, label]) =>
      el('button', { type: 'button', class: filter === value ? '' : 'subtle', 'aria-pressed': String(filter === value), text: label + ' (' + (value === 'all' ? docs.length : counts[value] || 0) + ')', onclick: () => { host.dataset.outilsFilter = value; renderTeacher(host, context); } })));
    const table = el('div', { class: 'devis-table-wrap' }, el('table', { class: 'devis-table devis-teacher-table' },
      el('thead', {}, el('tr', {}, ['Élève', 'Document', 'Type', 'Modifié le', 'État', ''].map(text => el('th', { text })))),
      el('tbody', {}, shown.length ? shown.map(row => {
        const s = byId.get(row.student_id);
        return el('tr', {},
          el('td', {}, el('strong', { text: name(s) }), s?.class_id && !context.classId ? el('div', { class: 'devis-hint', text: className(s.class_id) }) : null),
          el('td', { text: row.title || '—' }), el('td', { text: KIND[row.kind] }), el('td', { text: dateFr.format(new Date(row.updated_at)) }),
          el('td', {}, statusChip(row.review_status)),
          el('td', {}, el('button', { type: 'button', class: 'subtle', text: 'Ouvrir', onclick: () => openDoc(row, s) })));
      }) : el('tr', {}, el('td', { colspan: 6, text: 'Aucun document dans cette catégorie.' })))));
    async function openDoc(summary, student) {
      fill(viewer, el('p', { text: 'Ouverture…' }));
      try {
        const row = (await api.rest(TABLE + '?id=eq.' + encodeURIComponent(summary.id) + '&select=*'))[0];
        if (!row) { fill(viewer, el('p', { text: 'Ce document n’existe plus.' })); return; }
        const data = R.clean(row.kind, row.data);
        const pageHost = el('div');
        const scaleBox = el('div', { class: 'ot-scale' }, pageHost);
        const stage = el('div', { class: 'ot-stage' }, scaleBox);
        const comment = el('textarea', { maxlength: 4000, rows: 8, spellcheck: 'true', lang: 'fr', 'aria-label': 'Commentaire pour l’élève', placeholder: 'Ex. : Ajoute les dates de ta PFMP et détaille tes missions avec des verbes d’action.' });
        comment.value = row.teacher_comment || '';
        const answer = async (state) => {
          try {
            await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_status: state, teacher_comment: comment.value.slice(0, 4000) }) });
            status(state === 'approved' ? 'Document validé : l’élève voit votre avis.' : 'Avis envoyé : l’élève voit votre commentaire.');
            renderTeacher(host, context);
          } catch (error) { status(error.message, true); }
        };
        fill(viewer, el('div', { class: 'teach-card ot-teacher' },
          el('div', { class: 'devis-toolbar' }, el('h3', { text: KIND[row.kind] + ' · ' + name(student) + ' · ' + (row.title || '') }),
            el('button', { type: 'button', class: 'subtle', text: '⤓ PDF', onclick: async e => { e.target.disabled = true; try { await PDF.download(data, row.kind, { title: row.title, author: name(student) }); } catch (error) { status(error.message, true); } e.target.disabled = false; } }),
            el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => fill(viewer) })),
          el('div', { class: 'ot-teacher-view' }, stage, el('div', { class: 'ot-panel' },
            el('p', { class: 'teach-help', text: 'État : ' + STATUS[row.review_status] + (row.submitted_at ? ' · envoyé le ' + dateFr.format(new Date(row.submitted_at)) : '') }),
            el('label', { class: 'ot-field' }, el('span', { text: 'Votre commentaire' }), comment),
            el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'warn', text: 'À corriger', onclick: () => answer('changes') }), el('button', { type: 'button', text: 'Valider', onclick: () => answer('approved') })),
            el('p', { class: 'teach-help', text: 'L’élève voit votre commentaire en haut de son document. Vous ne pouvez pas modifier son contenu.' })))));
        await PDF.loadFonts();
        await PDF.useFonts(data);
        const page = row.kind === 'cv' ? R.renderCv(data) : R.renderLetter(data);
        await PDF.mount(pageHost, page);
        const info = PDF.layout(page, data, row.kind);
        const scale = Math.min(1, ((stage.clientWidth || 640) - 24) / R.PAGE_W);
        scaleBox.style.transform = 'scale(' + scale + ')'; scaleBox.style.width = R.PAGE_W + 'px';
        stage.style.height = (info.pages * R.PAGE_H * scale + 24) + 'px';
        viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) { fill(viewer, el('p', { text: 'Document indisponible : ' + error.message })); }
    }
    fill(host, el('div', { class: 'teach-card ot-teacher' },
      el('div', { class: 'devis-toolbar' }, el('h2', { text: 'CV et lettres de motivation' }), el('button', { type: 'button', class: 'subtle', text: '↻ Actualiser', onclick: () => renderTeacher(host, context) })),
      el('p', { class: 'teach-help', text: (context.classId ? 'Classe ' + className(context.classId) + ' · ' : 'Toutes les classes · ') + docs.length + ' document(s). Les élèves envoient leurs CV et lettres pour relecture : répondez par un commentaire, « À corriger » ou « Valider ».' }),
      filters, table), viewer);
  }

  window.MelecOutils = { renderTeacher, checkTexts, createEditor };
  if (document.getElementById('studentContentTabs')) initStudent();
})();
